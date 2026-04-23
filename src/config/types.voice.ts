/**
 * Voice Channel Configuration Types
 * 
 * Configuration schema for the hardware voice assistant channel.
 * This is for local Raspberry Pi hardware (GPIO, OLED, USB audio),
 * NOT telephony (see voice-call plugin for phone calls).
 */

export type VoiceGpioConfig = {
  /** Push-to-talk button GPIO pin (BCM numbering) */
  pttButton?: number;
  /** Rotary encoder pin A (BCM) */
  encoderA?: number;
  /** Rotary encoder pin B (BCM) */
  encoderB?: number;
  /** Rotary encoder button/press (BCM) */
  encoderButton?: number;
};

export type VoiceDisplayConfig = {
  /** I2C bus number (usually 1 on Raspberry Pi) */
  i2cBus?: number;
  /** OLED I2C address (typically 0x3C or 0x3D) */
  i2cAddress?: number;
  /** Display width in pixels */
  width?: number;
  /** Display height in pixels */
  height?: number;
};

export type VoiceAudioConfig = {
  /** ALSA input device name (e.g., "hw:1,0" or "default") */
  inputDevice?: string;
  /** ALSA output device name */
  outputDevice?: string;
  /** Recording sample rate in Hz (16000 recommended for Deepgram) */
  sampleRate?: number;
  /** Audio bit depth (16, 24, or 32) */
  bitDepth?: 16 | 24 | 32;
  /** Number of channels (1=mono, 2=stereo) */
  channels?: 1 | 2;
  /** Recording format (linear16 for Deepgram, opus for efficiency) */
  format?: "linear16" | "opus" | "wav";
};

export type VoiceHardwareConfig = {
  /** GPIO pin configuration */
  gpio?: VoiceGpioConfig;
  /** OLED display configuration */
  display?: VoiceDisplayConfig;
  /** USB audio device configuration */
  audio?: VoiceAudioConfig;
};

export type VoiceDeepgramConfig = {
  /** Deepgram API endpoint (defaults to https://api.deepgram.com/v1/listen) */
  endpoint?: string;
  /** Deepgram API key (reads from DEEPGRAM_API_KEY env if not set) */
  apiKey?: string;
  /** Speech-to-text model (e.g., "nova-3", "nova-2") */
  model?: string;
  /** Enable smart formatting (punctuation, capitalization) */
  smartFormat?: boolean;
};

export type VoiceChatterboxConfig = {
  /** Chatterbox TTS server base URL (e.g., "http://100.114.0.61:4123") */
  baseUrl?: string;
  /** Path to voice sample WAV file for voice cloning */
  voiceSamplePath?: string;
  /** Voice exaggeration level (0.0-1.0, higher = more expressive) */
  exaggeration?: number;
  /** CFG weight (0.0-1.0, controls voice consistency) */
  cfgWeight?: number;
  /** Temperature (0.0-1.0, controls randomness) */
  temperature?: number;
  /** Auto-reset memory every N requests (prevents Errno 22 bug) */
  memoryResetInterval?: number;
};

export type VoiceServicesConfig = {
  /** Deepgram speech-to-text configuration */
  deepgram?: VoiceDeepgramConfig;
  /** Chatterbox TTS configuration */
  chatterbox?: VoiceChatterboxConfig;
};

export type VoiceSessionConfig = {
  /** Default agent session to route voice messages to (e.g., "agent:main:main") */
  defaultSession?: string;
  /** Session label for voice channel (used in routing) */
  label?: string;
};

export type VoiceBehaviorConfig = {
  /** Maximum recording duration in milliseconds (default: 30000) */
  maxRecordingMs?: number;
  /** Display timeout when idle in milliseconds (default: 60000) */
  displayTimeoutMs?: number;
  /** Enable voice activity detection (auto-stop recording on silence) */
  enableVad?: boolean;
  /** VAD silence threshold in milliseconds (default: 1500) */
  vadSilenceMs?: number;
};

/**
 * Voice Channel Configuration
 * 
 * Top-level config for the hardware voice assistant channel.
 * Integrates with OpenClawConfig.channels.voice.
 */
export type VoiceChannelConfig = {
  /** Enable the voice channel (default: false) */
  enabled?: boolean;
  /** Optional display name for this voice channel */
  name?: string;
  /** Hardware configuration (GPIO, display, audio) */
  hardware?: VoiceHardwareConfig;
  /** Service endpoints (Deepgram STT, Chatterbox TTS) */
  services?: VoiceServicesConfig;
  /** Agent session routing configuration */
  session?: VoiceSessionConfig;
  /** Behavior settings (recording limits, timeouts, etc.) */
  behavior?: VoiceBehaviorConfig;
};
