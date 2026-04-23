/**
 * Raspberry Pi 5 Hardware Implementation
 * 
 * Production hardware adapter for ShopClaw voice interface.
 * Integrates GPIO, I2C OLED, and ALSA audio on Raspberry Pi 5.
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
import { GPIO, GPIOMode, GPIOEdge, GPIOValue, DebouncedButton, RotaryEncoder } from './gpio';
import { SSD1306Display } from './spi';
import { ALSAAudioDevice, createAudioDevice, type AudioFormat } from './audio';

/**
 * Pi Audio Device Wrapper
 * 
 * Wraps ALSA audio device to match VoiceHardware interface.
 */
class PiAudioDevice implements AudioDevice {
  private device: ALSAAudioDevice;
  
  constructor(device: ALSAAudioDevice) {
    this.device = device;
  }
  
  async startRecording(): Promise<void> {
    console.log('[PiAudio] 🎤 Starting recording...');
    await this.device.startRecording();
  }
  
  async stopRecording(): Promise<Buffer> {
    console.log('[PiAudio] ⏹️  Stopping recording...');
    const buffer = await this.device.stopRecording();
    console.log(`[PiAudio] ✓ Recorded ${buffer.length} bytes`);
    return buffer;
  }
  
  async playAudio(audioData: Buffer, format: string = 'wav'): Promise<void> {
    console.log(`[PiAudio] 🔊 Playing audio (${audioData.length} bytes, format: ${format})`);
    await this.device.playAudio(audioData, format);
    console.log('[PiAudio] ✓ Playback complete');
  }
  
  getRecordingState(): RecordingState {
    return this.device.getRecordingState();
  }
  
  async close(): Promise<void> {
    console.log('[PiAudio] Closing audio device');
    await this.device.close();
  }
}

/**
 * Pi Display Device Wrapper
 * 
 * Wraps SSD1306 OLED to match VoiceHardware interface.
 */
class PiDisplayDevice implements DisplayDevice {
  private display: SSD1306Display;
  private width: number;
  private height: number;
  
  constructor(display: SSD1306Display) {
    this.display = display;
    const dims = display.getDimensions();
    this.width = dims.width;
    this.height = dims.height;
  }
  
  async init(): Promise<void> {
    console.log(`[PiDisplay] 📺 Initializing ${this.width}x${this.height} OLED display...`);
    await this.display.init();
    console.log('[PiDisplay] ✓ Display initialized');
  }
  
  async clear(): Promise<void> {
    this.display.clear();
  }
  
  async writeText(text: string, x: number, y: number, size: number = 1): Promise<void> {
    this.display.writeText(text, x, y, size);
  }
  
  async drawBitmap(bitmap: Buffer, x: number, y: number, width: number, height: number): Promise<void> {
    // Bitmap drawing would require parsing the buffer format
    // For now, just draw a placeholder rectangle
    console.log(`[PiDisplay] Drawing bitmap at (${x},${y}) size ${width}x${height}`);
    this.display.drawRect(x, y, width, height);
  }
  
  async update(): Promise<void> {
    await this.display.update();
  }
  
  async setPower(on: boolean): Promise<void> {
    console.log(`[PiDisplay] ${on ? '🟢 Display ON' : '⚫ Display OFF'}`);
    await this.display.setPower(on);
  }
  
  getDimensions(): { width: number; height: number } {
    return { width: this.width, height: this.height };
  }
  
  async close(): Promise<void> {
    console.log('[PiDisplay] Closing display device');
    await this.display.close();
  }
}

/**
 * Pi Input Device
 * 
 * Manages GPIO buttons and rotary encoder.
 */
class PiInputDevice extends EventEmitter implements InputDevice {
  private pttButton: DebouncedButton | null = null;
  private encoder: RotaryEncoder | null = null;
  private encoderButton: DebouncedButton | null = null;
  
  private config: VoiceConfig['hardware']['gpio'];
  
  constructor(config: VoiceConfig['hardware']['gpio']) {
    super();
    this.config = config;
  }
  
  async init(): Promise<void> {
    console.log('[PiInput] 🎮 Initializing GPIO inputs...');
    
    // Initialize PTT button (GPIO input with pull-up)
    const pttPin = await GPIO.openInput(this.config.pttButton);
    this.pttButton = new DebouncedButton(pttPin, 50); // 50ms debounce
    
    // Watch for press and release
    await this.pttButton.watchBoth(
      () => {
        console.log('[PiInput] → PTT PRESSED');
        this.emit(HardwareEvent.PTT_PRESS);
      },
      () => {
        console.log('[PiInput] → PTT RELEASED');
        this.emit(HardwareEvent.PTT_RELEASE);
      }
    );
    
    // Initialize rotary encoder
    const encoderA = await GPIO.openInput(this.config.encoderA);
    const encoderB = await GPIO.openInput(this.config.encoderB);
    this.encoder = new RotaryEncoder(encoderA, encoderB);
    
    this.encoder.on('clockwise', () => {
      console.log('[PiInput] → ENCODER CW');
      this.emit(HardwareEvent.ENCODER_CW);
    });
    
    this.encoder.on('counterclockwise', () => {
      console.log('[PiInput] → ENCODER CCW');
      this.emit(HardwareEvent.ENCODER_CCW);
    });
    
    await this.encoder.start();
    
    // Initialize encoder button
    const encoderBtnPin = await GPIO.openInput(this.config.encoderButton);
    this.encoderButton = new DebouncedButton(encoderBtnPin, 50);
    
    await this.encoderButton.watchPress(() => {
      console.log('[PiInput] → ENCODER BUTTON');
      this.emit(HardwareEvent.ENCODER_BUTTON);
    });
    
    console.log('[PiInput] ✓ GPIO inputs ready');
    console.log(`[PiInput]   - PTT button: GPIO${this.config.pttButton}`);
    console.log(`[PiInput]   - Encoder: GPIO${this.config.encoderA}/${this.config.encoderB}`);
    console.log(`[PiInput]   - Encoder button: GPIO${this.config.encoderButton}`);
  }
  
  on(event: HardwareEvent, handler: HardwareEventHandler): this {
    return super.on(event, handler);
  }
  
  off(event: HardwareEvent, handler: HardwareEventHandler): this {
    return super.off(event, handler);
  }
  
  async close(): Promise<void> {
    console.log('[PiInput] Closing input devices');
    
    if (this.pttButton) {
      await this.pttButton.close();
      this.pttButton = null;
    }
    
    if (this.encoder) {
      await this.encoder.close();
      this.encoder = null;
    }
    
    if (this.encoderButton) {
      await this.encoderButton.close();
      this.encoderButton = null;
    }
    
    this.removeAllListeners();
  }
}

/**
 * Raspberry Pi 5 Voice Hardware
 * 
 * Complete hardware implementation for production voice interface.
 */
export class RaspberryPi5Hardware implements VoiceHardware {
  readonly type = 'real' as const;
  
  readonly audio: AudioDevice;
  readonly display: DisplayDevice;
  readonly input: InputDevice;
  
  private initialized: boolean = false;
  
  constructor(
    audio: PiAudioDevice,
    display: PiDisplayDevice,
    input: PiInputDevice
  ) {
    this.audio = audio;
    this.display = display;
    this.input = input;
  }
  
  async init(config: VoiceConfig): Promise<void> {
    if (this.initialized) {
      console.warn('[PiHardware] Already initialized');
      return;
    }
    
    console.log('\n═══════════════════════════════════════');
    console.log('🔧 RASPBERRY PI 5 HARDWARE INITIALIZATION');
    console.log('═══════════════════════════════════════\n');
    
    console.log('[PiHardware] Configuration:');
    console.log(`  - Display: ${config.hardware.display.width}x${config.hardware.display.height} @ I2C ${config.hardware.display.i2cBus}:0x${config.hardware.display.i2cAddress.toString(16)}`);
    console.log(`  - Audio: ${config.hardware.audio.sampleRate}Hz, ${config.hardware.audio.bitDepth}-bit, ${config.hardware.audio.channels}ch`);
    console.log(`  - Input: ${config.hardware.audio.inputDevice}`);
    console.log(`  - Output: ${config.hardware.audio.outputDevice}`);
    console.log(`  - GPIO Pins: PTT=${config.hardware.gpio.pttButton}, Encoder=${config.hardware.gpio.encoderA}/${config.hardware.gpio.encoderB}/${config.hardware.gpio.encoderButton}`);
    console.log('');
    
    try {
      // Initialize display
      await this.display.init();
      
      // Show startup message
      await this.display.clear();
      await this.display.writeText('ShopClaw', 0, 0, 2);
      await this.display.writeText('Initializing...', 0, 20, 1);
      await this.display.update();
      
      // Initialize input
      await this.input.init();
      
      // Update display
      await this.display.clear();
      await this.display.writeText('ShopClaw', 0, 0, 2);
      await this.display.writeText('Ready', 0, 20, 1);
      await this.display.update();
      
      this.initialized = true;
      
      console.log('\n✓ Raspberry Pi 5 hardware ready');
      console.log('═══════════════════════════════════════\n');
    } catch (err) {
      console.error('\n✗ Hardware initialization failed:', err);
      console.log('═══════════════════════════════════════\n');
      throw err;
    }
  }
  
  async close(): Promise<void> {
    if (!this.initialized) {
      return;
    }
    
    console.log('\n[PiHardware] Shutting down hardware...');
    
    try {
      // Show shutdown message
      await this.display.clear();
      await this.display.writeText('ShopClaw', 0, 0, 2);
      await this.display.writeText('Shutting down', 0, 20, 1);
      await this.display.update();
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Close all hardware
      await this.audio.close();
      await this.input.close();
      await this.display.close();
      
      this.initialized = false;
      
      console.log('✓ Hardware shutdown complete\n');
    } catch (err) {
      console.error('✗ Hardware shutdown error:', err);
      throw err;
    }
  }
  
  /**
   * Check if hardware is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }
}

/**
 * Factory: Create Raspberry Pi 5 hardware instance
 */
export async function createRaspberryPi5Hardware(config: VoiceConfig): Promise<VoiceHardware> {
  console.log('[PiHardware] Creating hardware instances...');
  
  // Create audio device
  const audioFormat: AudioFormat = {
    sampleRate: config.hardware.audio.sampleRate,
    bitDepth: config.hardware.audio.bitDepth,
    channels: config.hardware.audio.channels,
    format: config.hardware.audio.format,
  };
  
  const alsaDevice = await createAudioDevice(
    config.hardware.audio.inputDevice,
    config.hardware.audio.outputDevice,
    audioFormat
  );
  
  const audio = new PiAudioDevice(alsaDevice);
  
  // Create display device
  const oled = new SSD1306Display(
    config.hardware.display.i2cBus,
    config.hardware.display.i2cAddress,
    config.hardware.display.width,
    config.hardware.display.height
  );
  
  const display = new PiDisplayDevice(oled);
  
  // Create input device
  const input = new PiInputDevice(config.hardware.gpio);
  
  // Create complete hardware
  const hardware = new RaspberryPi5Hardware(audio, display, input);
  
  // Initialize
  await hardware.init(config);
  
  return hardware;
}

/**
 * Hardware status check
 * 
 * Verifies that all required hardware tools are available.
 */
export async function checkHardwareRequirements(): Promise<{
  available: boolean;
  missing: string[];
  warnings: string[];
}> {
  const missing: string[] = [];
  const warnings: string[] = [];
  
  // Check for GPIO tools
  const hasGpiod = await checkCommand('gpioget');
  if (!hasGpiod) {
    warnings.push('gpiod tools not found (will use sysfs fallback)');
  }
  
  // Check for I2C tools
  const hasI2C = await checkCommand('i2cget');
  if (!hasI2C) {
    missing.push('i2c-tools (install: sudo apt install i2c-tools)');
  }
  
  // Check for ALSA tools
  const hasArecord = await checkCommand('arecord');
  const hasAplay = await checkCommand('aplay');
  
  if (!hasArecord || !hasAplay) {
    missing.push('alsa-utils (install: sudo apt install alsa-utils)');
  }
  
  // Check for ffmpeg (optional but recommended)
  const hasFFmpeg = await checkCommand('ffmpeg');
  if (!hasFFmpeg) {
    warnings.push('ffmpeg not found (needed for audio format conversion)');
  }
  
  return {
    available: missing.length === 0,
    missing,
    warnings,
  };
}

/**
 * Check if a command is available
 */
async function checkCommand(command: string): Promise<boolean> {
  const { spawn } = await import('child_process');
  
  return new Promise((resolve) => {
    const proc = spawn('which', [command]);
    proc.on('close', (code) => {
      resolve(code === 0);
    });
    proc.on('error', () => {
      resolve(false);
    });
  });
}
