/**
 * Mock Hardware Implementation
 * 
 * Simulated hardware for testing the voice channel without physical Pi/GPIO.
 * Provides console-based interaction and simulated audio/display.
 */

import { EventEmitter } from 'events';
import type {
  VoiceHardware,
  AudioDevice,
  DisplayDevice,
  InputDevice,
  HardwareEvent,
  HardwareEventHandler,
  RecordingState,
} from './types';
import type { VoiceConfig } from '../voice-config';

/**
 * Mock Audio Device
 * 
 * Simulates audio recording and playback via console logging.
 */
class MockAudioDevice implements AudioDevice {
  private state: RecordingState = RecordingState.IDLE;
  private recordingBuffer: Buffer | null = null;
  private recordingStartTime: number = 0;
  private volume: number = 75; // Default 75%
  
  async startRecording(): Promise<void> {
    console.log('[MockAudio] 🎤 Started recording');
    this.state = RecordingState.RECORDING;
    this.recordingStartTime = Date.now();
    this.recordingBuffer = null;
  }
  
  async stopRecording(): Promise<Buffer> {
    const duration = Date.now() - this.recordingStartTime;
    console.log(`[MockAudio] ⏹️  Stopped recording (${duration}ms)`);
    
    this.state = RecordingState.IDLE;
    
    // Create fake audio buffer (simulated PCM data)
    const sampleRate = 16000; // 16kHz
    const samples = Math.floor((duration / 1000) * sampleRate);
    const buffer = Buffer.alloc(samples * 2); // 16-bit samples
    
    // Fill with simulated audio (silence)
    for (let i = 0; i < buffer.length; i += 2) {
      buffer.writeInt16LE(0, i);
    }
    
    this.recordingBuffer = buffer;
    return buffer;
  }
  
  async playAudio(audioData: Buffer, format?: string): Promise<void> {
    const durationMs = (audioData.length / 2) / 16; // Rough estimate
    console.log(`[MockAudio] 🔊 Playing audio (${audioData.length} bytes, ~${durationMs.toFixed(0)}ms, format: ${format || 'unknown'})`);
    
    // Simulate playback delay
    await new Promise(resolve => setTimeout(resolve, Math.min(durationMs, 5000)));
    
    console.log('[MockAudio] ✓ Playback complete');
  }
  
  getRecordingState(): RecordingState {
    return this.state;
  }
  
  async getVolume(): Promise<number> {
    return this.volume;
  }
  
  async setVolume(level: number): Promise<void> {
    this.volume = Math.max(0, Math.min(100, Math.round(level)));
    console.log(`[MockAudio] 🔊 Volume set to ${this.volume}%`);
  }
  
  async adjustVolume(delta: number): Promise<number> {
    const newVolume = Math.max(0, Math.min(100, this.volume + delta));
    await this.setVolume(newVolume);
    return newVolume;
  }
  
  async setMute(muted: boolean): Promise<void> {
    console.log(`[MockAudio] ${muted ? '🔇 Muted' : '🔊 Unmuted'}`);
  }
  
  async close(): Promise<void> {
    console.log('[MockAudio] Closed audio device');
    this.state = RecordingState.IDLE;
    this.recordingBuffer = null;
  }
}

/**
 * Mock Display Device
 * 
 * Simulates OLED display with console output.
 * Renders a text-based representation of the display.
 */
class MockDisplayDevice implements DisplayDevice {
  private width: number = 128;
  private height: number = 64;
  private buffer: string[][] = [];
  private powered: boolean = false;
  
  async init(): Promise<void> {
    console.log(`[MockDisplay] 📺 Initialized ${this.width}x${this.height} OLED display`);
    this.powered = true;
    await this.clear();
  }
  
  async clear(): Promise<void> {
    // Initialize empty buffer
    this.buffer = Array(this.height).fill(null).map(() => Array(this.width).fill(' '));
  }
  
  async writeText(text: string, x: number, y: number, size: number = 1): Promise<void> {
    // Simplified text rendering - just track what would be written
    const row = Math.floor(y / 10); // Approximate line number
    if (row >= 0 && row < this.buffer.length) {
      const col = Math.floor(x / 6); // Approximate char position
      for (let i = 0; i < text.length && col + i < this.width; i++) {
        if (this.buffer[row]) {
          this.buffer[row][col + i] = text[i];
        }
      }
    }
  }
  
  async drawBitmap(bitmap: Buffer, x: number, y: number, width: number, height: number): Promise<void> {
    // Bitmap rendering not fully implemented in mock
    console.log(`[MockDisplay] Drawing bitmap at (${x},${y}) size ${width}x${height}`);
  }
  
  async update(): Promise<void> {
    if (!this.powered) return;
    
    // Render current buffer to console
    const border = '═'.repeat(this.width / 2 + 2);
    console.log(`\n╔${border}╗`);
    
    // Render visible lines (every 10th row represents a text line)
    for (let row = 0; row < this.buffer.length; row += 10) {
      const line = this.buffer[row].join('').substring(0, this.width / 2);
      console.log(`║ ${line.padEnd(this.width / 2)} ║`);
    }
    
    console.log(`╚${border}╝\n`);
  }
  
  async setPower(on: boolean): Promise<void> {
    this.powered = on;
    console.log(`[MockDisplay] ${on ? '🟢 Display ON' : '⚫ Display OFF'}`);
  }
  
  getDimensions(): { width: number; height: number } {
    return { width: this.width, height: this.height };
  }
  
  async close(): Promise<void> {
    console.log('[MockDisplay] Closed display device');
    this.powered = false;
  }
}

/**
 * Mock Input Device
 * 
 * Simulates GPIO buttons and rotary encoder.
 * Uses stdin for interactive simulation (optional).
 */
class MockInputDevice extends EventEmitter implements InputDevice {
  private initialized: boolean = false;
  private stdinListening: boolean = false;
  
  async init(): Promise<void> {
    console.log('[MockInput] 🎮 Initialized GPIO inputs');
    console.log('[MockInput] Keyboard controls:');
    console.log('  - Space: PTT press/release');
    console.log('  - W/S: Encoder rotate up/down');
    console.log('  - E: Encoder button press');
    
    this.initialized = true;
    this.setupKeyboardInput();
  }
  
  /**
   * Setup keyboard input for manual testing (optional)
   */
  private setupKeyboardInput(): void {
    if (this.stdinListening || !process.stdin.isTTY) {
      return;
    }
    
    // Enable raw mode for keystroke detection
    try {
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.setEncoding('utf8');
      
      let pttPressed = false;
      
      process.stdin.on('data', (key: string) => {
        // Ctrl+C to exit
        if (key === '\u0003') {
          process.exit();
        }
        
        // Space: PTT toggle
        if (key === ' ') {
          if (!pttPressed) {
            pttPressed = true;
            console.log('[MockInput] → PTT PRESSED');
            this.emit(HardwareEvent.PTT_PRESS);
          } else {
            pttPressed = false;
            console.log('[MockInput] → PTT RELEASED');
            this.emit(HardwareEvent.PTT_RELEASE);
          }
        }
        
        // W: Encoder rotate clockwise
        if (key === 'w' || key === 'W') {
          console.log('[MockInput] → ENCODER CW');
          this.emit(HardwareEvent.ENCODER_CW);
        }
        
        // S: Encoder rotate counter-clockwise
        if (key === 's' || key === 'S') {
          console.log('[MockInput] → ENCODER CCW');
          this.emit(HardwareEvent.ENCODER_CCW);
        }
        
        // E: Encoder button
        if (key === 'e' || key === 'E') {
          console.log('[MockInput] → ENCODER BUTTON');
          this.emit(HardwareEvent.ENCODER_BUTTON);
        }
      });
      
      this.stdinListening = true;
    } catch (err) {
      console.log('[MockInput] Keyboard input not available (not a TTY)');
    }
  }
  
  on(event: HardwareEvent, handler: HardwareEventHandler): this {
    return super.on(event, handler);
  }
  
  off(event: HardwareEvent, handler: HardwareEventHandler): this {
    return super.off(event, handler);
  }
  
  /**
   * Simulate hardware event (for programmatic testing)
   */
  simulateEvent(event: HardwareEvent, data?: any): void {
    console.log(`[MockInput] 🎭 Simulating event: ${event}`, data || '');
    this.emit(event, data);
  }
  
  async close(): Promise<void> {
    console.log('[MockInput] Closed input device');
    
    if (this.stdinListening && process.stdin.isTTY) {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      this.stdinListening = false;
    }
    
    this.initialized = false;
    this.removeAllListeners();
  }
}

/**
 * Mock Voice Hardware
 * 
 * Complete mock implementation of VoiceHardware interface.
 * Allows full testing of voice channel without physical hardware.
 */
export class MockVoiceHardware implements VoiceHardware {
  readonly type = 'mock' as const;
  readonly audio: AudioDevice;
  readonly display: DisplayDevice;
  readonly input: InputDevice;
  
  private initialized: boolean = false;
  
  constructor() {
    this.audio = new MockAudioDevice();
    this.display = new MockDisplayDevice();
    this.input = new MockInputDevice();
  }
  
  async init(config: VoiceConfig): Promise<void> {
    console.log('\n═══════════════════════════════════════');
    console.log('🎭 MOCK HARDWARE INITIALIZATION');
    console.log('═══════════════════════════════════════\n');
    
    console.log('[MockHardware] Initializing with config:');
    console.log(`  - Display: ${config.hardware.display.width}x${config.hardware.display.height}`);
    console.log(`  - Audio: ${config.hardware.audio.sampleRate}Hz, ${config.hardware.audio.format}`);
    console.log(`  - GPIO: PTT=${config.hardware.gpio.pttButton}, Encoder=${config.hardware.gpio.encoderA}/${config.hardware.gpio.encoderB}`);
    console.log('');
    
    await this.display.init();
    await this.input.init();
    
    this.initialized = true;
    
    console.log('\n✓ Mock hardware ready');
    console.log('═══════════════════════════════════════\n');
  }
  
  async close(): Promise<void> {
    console.log('\n[MockHardware] Shutting down...');
    
    await this.audio.close();
    await this.display.close();
    await this.input.close();
    
    this.initialized = false;
    
    console.log('✓ Mock hardware closed\n');
  }
  
  /**
   * Check if hardware is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }
  
  /**
   * Get mock input device for programmatic control
   */
  getMockInput(): MockInputDevice {
    return this.input as MockInputDevice;
  }
}

/**
 * Factory function to create mock hardware
 */
export async function createMockHardware(config: VoiceConfig): Promise<VoiceHardware> {
  const hardware = new MockVoiceHardware();
  await hardware.init(config);
  return hardware;
}

/**
 * Utility: Simulate a complete voice interaction for testing
 */
export async function simulateVoiceInteraction(
  hardware: MockVoiceHardware,
  transcribedText: string,
  responseAudio: Buffer
): Promise<void> {
  console.log('\n🎬 Simulating voice interaction...\n');
  
  // 1. User presses PTT
  const mockInput = hardware.getMockInput();
  mockInput.simulateEvent(HardwareEvent.PTT_PRESS);
  
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // 2. Start recording
  await hardware.audio.startRecording();
  
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // 3. User releases PTT
  mockInput.simulateEvent(HardwareEvent.PTT_RELEASE);
  
  // 4. Stop recording
  const audioBuffer = await hardware.audio.stopRecording();
  console.log(`\n[Simulation] 📝 Transcribed: "${transcribedText}"\n`);
  
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // 5. Play response
  await hardware.audio.playAudio(responseAudio, 'opus');
  
  console.log('\n✓ Interaction simulation complete\n');
}

/**
 * Utility: Create test audio buffer
 */
export function createTestAudioBuffer(durationMs: number, sampleRate: number = 16000): Buffer {
  const samples = Math.floor((durationMs / 1000) * sampleRate);
  const buffer = Buffer.alloc(samples * 2); // 16-bit samples
  
  // Generate simple sine wave for testing
  for (let i = 0; i < samples; i++) {
    const t = i / sampleRate;
    const frequency = 440; // A4 note
    const amplitude = 16384; // Half of 16-bit range
    const sample = Math.sin(2 * Math.PI * frequency * t) * amplitude;
    buffer.writeInt16LE(Math.floor(sample), i * 2);
  }
  
  return buffer;
}
