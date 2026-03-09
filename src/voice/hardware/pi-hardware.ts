/**
 * Real Raspberry Pi hardware implementation
 * Uses GPIO, SPI, and audio devices
 */

import type { ScreenState, VoiceHardware } from "./types.js";
import { getChildLogger } from "../../logging.js";

const log = getChildLogger("pi-hardware");

// Type definitions for native modules (we'll use dynamic imports)
type GPIO = any;
type SPI = any;

export type PiHardwareConfig = {
  gpio: {
    pttButton: number;
    encoderClk: number;
    encoderDt: number;
    encoderSw: number;
    oledDc: number;
    oledRst: number;
  };
  spi: {
    bus: number; // 0 for /dev/spidev0.0
    device: number; // 0 for CE0
  };
  audio: {
    device: string; // e.g., "plughw:3,0"
    rate: number; // e.g., 16000
    chunkSize: number; // e.g., 1024
  };
  display: {
    width: number;
    height: number;
  };
};

export class PiHardware implements VoiceHardware {
  private config: PiHardwareConfig;
  private gpio?: typeof import("onoff");
  private spi?: any; // spi-device
  private pttCallback?: (pressed: boolean) => void;
  private rotateCallback?: (delta: number) => void;
  private pressCallback?: () => void;

  // GPIO pins
  private pttPin?: GPIO;
  private encoderClkPin?: GPIO;
  private encoderDtPin?: GPIO;
  private encoderSwPin?: GPIO;
  private oledDcPin?: GPIO;
  private oledRstPin?: GPIO;

  // State
  private lastClkState = 1;
  private isRecording = false;
  private audioBuffer: Buffer[] = [];

  constructor(config: PiHardwareConfig) {
    this.config = config;
  }

  async initialize(): Promise<boolean> {
    try {
      log.info("Initializing Pi hardware...");

      // Import GPIO library
      try {
        this.gpio = await import("onoff");
        log.debug("GPIO library loaded (onoff)");
      } catch (err) {
        log.error("Failed to load GPIO library. Is 'onoff' installed?", err);
        return false;
      }

      // Initialize GPIO pins
      await this.initializeGPIO();

      // Initialize SPI for OLED
      await this.initializeSPI();

      // Initialize OLED display
      await this.initializeDisplay();

      log.info("✓ Pi hardware initialized");
      return true;
    } catch (err) {
      log.error("Failed to initialize Pi hardware:", err);
      return false;
    }
  }

  private async initializeGPIO(): Promise<void> {
    if (!this.gpio) throw new Error("GPIO not loaded");

    const { Gpio } = this.gpio;

    // Push-to-talk button (input with pull-up)
    this.pttPin = new Gpio(this.config.gpio.pttButton, "in", "both", {
      debounceTimeout: 10,
    });
    this.pttPin.watch((err: Error | null, value: number) => {
      if (err) {
        log.error("PTT pin error:", err);
        return;
      }
      // Pull-up: 0 = pressed, 1 = released
      const pressed = value === 0;
      if (this.pttCallback) {
        this.pttCallback(pressed);
      }
    });

    // Encoder CLK (input with pull-up, edge detection)
    this.encoderClkPin = new Gpio(this.config.gpio.encoderClk, "in", "both", {
      debounceTimeout: 1,
    });
    this.encoderClkPin.watch((err: Error | null, clkValue: number) => {
      if (err) {
        log.error("Encoder CLK error:", err);
        return;
      }
      // Check DT state on CLK falling edge
      if (clkValue === 0 && this.lastClkState === 1) {
        if (this.encoderDtPin) {
          const dtValue = this.encoderDtPin.readSync();
          const delta = dtValue === 0 ? 1 : -1; // Clockwise if DT low
          if (this.rotateCallback) {
            this.rotateCallback(delta);
          }
        }
      }
      this.lastClkState = clkValue;
    });

    // Encoder DT (input with pull-up, no edge detection needed)
    this.encoderDtPin = new Gpio(this.config.gpio.encoderDt, "in");

    // Encoder button (input with pull-up, falling edge)
    this.encoderSwPin = new Gpio(this.config.gpio.encoderSw, "in", "falling", {
      debounceTimeout: 200,
    });
    this.encoderSwPin.watch((err: Error | null) => {
      if (err) {
        log.error("Encoder SW error:", err);
        return;
      }
      if (this.pressCallback) {
        this.pressCallback();
      }
    });

    // OLED control pins (output)
    this.oledDcPin = new Gpio(this.config.gpio.oledDc, "out");
    this.oledRstPin = new Gpio(this.config.gpio.oledRst, "out");

    log.debug("GPIO pins initialized");
  }

  private async initializeSPI(): Promise<void> {
    try {
      const spiDevice = await import("spi-device");
      const bus = this.config.spi.bus;
      const device = this.config.spi.device;

      this.spi = spiDevice.open(bus, device, (err: Error | null) => {
        if (err) throw err;
      });

      log.debug(`SPI initialized: /dev/spidev${bus}.${device}`);
    } catch (err) {
      log.warn("SPI library not available, OLED will not work:", err);
      // Continue anyway - mock display updates
    }
  }

  private async initializeDisplay(): Promise<void> {
    if (!this.oledRstPin || !this.spi) {
      log.warn("Display not available (missing SPI or GPIO)");
      return;
    }

    // Hardware reset
    this.oledRstPin.writeSync(0);
    await this.sleep(100);
    this.oledRstPin.writeSync(1);
    await this.sleep(100);

    // SSD1309 initialization sequence
    const initSequence = [
      0xae, // Display OFF
      0xd5, 0x80, // Set display clock
      0xa8, 0x3f, // Set multiplex (64 lines)
      0xd3, 0x00, // Display offset = 0
      0x40, // Start line = 0
      0x8d, 0x14, // Enable charge pump
      0x20, 0x00, // Horizontal addressing mode
      0xa1, // Segment remap
      0xc8, // COM scan direction
      0xda, 0x12, // COM pins
      0x81, 0xcf, // Contrast
      0xd9, 0xf1, // Pre-charge
      0xdb, 0x40, // VCOMH
      0xa4, // Display follows RAM
      0xa6, // Normal display
      0xaf, // Display ON
    ];

    for (const cmd of initSequence) {
      await this.sendCommand(cmd);
      await this.sleep(1);
    }

    // Clear display
    await this.clearDisplay();

    log.debug("OLED display initialized");
  }

  private async sendCommand(cmd: number): Promise<void> {
    if (!this.oledDcPin || !this.spi) return;

    // DC low = command mode
    this.oledDcPin.writeSync(0);

    return new Promise((resolve, reject) => {
      const buffer = Buffer.from([cmd]);
      this.spi.transfer([{ sendBuffer: buffer, byteLength: 1 }], (err: Error | null) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  private async sendData(data: number[] | Buffer): Promise<void> {
    if (!this.oledDcPin || !this.spi) return;

    // DC high = data mode
    this.oledDcPin.writeSync(1);

    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);

    return new Promise((resolve, reject) => {
      this.spi.transfer([{ sendBuffer: buffer, byteLength: buffer.length }], (err: Error | null) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  private async clearDisplay(): Promise<void> {
    // Set column address
    await this.sendCommand(0x21);
    await this.sendCommand(0);
    await this.sendCommand(127);

    // Set page address
    await this.sendCommand(0x22);
    await this.sendCommand(0);
    await this.sendCommand(7);

    // Send zeros
    const zeros = Buffer.alloc(128 * 8, 0);
    await this.sendData(zeros);
  }

  async cleanup(): Promise<void> {
    log.info("Cleaning up Pi hardware...");

    // Unexport GPIO pins
    if (this.pttPin) this.pttPin.unexport();
    if (this.encoderClkPin) this.encoderClkPin.unexport();
    if (this.encoderDtPin) this.encoderDtPin.unexport();
    if (this.encoderSwPin) this.encoderSwPin.unexport();
    if (this.oledDcPin) this.oledDcPin.unexport();
    if (this.oledRstPin) this.oledRstPin.unexport();

    // Clear display
    if (this.spi) {
      await this.clearDisplay();
      this.spi.close(() => {});
    }

    log.info("Pi hardware cleaned up");
  }

  async recordAudio(): Promise<Buffer> {
    // TODO: Implement audio recording using arecord or native bindings
    // For now, return empty buffer
    log.warn("Audio recording not yet implemented");
    return Buffer.alloc(0);
  }

  async playAudio(buffer: Buffer): Promise<void> {
    // TODO: Implement audio playback using aplay or native bindings
    log.warn("Audio playback not yet implemented");
  }

  updateDisplay(screen: ScreenState): void {
    // TODO: Implement full OLED rendering
    // For now, just log
    log.debug(`Display update: ${screen.type}`, screen.content);

    // In Phase 3, we'll render to actual OLED here
  }

  onPushToTalk(callback: (pressed: boolean) => void): void {
    this.pttCallback = callback;
  }

  onEncoderRotate(callback: (delta: number) => void): void {
    this.rotateCallback = callback;
  }

  onEncoderPress(callback: () => void): void {
    this.pressCallback = callback;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
