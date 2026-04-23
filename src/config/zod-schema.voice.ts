import { z } from "zod";

/**
 * Voice Channel Zod Schema
 * 
 * Validation schema for hardware voice assistant channel configuration.
 * Integrates with OpenClawConfig.channels.voice.
 */

// GPIO Configuration
export const VoiceGpioSchema = z
  .object({
    /** Push-to-talk button GPIO pin (BCM numbering, default: 17) */
    pttButton: z.number().int().min(0).max(27).optional(),
    /** Rotary encoder pin A (BCM, default: 22) */
    encoderA: z.number().int().min(0).max(27).optional(),
    /** Rotary encoder pin B (BCM, default: 27) */
    encoderB: z.number().int().min(0).max(27).optional(),
    /** Rotary encoder button (BCM, default: 23) */
    encoderButton: z.number().int().min(0).max(27).optional(),
  })
  .strict()
  .optional();

// Display Configuration
export const VoiceDisplaySchema = z
  .object({
    /** I2C bus number (default: 1) */
    i2cBus: z.number().int().min(0).max(9).optional(),
    /** OLED I2C address (default: 0x3C) */
    i2cAddress: z.number().int().min(0x00).max(0x7f).optional(),
    /** Display width in pixels (default: 128) */
    width: z.number().int().positive().optional(),
    /** Display height in pixels (default: 64) */
    height: z.number().int().positive().optional(),
  })
  .strict()
  .optional();

// Audio Configuration
export const VoiceAudioSchema = z
  .object({
    /** ALSA input device (default: "default") */
    inputDevice: z.string().min(1).optional(),
    /** ALSA output device (default: "default") */
    outputDevice: z.string().min(1).optional(),
    /** Sample rate in Hz (default: 16000) */
    sampleRate: z.number().int().positive().optional(),
    /** Bit depth (default: 16) */
    bitDepth: z.union([z.literal(16), z.literal(24), z.literal(32)]).optional(),
    /** Channels: 1=mono, 2=stereo (default: 1) */
    channels: z.union([z.literal(1), z.literal(2)]).optional(),
    /** Recording format (default: "linear16") */
    format: z.enum(["linear16", "opus", "wav"]).optional(),
  })
  .strict()
  .optional();

// Hardware Configuration
export const VoiceHardwareSchema = z
  .object({
    /** GPIO pin assignments */
    gpio: VoiceGpioSchema,
    /** OLED display settings */
    display: VoiceDisplaySchema,
    /** USB audio device settings */
    audio: VoiceAudioSchema,
  })
  .strict()
  .optional();

// Deepgram STT Configuration
export const VoiceDeepgramSchema = z
  .object({
    /** API endpoint (default: https://api.deepgram.com/v1/listen) */
    endpoint: z.string().url().optional(),
    /** API key (reads from DEEPGRAM_API_KEY env if not set) */
    apiKey: z.string().min(1).optional(),
    /** STT model (default: "nova-3") */
    model: z.string().min(1).optional(),
    /** Enable smart formatting (default: true) */
    smartFormat: z.boolean().optional(),
  })
  .strict()
  .optional();

// Chatterbox TTS Configuration
export const VoiceChatterboxSchema = z
  .object({
    /** Chatterbox server URL (default: http://100.114.0.61:4123) */
    baseUrl: z.string().url().optional(),
    /** Voice sample WAV file path */
    voiceSamplePath: z.string().min(1).optional(),
    /** Exaggeration level 0.0-1.0 (default: 0.9) */
    exaggeration: z.number().min(0).max(1).optional(),
    /** CFG weight 0.0-1.0 (default: 0.3) */
    cfgWeight: z.number().min(0).max(1).optional(),
    /** Temperature 0.0-1.0 (default: 0.9) */
    temperature: z.number().min(0).max(1).optional(),
    /** Auto-reset memory interval (default: 2) */
    memoryResetInterval: z.number().int().positive().optional(),
  })
  .strict()
  .optional();

// Services Configuration
export const VoiceServicesSchema = z
  .object({
    /** Deepgram speech-to-text */
    deepgram: VoiceDeepgramSchema,
    /** Chatterbox text-to-speech */
    chatterbox: VoiceChatterboxSchema,
  })
  .strict()
  .optional();

// Session Configuration
export const VoiceSessionSchema = z
  .object({
    /** Default agent session (default: "agent:main:main") */
    defaultSession: z.string().min(1).optional(),
    /** Session label (default: "voice") */
    label: z.string().min(1).optional(),
  })
  .strict()
  .optional();

// Behavior Configuration
export const VoiceBehaviorSchema = z
  .object({
    /** Max recording duration in ms (default: 30000) */
    maxRecordingMs: z.number().int().positive().optional(),
    /** Display timeout in ms (default: 60000) */
    displayTimeoutMs: z.number().int().positive().optional(),
    /** Enable voice activity detection (default: false) */
    enableVad: z.boolean().optional(),
    /** VAD silence threshold in ms (default: 1500) */
    vadSilenceMs: z.number().int().positive().optional(),
  })
  .strict()
  .optional();

// Main Voice Channel Configuration Schema
export const VoiceChannelConfigSchema = z
  .object({
    /** Enable voice channel (default: false) */
    enabled: z.boolean().optional(),
    /** Display name for voice channel */
    name: z.string().min(1).optional(),
    /** Hardware configuration */
    hardware: VoiceHardwareSchema,
    /** Service endpoints */
    services: VoiceServicesSchema,
    /** Session routing */
    session: VoiceSessionSchema,
    /** Behavior settings */
    behavior: VoiceBehaviorSchema,
  })
  .strict()
  .optional();

export type VoiceChannelConfigInput = z.input<typeof VoiceChannelConfigSchema>;
export type VoiceChannelConfigOutput = z.output<typeof VoiceChannelConfigSchema>;
