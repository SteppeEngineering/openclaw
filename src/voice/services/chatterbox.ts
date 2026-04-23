/**
 * Chatterbox Text-to-Speech Service
 * 
 * Production TTS client with voice cloning, memory management, and format conversion.
 * Implements TOOLS.md workflow: memory reset → upload voice → generate → convert.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { readFile, writeFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import FormData from 'form-data';
import type { VoiceConfig } from '../voice-config';

const execFileAsync = promisify(execFile);

/**
 * TTS generation options
 */
export interface TTSOptions {
  /** Text to convert to speech (max 3000 chars) */
  text: string;
  /** Voice exaggeration level (0-1) */
  exaggeration?: number;
  /** CFG weight (0-1) */
  cfgWeight?: number;
  /** Temperature (0-1) */
  temperature?: number;
  /** Output audio format */
  outputFormat?: 'wav' | 'opus';
  /** Request timeout in ms */
  timeoutMs?: number;
}

/**
 * TTS generation result
 */
export interface TTSResult {
  /** Audio buffer (WAV or Opus) */
  audioBuffer: Buffer;
  /** Audio format */
  format: 'wav' | 'opus';
  /** Duration in seconds (if available) */
  duration?: number;
  /** Generation time in ms */
  generationTimeMs: number;
}

/**
 * Retry configuration
 */
interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
};

/**
 * Chatterbox TTS service client
 */
export class ChatterboxService {
  private readonly config: VoiceConfig['services']['chatterbox'];
  private readonly retryConfig: RetryConfig;
  private requestCount = 0;
  private lastMemoryReset = 0;
  private readonly resetInterval: number;

  constructor(
    config: VoiceConfig['services']['chatterbox'],
    resetInterval: number = 2,
    retryConfig: Partial<RetryConfig> = {}
  ) {
    this.config = config;
    this.resetInterval = resetInterval;
    this.retryConfig = { ...DEFAULT_RETRY_CONFIG, ...retryConfig };
  }

  /**
   * Generate speech from text
   */
  async generateSpeech(options: TTSOptions): Promise<TTSResult> {
    const startTime = Date.now();

    // Validate input length
    if (options.text.length > 3000) {
      throw new Error(
        `Text exceeds Chatterbox limit (${options.text.length} > 3000 chars). ` +
        'Split into multiple requests.'
      );
    }

    if (!options.text.trim()) {
      throw new Error('Text cannot be empty');
    }

    const opts = {
      exaggeration: options.exaggeration ?? this.config.exaggeration,
      cfgWeight: options.cfgWeight ?? this.config.cfgWeight,
      temperature: options.temperature ?? this.config.temperature,
      outputFormat: options.outputFormat ?? 'wav',
      timeoutMs: options.timeoutMs ?? 60000,
    };

    // Reset memory if needed (prevents Errno 22)
    await this.maybeResetMemory();

    // Generate TTS with retry
    const wavBuffer = await this.withRetry(async () => {
      return this.generateTTS(options.text, opts);
    });

    // Convert format if needed
    let finalBuffer = wavBuffer;
    if (opts.outputFormat === 'opus') {
      finalBuffer = await this.convertToOpus(wavBuffer);
    }

    const generationTimeMs = Date.now() - startTime;

    return {
      audioBuffer: finalBuffer,
      format: opts.outputFormat,
      generationTimeMs,
    };
  }

  /**
   * Generate TTS from Chatterbox API
   */
  private async generateTTS(
    text: string,
    opts: Pick<TTSOptions, 'exaggeration' | 'cfgWeight' | 'temperature' | 'timeoutMs'>
  ): Promise<Buffer> {
    this.requestCount++;

    // Read voice sample
    const voiceSampleBuffer = await readFile(this.config.voiceSamplePath).catch(err => {
      throw new Error(
        `Failed to read voice sample at ${this.config.voiceSamplePath}: ${err.message}`
      );
    });

    // Build multipart form data
    const form = new FormData();
    form.append('input', text);
    form.append('voice_file', voiceSampleBuffer, {
      filename: 'voice_sample.wav',
      contentType: 'audio/wav',
    });
    form.append('exaggeration', String(opts.exaggeration));
    form.append('cfg_weight', String(opts.cfgWeight));
    form.append('temperature', String(opts.temperature));

    const url = `${this.config.baseUrl}/audio/speech/upload`;

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), opts.timeoutMs || 60000);

    try {
      const response = await fetch(url, {
        method: 'POST',
        body: form as any, // FormData types are compatible
        headers: form.getHeaders(),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText);
        throw new Error(
          `Chatterbox API error (${response.status}): ${errorText}`
        );
      }

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);

    } catch (error) {
      clearTimeout(timeout);
      
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Chatterbox request timeout after ${opts.timeoutMs}ms`);
      }
      
      throw error;
    }
  }

  /**
   * Convert WAV to Opus using ffmpeg
   */
  private async convertToOpus(wavBuffer: Buffer): Promise<Buffer> {
    // Create temporary files
    const tmpPrefix = join(tmpdir(), `chatterbox-${Date.now()}`);
    const wavPath = `${tmpPrefix}.wav`;
    const opusPath = `${tmpPrefix}.opus`;

    try {
      // Write WAV to temp file
      await writeFile(wavPath, wavBuffer);

      // Convert using ffmpeg
      await execFileAsync('ffmpeg', [
        '-y',                    // Overwrite output
        '-i', wavPath,           // Input WAV
        '-c:a', 'libopus',       // Opus codec
        '-b:a', '64k',           // 64 kbps bitrate
        opusPath,                // Output Opus
      ]);

      // Read Opus file
      const opusBuffer = await readFile(opusPath);
      
      return opusBuffer;

    } finally {
      // Clean up temp files
      await unlink(wavPath).catch(() => {});
      await unlink(opusPath).catch(() => {});
    }
  }

  /**
   * Reset Chatterbox memory to prevent Errno 22
   * 
   * Chatterbox accumulates memory state that causes errors after 2-3 generations.
   * Reset memory periodically based on resetInterval.
   */
  private async maybeResetMemory(): Promise<void> {
    const shouldReset = (this.requestCount - this.lastMemoryReset) >= this.resetInterval;
    
    if (!shouldReset) {
      return;
    }

    const url = `${this.config.baseUrl}/memory/reset?confirm=true`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        timeout: 5000,
      } as any);

      if (!response.ok) {
        console.warn(
          `Chatterbox memory reset failed (${response.status}). Continuing anyway...`
        );
      } else {
        this.lastMemoryReset = this.requestCount;
        console.log('Chatterbox memory reset successfully');
      }
    } catch (error) {
      console.warn(
        'Chatterbox memory reset failed:',
        error instanceof Error ? error.message : String(error)
      );
      // Don't throw - memory reset failure is not critical
    }
  }

  /**
   * Manually reset Chatterbox memory
   */
  async resetMemory(): Promise<void> {
    const url = `${this.config.baseUrl}/memory/reset?confirm=true`;

    const response = await fetch(url, {
      method: 'POST',
      timeout: 5000,
    } as any);

    if (!response.ok) {
      throw new Error(`Memory reset failed (${response.status}): ${response.statusText}`);
    }

    this.lastMemoryReset = this.requestCount;
  }

  /**
   * Execute function with retry logic
   */
  private async withRetry<T>(
    fn: () => Promise<T>,
    attempt: number = 0
  ): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      const isRetriable = this.isRetriableError(error);
      const canRetry = attempt < this.retryConfig.maxRetries;

      if (!isRetriable || !canRetry) {
        throw error;
      }

      // Calculate backoff delay
      const delay = Math.min(
        this.retryConfig.initialDelayMs * Math.pow(this.retryConfig.backoffMultiplier, attempt),
        this.retryConfig.maxDelayMs
      );

      console.warn(
        `Chatterbox request failed (attempt ${attempt + 1}/${this.retryConfig.maxRetries}). ` +
        `Retrying in ${delay}ms...`,
        error instanceof Error ? error.message : String(error)
      );

      await this.sleep(delay);
      return this.withRetry(fn, attempt + 1);
    }
  }

  /**
   * Determine if error is retriable
   */
  private isRetriableError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }

    const message = error.message.toLowerCase();
    
    // Network errors are retriable
    if (
      message.includes('network') ||
      message.includes('econnrefused') ||
      message.includes('econnreset') ||
      message.includes('etimedout')
    ) {
      return true;
    }

    // HTTP 5xx errors are retriable
    if (message.includes('500') || message.includes('502') || message.includes('503')) {
      return true;
    }

    // Errno 22 is the memory error - reset and retry
    if (message.includes('errno 22') || message.includes('invalid argument')) {
      // Force memory reset on next attempt
      this.lastMemoryReset = 0;
      return true;
    }

    // Timeout is retriable
    if (message.includes('timeout')) {
      return true;
    }

    return false;
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get service statistics
   */
  getStats() {
    return {
      requestCount: this.requestCount,
      lastMemoryReset: this.lastMemoryReset,
      resetInterval: this.resetInterval,
      retryConfig: this.retryConfig,
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.requestCount = 0;
    this.lastMemoryReset = 0;
  }

  /**
   * Check if Chatterbox server is reachable
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.baseUrl}/health`, {
        method: 'GET',
        timeout: 3000,
      } as any);
      
      return response.ok;
    } catch {
      return false;
    }
  }
}

/**
 * Create Chatterbox service instance from voice config
 */
export function createChatterboxService(
  config: VoiceConfig,
  retryConfig?: Partial<RetryConfig>
): ChatterboxService {
  return new ChatterboxService(
    config.services.chatterbox,
    config.behavior.ttsResetInterval,
    retryConfig
  );
}
