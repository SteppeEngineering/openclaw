/**
 * Deepgram Speech-to-Text Service
 * 
 * Production STT client with error handling, retries, and audio format support.
 * See: https://developers.deepgram.com/docs/getting-started-with-pre-recorded-audio
 */

import type { VoiceConfig } from '../voice-config';

/**
 * Deepgram API response structure
 */
interface DeepgramResponse {
  metadata: {
    transaction_key: string;
    request_id: string;
    sha256: string;
    created: string;
    duration: number;
    channels: number;
  };
  results: {
    channels: Array<{
      alternatives: Array<{
        transcript: string;
        confidence: number;
        words?: Array<{
          word: string;
          start: number;
          end: number;
          confidence: number;
        }>;
      }>;
    }>;
  };
}

/**
 * Deepgram error response
 */
interface DeepgramError {
  err_code: string;
  err_msg: string;
  request_id?: string;
}

/**
 * Transcription options
 */
export interface TranscriptionOptions {
  /** Model to use (default: nova-3) */
  model?: string;
  /** Enable smart formatting */
  smartFormat?: boolean;
  /** Language code (default: auto-detect) */
  language?: string;
  /** Enable punctuation */
  punctuate?: boolean;
  /** Enable profanity filtering */
  profanityFilter?: boolean;
  /** Request timeout in ms */
  timeoutMs?: number;
}

/**
 * Transcription result
 */
export interface TranscriptionResult {
  /** Transcribed text */
  text: string;
  /** Confidence score (0-1) */
  confidence: number;
  /** Duration of audio in seconds */
  duration: number;
  /** Request ID for debugging */
  requestId: string;
}

/**
 * Retry configuration
 */
interface RetryConfig {
  /** Maximum number of retry attempts */
  maxRetries: number;
  /** Initial retry delay in ms */
  initialDelayMs: number;
  /** Maximum retry delay in ms */
  maxDelayMs: number;
  /** Backoff multiplier */
  backoffMultiplier: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 500,
  maxDelayMs: 5000,
  backoffMultiplier: 2,
};

/**
 * Deepgram STT service client
 */
export class DeepgramService {
  private readonly config: VoiceConfig['services']['deepgram'];
  private readonly apiKey: string;
  private readonly retryConfig: RetryConfig;
  private requestCount = 0;

  constructor(
    config: VoiceConfig['services']['deepgram'],
    retryConfig: Partial<RetryConfig> = {}
  ) {
    this.config = config;
    this.retryConfig = { ...DEFAULT_RETRY_CONFIG, ...retryConfig };

    // Get API key from config or environment
    this.apiKey = config.apiKey || process.env.DEEPGRAM_API_KEY || '';
    
    if (!this.apiKey) {
      throw new Error('Deepgram API key not configured. Set DEEPGRAM_API_KEY environment variable.');
    }
  }

  /**
   * Transcribe audio buffer to text
   */
  async transcribe(
    audioBuffer: Buffer,
    options: TranscriptionOptions = {}
  ): Promise<TranscriptionResult> {
    const opts = {
      model: options.model || this.config.model,
      smartFormat: options.smartFormat ?? this.config.smartFormat,
      punctuate: options.punctuate ?? true,
      language: options.language,
      profanityFilter: options.profanityFilter ?? false,
      timeoutMs: options.timeoutMs ?? 30000,
    };

    // Build query parameters
    const params = new URLSearchParams({
      model: opts.model,
      smart_format: String(opts.smartFormat),
      punctuate: String(opts.punctuate),
    });

    if (opts.language) {
      params.set('language', opts.language);
    }

    if (opts.profanityFilter) {
      params.set('profanity_filter', 'true');
    }

    const url = `${this.config.endpoint}?${params.toString()}`;

    // Retry with exponential backoff
    return this.withRetry(async () => {
      this.requestCount++;
      
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), opts.timeoutMs);

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Token ${this.apiKey}`,
            'Content-Type': this.detectContentType(audioBuffer),
          },
          body: audioBuffer,
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!response.ok) {
          const errorBody = await response.json().catch(() => ({})) as DeepgramError;
          throw new Error(
            `Deepgram API error (${response.status}): ${errorBody.err_msg || response.statusText}`
          );
        }

        const data = await response.json() as DeepgramResponse;

        // Extract transcript from response
        const channel = data.results.channels[0];
        if (!channel || !channel.alternatives || channel.alternatives.length === 0) {
          throw new Error('No transcription alternatives in Deepgram response');
        }

        const alternative = channel.alternatives[0];
        
        return {
          text: alternative.transcript,
          confidence: alternative.confidence,
          duration: data.metadata.duration,
          requestId: data.metadata.request_id,
        };

      } catch (error) {
        clearTimeout(timeout);
        
        if (error instanceof Error && error.name === 'AbortError') {
          throw new Error(`Deepgram request timeout after ${opts.timeoutMs}ms`);
        }
        
        throw error;
      }
    });
  }

  /**
   * Detect audio content type from buffer
   */
  private detectContentType(buffer: Buffer): string {
    // Check magic bytes for common audio formats
    const magicBytes = buffer.slice(0, 12);
    
    // WAV: RIFF....WAVE
    if (
      magicBytes[0] === 0x52 && magicBytes[1] === 0x49 &&
      magicBytes[2] === 0x46 && magicBytes[3] === 0x46 &&
      magicBytes[8] === 0x57 && magicBytes[9] === 0x41 &&
      magicBytes[10] === 0x56 && magicBytes[11] === 0x45
    ) {
      return 'audio/wav';
    }
    
    // Opus/Ogg: OggS
    if (
      magicBytes[0] === 0x4F && magicBytes[1] === 0x67 &&
      magicBytes[2] === 0x67 && magicBytes[3] === 0x53
    ) {
      return 'audio/ogg';
    }
    
    // MP3: ID3 or 0xFF 0xFB
    if (
      (magicBytes[0] === 0x49 && magicBytes[1] === 0x44 && magicBytes[2] === 0x33) ||
      (magicBytes[0] === 0xFF && magicBytes[1] === 0xFB)
    ) {
      return 'audio/mpeg';
    }
    
    // FLAC: fLaC
    if (
      magicBytes[0] === 0x66 && magicBytes[1] === 0x4C &&
      magicBytes[2] === 0x61 && magicBytes[3] === 0x43
    ) {
      return 'audio/flac';
    }
    
    // Default to WAV (Deepgram accepts most formats)
    return 'audio/wav';
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
        `Deepgram request failed (attempt ${attempt + 1}/${this.retryConfig.maxRetries}). ` +
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

    // Rate limit errors are retriable
    if (message.includes('429') || message.includes('rate limit')) {
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
      retryConfig: this.retryConfig,
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.requestCount = 0;
  }
}

/**
 * Create Deepgram service instance from voice config
 */
export function createDeepgramService(
  config: VoiceConfig,
  retryConfig?: Partial<RetryConfig>
): DeepgramService {
  return new DeepgramService(config.services.deepgram, retryConfig);
}
