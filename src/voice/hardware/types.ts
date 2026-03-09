/**
 * Voice channel hardware abstraction
 * Allows testing without physical Pi hardware
 */

export type ScreenState = {
  type: "home" | "voice" | "menu" | "status";
  content?: {
    voiceState?: "idle" | "listening" | "transcribing" | "thinking" | "response";
    text?: string;
    response?: string;
  };
};

export interface VoiceHardware {
  /**
   * Audio recording
   * Returns raw audio buffer when recording completes
   */
  recordAudio(): Promise<Buffer>;

  /**
   * Audio playback
   * Plays audio buffer through speaker
   */
  playAudio(buffer: Buffer): Promise<void>;

  /**
   * Update OLED display
   */
  updateDisplay(screen: ScreenState): void;

  /**
   * Register push-to-talk button callback
   * Called with true when pressed, false when released
   */
  onPushToTalk(callback: (pressed: boolean) => void): void;

  /**
   * Register encoder rotation callback
   * Delta is +1 for clockwise, -1 for counter-clockwise
   */
  onEncoderRotate(callback: (delta: number) => void): void;

  /**
   * Register encoder button press callback
   */
  onEncoderPress(callback: () => void): void;

  /**
   * Initialize hardware
   * Returns true if successful
   */
  initialize(): Promise<boolean>;

  /**
   * Cleanup hardware resources
   */
  cleanup(): Promise<void>;
}
