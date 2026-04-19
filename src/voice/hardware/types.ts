/**
 * Voice Hardware Types
 * 
 * Hardware abstraction interfaces for the voice channel.
 * Supports both real hardware (Pi GPIO/I2C) and mock implementations for testing.
 */

import type { VoiceConfig } from '../voice-config';

/**
 * Hardware event types
 */
export enum HardwareEvent {
  /** Push-to-talk button pressed (start recording) */
  PTT_PRESS = 'ptt_press',
  /** Push-to-talk button released (stop recording) */
  PTT_RELEASE = 'ptt_release',
  /** Rotary encoder rotated clockwise */
  ENCODER_CW = 'encoder_cw',
  /** Rotary encoder rotated counter-clockwise */
  ENCODER_CCW = 'encoder_ccw',
  /** Encoder button pressed */
  ENCODER_BUTTON = 'encoder_button',
}

/**
 * Hardware event callback
 */
export type HardwareEventHandler = (event: HardwareEvent, data?: any) => void;

/**
 * Audio recording state
 */
export enum RecordingState {
  IDLE = 'idle',
  RECORDING = 'recording',
  PROCESSING = 'processing',
  ERROR = 'error',
}

/**
 * Audio device interface
 */
export interface AudioDevice {
  /** Start recording audio */
  startRecording(): Promise<void>;
  
  /** Stop recording and return audio buffer */
  stopRecording(): Promise<Buffer>;
  
  /** Play audio buffer through output device */
  playAudio(audioData: Buffer, format?: string): Promise<void>;
  
  /** Get current recording state */
  getRecordingState(): RecordingState;
  
  /** Clean up audio resources */
  close(): Promise<void>;
}

/**
 * Display device interface (OLED)
 */
export interface DisplayDevice {
  /** Initialize display */
  init(): Promise<void>;
  
  /** Clear display */
  clear(): Promise<void>;
  
  /** Write text at position */
  writeText(text: string, x: number, y: number, size?: number): Promise<void>;
  
  /** Draw bitmap/icon at position */
  drawBitmap(bitmap: Buffer, x: number, y: number, width: number, height: number): Promise<void>;
  
  /** Update display (flush buffer to screen) */
  update(): Promise<void>;
  
  /** Turn display on/off */
  setPower(on: boolean): Promise<void>;
  
  /** Get display dimensions */
  getDimensions(): { width: number; height: number };
  
  /** Clean up display resources */
  close(): Promise<void>;
}

/**
 * Input device interface (buttons and encoder)
 */
export interface InputDevice {
  /** Register event handler */
  on(event: HardwareEvent, handler: HardwareEventHandler): void;
  
  /** Remove event handler */
  off(event: HardwareEvent, handler: HardwareEventHandler): void;
  
  /** Initialize GPIO pins and start listening */
  init(): Promise<void>;
  
  /** Clean up GPIO resources */
  close(): Promise<void>;
}

/**
 * Complete voice hardware interface
 */
export interface VoiceHardware {
  /** Hardware type identifier */
  readonly type: 'real' | 'mock';
  
  /** Audio recording and playback */
  readonly audio: AudioDevice;
  
  /** OLED display */
  readonly display: DisplayDevice;
  
  /** GPIO inputs (buttons, encoder) */
  readonly input: InputDevice;
  
  /** Initialize all hardware */
  init(config: VoiceConfig): Promise<void>;
  
  /** Clean up all hardware resources */
  close(): Promise<void>;
}

/**
 * Factory function type for creating hardware instances
 */
export type HardwareFactory = (config: VoiceConfig) => Promise<VoiceHardware>;

/**
 * Hardware capabilities and status
 */
export interface HardwareStatus {
  /** Hardware type */
  type: 'real' | 'mock';
  
  /** Is hardware initialized? */
  initialized: boolean;
  
  /** Component status */
  components: {
    audio: {
      available: boolean;
      inputDevice: string;
      outputDevice: string;
    };
    display: {
      available: boolean;
      width: number;
      height: number;
    };
    input: {
      available: boolean;
      pttButton: boolean;
      encoder: boolean;
    };
  };
  
  /** Last error, if any */
  lastError?: string;
}
