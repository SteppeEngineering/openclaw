/**
 * Deepgram speech-to-text service integration
 */

import { getChildLogger } from "../../logging.js";

const log = getChildLogger("voice-deepgram");

export type DeepgramConfig = {
  apiKey: string;
  model?: string;
  smartFormat?: boolean;
};

export type DeepgramResult = {
  transcript: string;
  confidence: number;
};

const DEEPGRAM_URL = "https://api.deepgram.com/v1/listen";

/**
 * Transcribe audio buffer using Deepgram API
 */
export async function transcribeAudio(
  audioBuffer: Buffer,
  config: DeepgramConfig
): Promise<DeepgramResult | null> {
  try {
    const model = config.model || "nova-2";
    const smartFormat = config.smartFormat !== false;

    const url = `${DEEPGRAM_URL}?model=${model}&smart_format=${smartFormat}`;

    log.debug(`Transcribing ${audioBuffer.length} bytes with model ${model}`);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Token ${config.apiKey}`,
        "Content-Type": "audio/wav",
      },
      body: audioBuffer,
    });

    if (!response.ok) {
      log.error(`Deepgram API error: ${response.status} ${response.statusText}`);
      return null;
    }

    const result = await response.json();

    if (!result.results || !result.results.channels || !result.results.channels[0]) {
      log.error("Invalid Deepgram response format");
      return null;
    }

    const transcript = result.results.channels[0].alternatives[0].transcript;
    const confidence = result.results.channels[0].alternatives[0].confidence || 0;

    log.info(`Transcribed: "${transcript}" (confidence: ${confidence.toFixed(2)})`);

    return { transcript, confidence };
  } catch (err) {
    log.error("Deepgram transcription error:", err);
    return null;
  }
}

/**
 * Create WAV file with proper headers from raw PCM data
 */
export function createWavBuffer(pcmData: Buffer, sampleRate: number, channels = 1, bitsPerSample = 16): Buffer {
  const dataSize = pcmData.length;
  const headerSize = 44;
  const fileSize = headerSize + dataSize - 8;

  const header = Buffer.alloc(headerSize);

  // RIFF header
  header.write("RIFF", 0);
  header.writeUInt32LE(fileSize, 4);
  header.write("WAVE", 8);

  // fmt chunk
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16); // Chunk size
  header.writeUInt16LE(1, 20); // Audio format (PCM)
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * channels * (bitsPerSample / 8), 28); // Byte rate
  header.writeUInt16LE(channels * (bitsPerSample / 8), 32); // Block align
  header.writeUInt16LE(bitsPerSample, 34);

  // data chunk
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmData]);
}
