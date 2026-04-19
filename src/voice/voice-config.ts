/**
 * Voice Channel Configuration
 * 
 * Configuration schema and defaults for the ShopClaw voice interface.
 */

export interface VoiceConfig {
  /** Hardware configuration */
  hardware: {
    /** GPIO pin assignments */
    gpio: {
      /** Push-to-talk button (GPIO input, pull-up) */
      pttButton: number;
      /** Rotary encoder pin A */
      encoderA: number;
      /** Rotary encoder pin B */
      encoderB: number;
      /** Rotary encoder button (press) */
      encoderButton: number;
    };
    
    /** I2C display configuration */
    display: {
      /** I2C bus number (usually 1 on Pi) */
      i2cBus: number;
      /** OLED I2C address (0x3C or 0x3D typical) */
      i2cAddress: number;
      /** Display width in pixels */
      width: number;
      /** Display height in pixels */
      height: number;
    };
    
    /** Audio device configuration */
    audio: {
      /** ALSA input device name */
      inputDevice: string;
      /** ALSA output device name */
      outputDevice: string;
      /** Recording sample rate (Hz) */
      sampleRate: number;
      /** Audio bit depth */
      bitDepth: 16 | 24 | 32;
      /** Number of channels (1=mono, 2=stereo) */
      channels: 1 | 2;
      /** Recording format (Deepgram expects linear16) */
      format: 'linear16' | 'opus' | 'wav';
    };
  };
  
  /** Service endpoints */
  services: {
    /** Deepgram speech-to-text */
    deepgram: {
      /** API endpoint */
      endpoint: string;
      /** API key (from environment) */
      apiKey?: string;
      /** Model to use */
      model: string;
      /** Enable smart formatting */
      smartFormat: boolean;
    };
    
    /** Chatterbox TTS */
    chatterbox: {
      /** Base URL of Chatterbox server */
      baseUrl: string;
      /** Voice sample file path */
      voiceSamplePath: string;
      /** Exaggeration level (0-1) */
      exaggeration: number;
      /** CFG weight (0-1) */
      cfgWeight: number;
      /** Temperature (0-1) */
      temperature: number;
    };
  };
  
  /** Agent session routing */
  session: {
    /** Default agent session to route voice messages to */
    defaultSession: string;
    /** Session label for voice channel */
    label: string;
  };
  
  /** Behavior settings */
  behavior: {
    /** Auto-reset Chatterbox memory every N requests (prevents Errno 22) */
    ttsResetInterval: number;
    /** Maximum recording duration (ms) */
    maxRecordingMs: number;
    /** Display timeout when idle (ms) */
    displayTimeoutMs: number;
  };
}

/**
 * Default configuration values
 */
export const DEFAULT_VOICE_CONFIG: VoiceConfig = {
  hardware: {
    gpio: {
      pttButton: 17,      // GPIO17 (physical pin 11)
      encoderA: 22,       // GPIO22 (physical pin 15)
      encoderB: 27,       // GPIO27 (physical pin 13)
      encoderButton: 23,  // GPIO23 (physical pin 16)
    },
    
    display: {
      i2cBus: 1,
      i2cAddress: 0x3C,   // Common OLED address
      width: 128,
      height: 64,
    },
    
    audio: {
      inputDevice: 'default',
      outputDevice: 'default',
      sampleRate: 16000,  // 16kHz for Deepgram
      bitDepth: 16,
      channels: 1,        // Mono
      format: 'linear16',
    },
  },
  
  services: {
    deepgram: {
      endpoint: 'https://api.deepgram.com/v1/listen',
      model: 'nova-3',
      smartFormat: true,
    },
    
    chatterbox: {
      baseUrl: 'http://100.114.0.61:4123',  // Windows PC on Tailscale
      voiceSamplePath: '/mnt/ssd/cyclops-workspace/cy-voice-sample.wav',
      exaggeration: 0.9,
      cfgWeight: 0.3,
      temperature: 0.9,
    },
  },
  
  session: {
    defaultSession: 'agent:main:main',
    label: 'voice',
  },
  
  behavior: {
    ttsResetInterval: 2,     // Reset memory every 2 TTS requests
    maxRecordingMs: 30000,   // 30 second max recording
    displayTimeoutMs: 60000, // 1 minute idle timeout
  },
};

/**
 * Load voice configuration from environment and defaults
 */
export function loadVoiceConfig(overrides?: Partial<VoiceConfig>): VoiceConfig {
  const config = { ...DEFAULT_VOICE_CONFIG };
  
  // Override from environment
  if (process.env.DEEPGRAM_API_KEY) {
    config.services.deepgram.apiKey = process.env.DEEPGRAM_API_KEY;
  }
  
  if (process.env.CHATTERBOX_URL) {
    config.services.chatterbox.baseUrl = process.env.CHATTERBOX_URL;
  }
  
  // Apply user overrides
  if (overrides) {
    Object.assign(config, overrides);
  }
  
  return config;
}
