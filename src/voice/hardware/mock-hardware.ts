/**
 * Mock hardware implementation for testing
 * Simulates voice hardware without requiring physical Pi
 */

import type { ScreenState, VoiceHardware } from "./types.js";

export class MockVoiceHardware implements VoiceHardware {
  private pttCallback?: (pressed: boolean) => void;
  private rotateCallback?: (delta: number) => void;
  private pressCallback?: () => void;
  private currentScreen?: ScreenState;

  async initialize(): Promise<boolean> {
    console.log("[MockHardware] Initialized");
    return true;
  }

  async cleanup(): Promise<void> {
    console.log("[MockHardware] Cleaned up");
  }

  async recordAudio(): Promise<Buffer> {
    console.log("[MockHardware] Recording audio (simulated)...");
    // Return empty buffer for now
    return Buffer.alloc(0);
  }

  async playAudio(buffer: Buffer): Promise<void> {
    console.log(`[MockHardware] Playing audio: ${buffer.length} bytes`);
  }

  updateDisplay(screen: ScreenState): void {
    this.currentScreen = screen;
    console.log(`[MockHardware] Display updated: ${screen.type}`);
    if (screen.content) {
      console.log(`  Content:`, screen.content);
    }
  }

  onPushToTalk(callback: (pressed: boolean) => void): void {
    this.pttCallback = callback;
    console.log("[MockHardware] PTT callback registered");
  }

  onEncoderRotate(callback: (delta: number) => void): void {
    this.rotateCallback = callback;
    console.log("[MockHardware] Encoder rotate callback registered");
  }

  onEncoderPress(callback: () => void): void {
    this.pressCallback = callback;
    console.log("[MockHardware] Encoder press callback registered");
  }

  // Test helpers
  simulatePTT(pressed: boolean): void {
    if (this.pttCallback) {
      this.pttCallback(pressed);
    }
  }

  simulateEncoderRotate(delta: number): void {
    if (this.rotateCallback) {
      this.rotateCallback(delta);
    }
  }

  simulateEncoderPress(): void {
    if (this.pressCallback) {
      this.pressCallback();
    }
  }

  getCurrentScreen(): ScreenState | undefined {
    return this.currentScreen;
  }
}
