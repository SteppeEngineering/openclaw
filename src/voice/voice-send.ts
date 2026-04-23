/**
 * Voice Send - Outbound Message Delivery
 * 
 * Handles outbound message delivery via:
 * - Text-to-speech (Chatterbox TTS)
 * - Audio playback
 * - Display updates
 * - Error handling and retries
 */

import { exec as execCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFileSync, unlinkSync, existsSync } from 'node:fs';
import type { VoiceHardware } from './hardware/types';
import type { VoiceBot } from './voice-bot';

const exec = promisify(execCallback);

/**
 * TTS generation result
 */
export interface TTSResult {
  /** Audio buffer (Opus format for efficient playback) */
  audioBuffer: Buffer;
  /** Format (wav or opus) */
  format: 'wav' | 'opus';
  /** Generation time (ms) */
  generationTime: number;
}

/**
 * Generate TTS audio using Chatterbox
 * 
 * Follows the Chatterbox workflow from TOOLS.md:
 * 1. Reset memory (prevents Errno 22 after 2-3 generations)
 * 2. Generate TTS via /audio/speech/upload endpoint
 * 3. Convert WAV → Opus for efficient playback
 * 
 * @param text - Text to convert to speech
 * @param bot - Voice bot instance (for config and TTS counter)
 * @returns TTS audio result
 */
export async function generateTTS(
  text: string,
  bot: VoiceBot
): Promise<TTSResult> {
  const config = bot.getConfig();
  const { chatterbox } = config.services;
  const startTime = Date.now();
  
  // Check voice sample file exists
  if (!existsSync(chatterbox.voiceSamplePath)) {
    throw new Error(`Voice sample not found: ${chatterbox.voiceSamplePath}`);
  }
  
  console.log(`[TTS] Generating speech for: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);
  
  // Truncate text if too long (Chatterbox max: 3000 chars)
  const maxChars = 3000;
  const truncatedText = text.length > maxChars 
    ? text.substring(0, maxChars - 3) + '...'
    : text;
  
  try {
    // Step 1: Reset Chatterbox memory if needed
    const ttsCount = bot.getTTSRequestCount();
    if (ttsCount > 0 && ttsCount % config.behavior.ttsResetInterval === 0) {
      console.log(`[TTS] Resetting Chatterbox memory (request #${ttsCount})`);
      await resetChatterboxMemory(chatterbox.baseUrl);
    }
    
    // Step 2: Generate TTS
    const wavPath = '/tmp/voice-response.wav';
    const opusPath = '/tmp/voice-response.opus';
    
    await generateChatterboxAudio(
      truncatedText,
      chatterbox.baseUrl,
      chatterbox.voiceSamplePath,
      wavPath,
      chatterbox.exaggeration,
      chatterbox.cfgWeight,
      chatterbox.temperature
    );
    
    // Increment TTS request counter
    bot.incrementTTSRequestCount();
    
    // Step 3: Convert WAV → Opus
    await convertWavToOpus(wavPath, opusPath);
    
    // Read Opus file
    const fs = await import('node:fs/promises');
    const audioBuffer = await fs.readFile(opusPath);
    
    // Clean up temp files
    try {
      unlinkSync(wavPath);
      unlinkSync(opusPath);
    } catch (err) {
      console.warn('[TTS] Failed to clean up temp files:', err);
    }
    
    const generationTime = Date.now() - startTime;
    console.log(`[TTS] Generated ${audioBuffer.length} bytes in ${generationTime}ms`);
    
    return {
      audioBuffer,
      format: 'opus',
      generationTime,
    };
    
  } catch (error) {
    console.error('[TTS] Generation failed:', error);
    throw new Error(`TTS generation failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Reset Chatterbox memory
 */
async function resetChatterboxMemory(baseUrl: string): Promise<void> {
  try {
    const response = await fetch(`${baseUrl}/memory/reset?confirm=true`, {
      method: 'POST',
    });
    
    if (!response.ok) {
      throw new Error(`Memory reset failed: ${response.status} ${response.statusText}`);
    }
    
    console.log('[TTS] Chatterbox memory reset successful');
  } catch (error) {
    console.warn('[TTS] Memory reset failed (non-fatal):', error);
    // Non-fatal - continue anyway
  }
}

/**
 * Generate audio via Chatterbox upload endpoint
 */
async function generateChatterboxAudio(
  text: string,
  baseUrl: string,
  voiceSamplePath: string,
  outputPath: string,
  exaggeration: number,
  cfgWeight: number,
  temperature: number
): Promise<void> {
  // Use curl for multipart/form-data upload (easier than FormData in Node)
  const curlCmd = [
    'curl',
    '-s',
    '-X POST',
    `"${baseUrl}/audio/speech/upload"`,
    `-F "input=${text}"`,
    `-F "voice_file=@${voiceSamplePath}"`,
    `-F "exaggeration=${exaggeration}"`,
    `-F "cfg_weight=${cfgWeight}"`,
    `-F "temperature=${temperature}"`,
    `--output "${outputPath}"`,
  ].join(' ');
  
  console.log('[TTS] Calling Chatterbox...');
  
  const { stdout, stderr } = await exec(curlCmd);
  
  if (stderr && !stderr.includes('% Total')) {
    console.warn('[TTS] Chatterbox stderr:', stderr);
  }
  
  // Verify output file exists
  if (!existsSync(outputPath)) {
    throw new Error('Chatterbox did not generate output file');
  }
  
  console.log('[TTS] Chatterbox generation complete');
}

/**
 * Convert WAV to Opus using ffmpeg
 */
async function convertWavToOpus(wavPath: string, opusPath: string): Promise<void> {
  const ffmpegCmd = [
    'ffmpeg',
    '-y',
    `-i "${wavPath}"`,
    '-c:a libopus',
    '-b:a 64k',
    `"${opusPath}"`,
  ].join(' ');
  
  console.log('[TTS] Converting WAV → Opus...');
  
  const { stdout, stderr } = await exec(ffmpegCmd);
  
  // ffmpeg writes to stderr even on success
  if (stderr && stderr.includes('Error')) {
    console.warn('[TTS] FFmpeg stderr:', stderr);
  }
  
  // Verify output
  if (!existsSync(opusPath)) {
    throw new Error('FFmpeg conversion failed - no output file');
  }
  
  console.log('[TTS] Conversion complete');
}

/**
 * Play audio through hardware audio device
 * 
 * @param audioBuffer - Audio data (Opus format)
 * @param hardware - Hardware interface
 * @param format - Audio format
 */
export async function playAudio(
  audioBuffer: Buffer,
  hardware: VoiceHardware,
  format: 'wav' | 'opus' = 'opus'
): Promise<void> {
  console.log(`[Audio] Playing ${audioBuffer.length} bytes (${format})...`);
  
  try {
    await hardware.audio.playAudio(audioBuffer, format);
    console.log('[Audio] Playback complete');
    
  } catch (error) {
    console.error('[Audio] Playback failed:', error);
    throw new Error(`Audio playback failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Update display with response text
 * 
 * Displays the response text on the OLED with word wrapping.
 * For Phase 1, we'll show the first ~40 characters.
 * Future phases can implement scrolling.
 * 
 * @param text - Response text
 * @param hardware - Hardware interface
 */
export async function updateDisplay(
  text: string,
  hardware: VoiceHardware
): Promise<void> {
  console.log(`[Display] Updating with response text...`);
  
  try {
    await hardware.display.clear();
    
    // Title
    await hardware.display.writeText('Response:', 0, 0, 1);
    
    // Word-wrap text to fit display
    // 128px wide, ~21 chars per line at size 1
    const charsPerLine = 21;
    const maxLines = 4;
    
    const lines = wrapText(text, charsPerLine, maxLines);
    
    let y = 16; // Start below title
    for (const line of lines) {
      await hardware.display.writeText(line, 0, y, 1);
      y += 12; // Line height
    }
    
    await hardware.display.update();
    
    console.log('[Display] Display updated');
    
  } catch (error) {
    console.error('[Display] Update failed:', error);
    throw error;
  }
}

/**
 * Word-wrap text to fit display constraints
 */
function wrapText(text: string, charsPerLine: number, maxLines: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';
  
  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    
    if (testLine.length <= charsPerLine) {
      currentLine = testLine;
    } else {
      if (currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        // Single word longer than line - truncate
        lines.push(word.substring(0, charsPerLine - 1) + '…');
        currentLine = '';
      }
    }
    
    // Stop if we've reached max lines
    if (lines.length >= maxLines) {
      break;
    }
  }
  
  // Add remaining text
  if (currentLine && lines.length < maxLines) {
    lines.push(currentLine);
  }
  
  // Truncate last line if we exceeded max lines
  if (lines.length > maxLines) {
    lines.length = maxLines;
    const lastLine = lines[maxLines - 1];
    if (lastLine.length > charsPerLine - 1) {
      lines[maxLines - 1] = lastLine.substring(0, charsPerLine - 1) + '…';
    }
  }
  
  return lines;
}

/**
 * Show idle screen after response delivery
 */
async function showIdleScreen(hardware: VoiceHardware): Promise<void> {
  await hardware.display.clear();
  await hardware.display.writeText('Ready', 0, 0, 2);
  await hardware.display.writeText('Press PTT', 0, 24, 1);
  await hardware.display.update();
}

/**
 * Complete response delivery flow
 * 
 * Main entry point called from voice-message-dispatch.ts
 * 
 * @param text - Response text to deliver
 * @param hardware - Hardware interface
 * @param bot - Voice bot instance
 */
export async function deliverResponse(
  text: string,
  hardware: VoiceHardware,
  bot: VoiceBot
): Promise<void> {
  console.log(`[Send] Delivering response: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);
  
  try {
    // Step 1: Generate TTS
    console.log('[Send] Step 1: Generating TTS...');
    await updateDisplayStatus(hardware, 'Speaking...', 'Generating voice');
    
    const ttsResult = await generateTTS(text, bot);
    
    // Step 2: Update display with response text
    console.log('[Send] Step 2: Updating display...');
    await updateDisplay(text, hardware);
    
    // Step 3: Play audio
    console.log('[Send] Step 3: Playing audio...');
    await playAudio(ttsResult.audioBuffer, hardware, ttsResult.format);
    
    console.log('[Send] Response delivery complete');
    
    // Step 4: Return to idle screen after delay
    setTimeout(async () => {
      await showIdleScreen(hardware);
    }, 3000);
    
  } catch (error) {
    console.error('[Send] Response delivery failed:', error);
    
    // Show error
    await updateDisplayStatus(hardware, 'Error', 'TTS failed');
    
    setTimeout(async () => {
      await showIdleScreen(hardware);
    }, 3000);
    
    throw error;
  }
}

/**
 * Helper: Update display with simple status
 */
async function updateDisplayStatus(
  hardware: VoiceHardware,
  line1: string,
  line2?: string
): Promise<void> {
  try {
    await hardware.display.clear();
    await hardware.display.writeText(line1, 0, 0, 2);
    
    if (line2) {
      await hardware.display.writeText(line2, 0, 24, 1);
    }
    
    await hardware.display.update();
  } catch (error) {
    console.error('[Display] Status update failed:', error);
  }
}
