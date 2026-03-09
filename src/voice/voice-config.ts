/**
 * Voice channel configuration types
 */

export type VoiceHardwareConfig = {
  /** GPIO pin assignments */
  oled?: {
    dc?: number; // Data/Command pin (default: 17)
    rst?: number; // Reset pin (default: 27)
    width?: number; // Display width (default: 128)
    height?: number; // Display height (default: 64)
  };
  encoder?: {
    clk?: number; // Clock pin (default: 5)
    dt?: number; // Data pin (default: 6)
    sw?: number; // Switch/button pin (default: 26)
  };
  pttButton?: number; // Push-to-talk button pin (default: 23)
};

export type VoiceAudioConfig = {
  /** ALSA device name (e.g., "plughw:3,0") */
  device?: string;
  /** Sample rate in Hz (default: 16000) */
  rate?: number;
  /** Audio chunk size for recording (default: 1024) */
  chunkSize?: number;
};

export type VoiceServicesConfig = {
  deepgram?: {
    /** Deepgram API key */
    apiKey?: string;
    /** STT model to use (default: "nova-2") */
    model?: string;
  };
  chatterbox?: {
    /** Chatterbox TTS server URL */
    url?: string;
    /** Path to voice sample WAV file */
    voiceSample?: string;
    /** Voice generation parameters */
    exaggeration?: number; // default: 0.9
    cfgWeight?: number; // default: 0.3
    temperature?: number; // default: 0.9
  };
};

export type VoiceUIConfig = {
  /** Delay in ms before playing acknowledgment (default: 500) */
  ackDelay?: number;
  /** Delay in ms before returning to home screen (default: 5000) */
  returnHomeDelay?: number;
  /** Path to acknowledgment audio files directory */
  ackDir?: string;
};

export type VoiceChannelConfig = {
  /** Enable voice channel (default: false) */
  enabled?: boolean;
  /** Hardware configuration */
  hardware?: VoiceHardwareConfig;
  /** Audio configuration */
  audio?: VoiceAudioConfig;
  /** External services configuration */
  services?: VoiceServicesConfig;
  /** UI behavior configuration */
  ui?: VoiceUIConfig;
  /** Use mock hardware for testing (default: false) */
  useMockHardware?: boolean;
};

/** Default configuration values */
export const DEFAULT_VOICE_CONFIG: Required<VoiceChannelConfig> = {
  enabled: false,
  hardware: {
    oled: {
      dc: 17,
      rst: 27,
      width: 128,
      height: 64,
    },
    encoder: {
      clk: 5,
      dt: 6,
      sw: 26,
    },
    pttButton: 23,
  },
  audio: {
    device: "plughw:3,0",
    rate: 16000,
    chunkSize: 1024,
  },
  services: {
    deepgram: {
      apiKey: "",
      model: "nova-2",
    },
    chatterbox: {
      url: "http://100.114.0.61:4123",
      voiceSample: "/mnt/ssd/cyclops-workspace/cy-voice-sample.wav",
      exaggeration: 0.9,
      cfgWeight: 0.3,
      temperature: 0.9,
    },
  },
  ui: {
    ackDelay: 500,
    returnHomeDelay: 5000,
    ackDir: "/mnt/ssd/cyclops-workspace/voice-acks",
  },
  useMockHardware: false,
};

/**
 * Resolve voice configuration with defaults
 */
export function resolveVoiceConfig(cfg?: VoiceChannelConfig): Required<VoiceChannelConfig> {
  return {
    enabled: cfg?.enabled ?? DEFAULT_VOICE_CONFIG.enabled,
    hardware: {
      oled: {
        dc: cfg?.hardware?.oled?.dc ?? DEFAULT_VOICE_CONFIG.hardware.oled.dc,
        rst: cfg?.hardware?.oled?.rst ?? DEFAULT_VOICE_CONFIG.hardware.oled.rst,
        width: cfg?.hardware?.oled?.width ?? DEFAULT_VOICE_CONFIG.hardware.oled.width,
        height: cfg?.hardware?.oled?.height ?? DEFAULT_VOICE_CONFIG.hardware.oled.height,
      },
      encoder: {
        clk: cfg?.hardware?.encoder?.clk ?? DEFAULT_VOICE_CONFIG.hardware.encoder.clk,
        dt: cfg?.hardware?.encoder?.dt ?? DEFAULT_VOICE_CONFIG.hardware.encoder.dt,
        sw: cfg?.hardware?.encoder?.sw ?? DEFAULT_VOICE_CONFIG.hardware.encoder.sw,
      },
      pttButton: cfg?.hardware?.pttButton ?? DEFAULT_VOICE_CONFIG.hardware.pttButton,
    },
    audio: {
      device: cfg?.audio?.device ?? DEFAULT_VOICE_CONFIG.audio.device,
      rate: cfg?.audio?.rate ?? DEFAULT_VOICE_CONFIG.audio.rate,
      chunkSize: cfg?.audio?.chunkSize ?? DEFAULT_VOICE_CONFIG.audio.chunkSize,
    },
    services: {
      deepgram: {
        apiKey: cfg?.services?.deepgram?.apiKey ?? DEFAULT_VOICE_CONFIG.services.deepgram.apiKey,
        model: cfg?.services?.deepgram?.model ?? DEFAULT_VOICE_CONFIG.services.deepgram.model,
      },
      chatterbox: {
        url: cfg?.services?.chatterbox?.url ?? DEFAULT_VOICE_CONFIG.services.chatterbox.url,
        voiceSample:
          cfg?.services?.chatterbox?.voiceSample ?? DEFAULT_VOICE_CONFIG.services.chatterbox.voiceSample,
        exaggeration:
          cfg?.services?.chatterbox?.exaggeration ?? DEFAULT_VOICE_CONFIG.services.chatterbox.exaggeration,
        cfgWeight: cfg?.services?.chatterbox?.cfgWeight ?? DEFAULT_VOICE_CONFIG.services.chatterbox.cfgWeight,
        temperature:
          cfg?.services?.chatterbox?.temperature ?? DEFAULT_VOICE_CONFIG.services.chatterbox.temperature,
      },
    },
    ui: {
      ackDelay: cfg?.ui?.ackDelay ?? DEFAULT_VOICE_CONFIG.ui.ackDelay,
      returnHomeDelay: cfg?.ui?.returnHomeDelay ?? DEFAULT_VOICE_CONFIG.ui.returnHomeDelay,
      ackDir: cfg?.ui?.ackDir ?? DEFAULT_VOICE_CONFIG.ui.ackDir,
    },
    useMockHardware: cfg?.useMockHardware ?? DEFAULT_VOICE_CONFIG.useMockHardware,
  };
}
