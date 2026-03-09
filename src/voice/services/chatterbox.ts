/**
 * Chatterbox text-to-speech service integration
 */

import { readFileSync } from "node:fs";
import { getChildLogger } from "../../logging.js";

const log = getChildLogger("voice-chatterbox");

export type ChatterboxConfig = {
  url: string;
  voiceSample: string;
  exaggeration?: number;
  cfgWeight?: number;
  temperature?: number;
};

/**
 * Generate speech audio using Chatterbox TTS
 */
export async function generateSpeech(text: string, config: ChatterboxConfig): Promise<Buffer | null> {
  try {
    const url = `${config.url}/audio/speech/upload`;

    log.debug(`Generating TTS for: "${text.substring(0, 50)}..."`);

    // Read voice sample file
    const voiceSample = readFileSync(config.voiceSample);

    // Create form data
    const formData = new FormData();
    const voiceBlob = new Blob([voiceSample], { type: "audio/wav" });
    formData.append("voice_file", voiceBlob, "voice.wav");
    formData.append("input", text);
    formData.append("exaggeration", String(config.exaggeration || 0.9));
    formData.append("cfg_weight", String(config.cfgWeight || 0.3));
    formData.append("temperature", String(config.temperature || 0.9));

    const response = await fetch(url, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      log.error(`Chatterbox API error: ${response.status} ${response.statusText}`);
      return null;
    }

    const audioBuffer = Buffer.from(await response.arrayBuffer());

    log.info(`Generated ${audioBuffer.length} bytes of audio`);

    // Reset memory for next generation (prevents Errno 22)
    await resetMemory(config.url);

    return audioBuffer;
  } catch (err) {
    log.error("Chatterbox TTS error:", err);
    return null;
  }
}

/**
 * Reset Chatterbox memory (prevents Errno 22 after multiple generations)
 */
async function resetMemory(baseUrl: string): Promise<void> {
  try {
    const url = `${baseUrl}/memory/reset?confirm=true`;
    await fetch(url, { method: "POST" });
    log.debug("Chatterbox memory reset");
  } catch (err) {
    log.warn("Failed to reset Chatterbox memory:", err);
  }
}
