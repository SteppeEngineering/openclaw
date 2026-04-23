/**
 * SPI and I2C OLED Display Driver for Raspberry Pi 5
 * 
 * Supports SSD1306 OLED displays via I2C.
 * Provides hardware-accelerated text rendering and graphics.
 */

import { spawn } from 'child_process';
import { writeFile, readFile } from 'fs/promises';

/**
 * I2C Bus Interface
 * 
 * Low-level I2C communication using i2c-tools or native bindings.
 */
class I2CBus {
  private busNumber: number;
  
  constructor(busNumber: number) {
    this.busNumber = busNumber;
  }
  
  /**
   * Write a byte to a register
   */
  async writeByte(address: number, register: number, value: number): Promise<void> {
    return new Promise((resolve, reject) => {
      // Use i2cset command: i2cset -y <bus> <address> <register> <value>
      const proc = spawn('i2cset', [
        '-y',
        `${this.busNumber}`,
        `0x${address.toString(16)}`,
        `0x${register.toString(16)}`,
        `0x${value.toString(16)}`
      ]);
      
      proc.on('error', (err) => {
        reject(new Error(`I2C write failed: ${err.message}`));
      });
      
      proc.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`i2cset exited with code ${code}`));
        }
      });
    });
  }
  
  /**
   * Write a block of data
   */
  async writeBlock(address: number, register: number, data: Buffer): Promise<void> {
    // For block writes, we need to use i2ctransfer or implement native binding
    // Simplified approach: write bytes sequentially (slower but compatible)
    for (let i = 0; i < data.length; i++) {
      await this.writeByte(address, register, data[i]);
    }
  }
  
  /**
   * Read a byte from a register
   */
  async readByte(address: number, register: number): Promise<number> {
    return new Promise((resolve, reject) => {
      const proc = spawn('i2cget', [
        '-y',
        `${this.busNumber}`,
        `0x${address.toString(16)}`,
        `0x${register.toString(16)}`
      ]);
      
      let output = '';
      
      proc.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      proc.on('error', (err) => {
        reject(new Error(`I2C read failed: ${err.message}`));
      });
      
      proc.on('close', (code) => {
        if (code === 0) {
          const value = parseInt(output.trim(), 16);
          resolve(value);
        } else {
          reject(new Error(`i2cget exited with code ${code}`));
        }
      });
    });
  }
}

/**
 * SSD1306 OLED Display Driver
 * 
 * Monochrome OLED display driver for 128x64 and 128x32 variants.
 * Uses I2C communication protocol.
 */
export class SSD1306Display {
  private i2c: I2CBus;
  private address: number;
  private width: number;
  private height: number;
  private buffer: Buffer;
  private initialized: boolean = false;
  
  // SSD1306 commands
  private static readonly CMD_DISPLAY_OFF = 0xAE;
  private static readonly CMD_DISPLAY_ON = 0xAF;
  private static readonly CMD_SET_CONTRAST = 0x81;
  private static readonly CMD_SET_DISPLAY_CLK = 0xD5;
  private static readonly CMD_SET_MULTIPLEX = 0xA8;
  private static readonly CMD_SET_DISPLAY_OFFSET = 0xD3;
  private static readonly CMD_SET_START_LINE = 0x40;
  private static readonly CMD_CHARGE_PUMP = 0x8D;
  private static readonly CMD_MEMORY_MODE = 0x20;
  private static readonly CMD_SEG_REMAP = 0xA1;
  private static readonly CMD_COM_SCAN_DEC = 0xC8;
  private static readonly CMD_SET_COM_PINS = 0xDA;
  private static readonly CMD_SET_PRECHARGE = 0xD9;
  private static readonly CMD_SET_VCOM_DETECT = 0xDB;
  private static readonly CMD_DISPLAY_ALL_ON_RESUME = 0xA4;
  private static readonly CMD_NORMAL_DISPLAY = 0xA6;
  
  constructor(busNumber: number, address: number, width: number, height: number) {
    this.i2c = new I2CBus(busNumber);
    this.address = address;
    this.width = width;
    this.height = height;
    
    // Allocate display buffer (1 bit per pixel)
    const bufferSize = (width * height) / 8;
    this.buffer = Buffer.alloc(bufferSize);
  }
  
  /**
   * Initialize the display
   */
  async init(): Promise<void> {
    if (this.initialized) return;
    
    // Send initialization sequence
    await this.command(SSD1306Display.CMD_DISPLAY_OFF);
    
    await this.command(SSD1306Display.CMD_SET_DISPLAY_CLK);
    await this.command(0x80); // Default clock divider
    
    await this.command(SSD1306Display.CMD_SET_MULTIPLEX);
    await this.command(this.height - 1);
    
    await this.command(SSD1306Display.CMD_SET_DISPLAY_OFFSET);
    await this.command(0x00); // No offset
    
    await this.command(SSD1306Display.CMD_SET_START_LINE | 0x00);
    
    await this.command(SSD1306Display.CMD_CHARGE_PUMP);
    await this.command(0x14); // Enable charge pump
    
    await this.command(SSD1306Display.CMD_MEMORY_MODE);
    await this.command(0x00); // Horizontal addressing mode
    
    await this.command(SSD1306Display.CMD_SEG_REMAP);
    await this.command(SSD1306Display.CMD_COM_SCAN_DEC);
    
    await this.command(SSD1306Display.CMD_SET_COM_PINS);
    await this.command(this.height === 32 ? 0x02 : 0x12);
    
    await this.command(SSD1306Display.CMD_SET_CONTRAST);
    await this.command(0xCF); // Max contrast
    
    await this.command(SSD1306Display.CMD_SET_PRECHARGE);
    await this.command(0xF1);
    
    await this.command(SSD1306Display.CMD_SET_VCOM_DETECT);
    await this.command(0x40);
    
    await this.command(SSD1306Display.CMD_DISPLAY_ALL_ON_RESUME);
    await this.command(SSD1306Display.CMD_NORMAL_DISPLAY);
    
    await this.command(SSD1306Display.CMD_DISPLAY_ON);
    
    this.initialized = true;
    
    // Clear display
    await this.clear();
    await this.update();
  }
  
  /**
   * Send a command byte
   */
  private async command(cmd: number): Promise<void> {
    await this.i2c.writeByte(this.address, 0x00, cmd); // 0x00 = command mode
  }
  
  /**
   * Send data bytes
   */
  private async data(bytes: Buffer): Promise<void> {
    // For data, prefix with 0x40
    for (const byte of bytes) {
      await this.i2c.writeByte(this.address, 0x40, byte);
    }
  }
  
  /**
   * Clear the display buffer
   */
  clear(): void {
    this.buffer.fill(0);
  }
  
  /**
   * Set a pixel in the buffer
   */
  setPixel(x: number, y: number, on: boolean = true): void {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
      return;
    }
    
    const byteIndex = Math.floor(y / 8) * this.width + x;
    const bitIndex = y % 8;
    
    if (on) {
      this.buffer[byteIndex] |= (1 << bitIndex);
    } else {
      this.buffer[byteIndex] &= ~(1 << bitIndex);
    }
  }
  
  /**
   * Draw a horizontal line
   */
  drawHLine(x: number, y: number, length: number): void {
    for (let i = 0; i < length; i++) {
      this.setPixel(x + i, y);
    }
  }
  
  /**
   * Draw a vertical line
   */
  drawVLine(x: number, y: number, length: number): void {
    for (let i = 0; i < length; i++) {
      this.setPixel(x, y + i);
    }
  }
  
  /**
   * Draw a rectangle
   */
  drawRect(x: number, y: number, width: number, height: number, fill: boolean = false): void {
    if (fill) {
      for (let dy = 0; dy < height; dy++) {
        this.drawHLine(x, y + dy, width);
      }
    } else {
      this.drawHLine(x, y, width);
      this.drawHLine(x, y + height - 1, width);
      this.drawVLine(x, y, height);
      this.drawVLine(x + width - 1, y, height);
    }
  }
  
  /**
   * Simple 5x7 font bitmap (uppercase only)
   * Each character is 5 bytes wide, 8 pixels tall
   */
  private static readonly FONT_5X7: { [char: string]: number[] } = {
    ' ': [0x00, 0x00, 0x00, 0x00, 0x00],
    'A': [0x7C, 0x12, 0x11, 0x12, 0x7C],
    'B': [0x7F, 0x49, 0x49, 0x49, 0x36],
    'C': [0x3E, 0x41, 0x41, 0x41, 0x22],
    'D': [0x7F, 0x41, 0x41, 0x22, 0x1C],
    'E': [0x7F, 0x49, 0x49, 0x49, 0x41],
    'F': [0x7F, 0x09, 0x09, 0x09, 0x01],
    'G': [0x3E, 0x41, 0x49, 0x49, 0x7A],
    'H': [0x7F, 0x08, 0x08, 0x08, 0x7F],
    'I': [0x00, 0x41, 0x7F, 0x41, 0x00],
    'J': [0x20, 0x40, 0x41, 0x3F, 0x01],
    'K': [0x7F, 0x08, 0x14, 0x22, 0x41],
    'L': [0x7F, 0x40, 0x40, 0x40, 0x40],
    'M': [0x7F, 0x02, 0x0C, 0x02, 0x7F],
    'N': [0x7F, 0x04, 0x08, 0x10, 0x7F],
    'O': [0x3E, 0x41, 0x41, 0x41, 0x3E],
    'P': [0x7F, 0x09, 0x09, 0x09, 0x06],
    'Q': [0x3E, 0x41, 0x51, 0x21, 0x5E],
    'R': [0x7F, 0x09, 0x19, 0x29, 0x46],
    'S': [0x46, 0x49, 0x49, 0x49, 0x31],
    'T': [0x01, 0x01, 0x7F, 0x01, 0x01],
    'U': [0x3F, 0x40, 0x40, 0x40, 0x3F],
    'V': [0x1F, 0x20, 0x40, 0x20, 0x1F],
    'W': [0x3F, 0x40, 0x38, 0x40, 0x3F],
    'X': [0x63, 0x14, 0x08, 0x14, 0x63],
    'Y': [0x07, 0x08, 0x70, 0x08, 0x07],
    'Z': [0x61, 0x51, 0x49, 0x45, 0x43],
    '0': [0x3E, 0x51, 0x49, 0x45, 0x3E],
    '1': [0x00, 0x42, 0x7F, 0x40, 0x00],
    '2': [0x42, 0x61, 0x51, 0x49, 0x46],
    '3': [0x21, 0x41, 0x45, 0x4B, 0x31],
    '4': [0x18, 0x14, 0x12, 0x7F, 0x10],
    '5': [0x27, 0x45, 0x45, 0x45, 0x39],
    '6': [0x3C, 0x4A, 0x49, 0x49, 0x30],
    '7': [0x01, 0x71, 0x09, 0x05, 0x03],
    '8': [0x36, 0x49, 0x49, 0x49, 0x36],
    '9': [0x06, 0x49, 0x49, 0x29, 0x1E],
    '.': [0x00, 0x60, 0x60, 0x00, 0x00],
    ':': [0x00, 0x36, 0x36, 0x00, 0x00],
    '!': [0x00, 0x00, 0x5F, 0x00, 0x00],
    '?': [0x02, 0x01, 0x51, 0x09, 0x06],
    '-': [0x08, 0x08, 0x08, 0x08, 0x08],
    '_': [0x40, 0x40, 0x40, 0x40, 0x40],
  };
  
  /**
   * Write text at position (using simple bitmap font)
   */
  writeText(text: string, x: number, y: number, scale: number = 1): void {
    let cursorX = x;
    
    for (const char of text.toUpperCase()) {
      const glyph = SSD1306Display.FONT_5X7[char] || SSD1306Display.FONT_5X7[' '];
      
      for (let col = 0; col < 5; col++) {
        const columnData = glyph[col];
        
        for (let row = 0; row < 8; row++) {
          const bit = (columnData >> row) & 1;
          
          if (bit) {
            // Scale the pixel if needed
            for (let sx = 0; sx < scale; sx++) {
              for (let sy = 0; sy < scale; sy++) {
                this.setPixel(cursorX + col * scale + sx, y + row * scale + sy);
              }
            }
          }
        }
      }
      
      cursorX += 6 * scale; // 5 pixels + 1 spacing
    }
  }
  
  /**
   * Update the display with buffer contents
   */
  async update(): Promise<void> {
    if (!this.initialized) {
      throw new Error('Display not initialized');
    }
    
    // Set column address range
    await this.command(0x21); // Column address command
    await this.command(0);    // Start column
    await this.command(this.width - 1); // End column
    
    // Set page address range
    await this.command(0x22); // Page address command
    await this.command(0);    // Start page
    await this.command((this.height / 8) - 1); // End page
    
    // Send buffer data
    await this.data(this.buffer);
  }
  
  /**
   * Set display power
   */
  async setPower(on: boolean): Promise<void> {
    await this.command(on ? SSD1306Display.CMD_DISPLAY_ON : SSD1306Display.CMD_DISPLAY_OFF);
  }
  
  /**
   * Set display contrast (0-255)
   */
  async setContrast(level: number): Promise<void> {
    await this.command(SSD1306Display.CMD_SET_CONTRAST);
    await this.command(Math.max(0, Math.min(255, level)));
  }
  
  /**
   * Get display dimensions
   */
  getDimensions(): { width: number; height: number } {
    return { width: this.width, height: this.height };
  }
  
  /**
   * Close the display
   */
  async close(): Promise<void> {
    if (this.initialized) {
      await this.setPower(false);
      this.initialized = false;
    }
  }
}
