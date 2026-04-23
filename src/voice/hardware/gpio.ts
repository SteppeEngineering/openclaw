/**
 * GPIO Hardware Layer for Raspberry Pi 5
 * 
 * Provides GPIO access using the gpiod approach (kernel 4.8+).
 * Falls back to sysfs if gpiod is not available.
 */

import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import { readFile, writeFile, access } from 'fs/promises';
import { constants } from 'fs';

/**
 * GPIO pin mode
 */
export enum GPIOMode {
  INPUT = 'in',
  OUTPUT = 'out',
}

/**
 * GPIO edge detection
 */
export enum GPIOEdge {
  NONE = 'none',
  RISING = 'rising',
  FALLING = 'falling',
  BOTH = 'both',
}

/**
 * GPIO pull resistor configuration
 */
export enum GPIOPull {
  NONE = 'none',
  UP = 'up',
  DOWN = 'down',
}

/**
 * GPIO pin value
 */
export enum GPIOValue {
  LOW = 0,
  HIGH = 1,
}

/**
 * GPIO Pin Interface
 * 
 * Represents a single GPIO pin with read/write capabilities.
 */
export interface GPIOPin {
  /** Pin number (BCM numbering) */
  readonly pin: number;
  
  /** Set pin value (output mode) */
  write(value: GPIOValue): Promise<void>;
  
  /** Read pin value */
  read(): Promise<GPIOValue>;
  
  /** Enable edge detection (input mode) */
  watchEdge(edge: GPIOEdge, callback: (value: GPIOValue) => void): Promise<void>;
  
  /** Disable edge detection */
  unwatchEdge(): Promise<void>;
  
  /** Clean up pin resources */
  close(): Promise<void>;
}

/**
 * GPIO implementation using gpiod (modern approach)
 * 
 * Uses the libgpiod tools (gpioget, gpioset, gpiomon) for GPIO access.
 * These are available on modern Raspberry Pi OS.
 */
class GPIOdPin extends EventEmitter implements GPIOPin {
  readonly pin: number;
  private mode: GPIOMode;
  private watchProcess: ReturnType<typeof spawn> | null = null;
  private edgeCallback: ((value: GPIOValue) => void) | null = null;
  
  constructor(pin: number, mode: GPIOMode, pull: GPIOPull = GPIOPull.NONE) {
    super();
    this.pin = pin;
    this.mode = mode;
    
    // TODO: Pull resistor configuration with gpiod
    // libgpiod v2 supports bias flags, but command-line tools may need updating
    if (pull !== GPIOPull.NONE) {
      console.warn(`[GPIO] Pull resistor configuration not yet implemented for gpiod (pin ${pin})`);
    }
  }
  
  async write(value: GPIOValue): Promise<void> {
    if (this.mode !== GPIOMode.OUTPUT) {
      throw new Error(`Cannot write to pin ${this.pin} in ${this.mode} mode`);
    }
    
    return new Promise((resolve, reject) => {
      // Use gpioset to set pin value
      // Format: gpioset <chip> <offset>=<value>
      const proc = spawn('gpioset', ['gpiochip4', `${this.pin}=${value}`]);
      
      proc.on('error', (err) => {
        reject(new Error(`Failed to write GPIO ${this.pin}: ${err.message}`));
      });
      
      proc.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`gpioset exited with code ${code} for pin ${this.pin}`));
        }
      });
    });
  }
  
  async read(): Promise<GPIOValue> {
    return new Promise((resolve, reject) => {
      // Use gpioget to read pin value
      // Format: gpioget <chip> <offset>
      const proc = spawn('gpioget', ['gpiochip4', `${this.pin}`]);
      
      let output = '';
      
      proc.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      proc.on('error', (err) => {
        reject(new Error(`Failed to read GPIO ${this.pin}: ${err.message}`));
      });
      
      proc.on('close', (code) => {
        if (code === 0) {
          const value = parseInt(output.trim(), 10);
          resolve(value === 1 ? GPIOValue.HIGH : GPIOValue.LOW);
        } else {
          reject(new Error(`gpioget exited with code ${code} for pin ${this.pin}`));
        }
      });
    });
  }
  
  async watchEdge(edge: GPIOEdge, callback: (value: GPIOValue) => void): Promise<void> {
    if (this.mode !== GPIOMode.INPUT) {
      throw new Error(`Cannot watch edge on pin ${this.pin} in ${this.mode} mode`);
    }
    
    if (this.watchProcess) {
      await this.unwatchEdge();
    }
    
    this.edgeCallback = callback;
    
    // Use gpiomon to monitor edge events
    // Format: gpiomon --edges=<edge> <chip> <offset>
    const edgeArg = edge === GPIOEdge.BOTH ? 'both' : 
                    edge === GPIOEdge.RISING ? 'rising' : 'falling';
    
    this.watchProcess = spawn('gpiomon', [
      `--edges=${edgeArg}`,
      'gpiochip4',
      `${this.pin}`
    ]);
    
    this.watchProcess.stdout?.on('data', (data) => {
      const lines = data.toString().split('\n');
      for (const line of lines) {
        if (line.trim()) {
          // Parse gpiomon output: "event: RISING EDGE offset: 17 timestamp: [...]"
          if (line.includes('RISING')) {
            this.edgeCallback?.(GPIOValue.HIGH);
          } else if (line.includes('FALLING')) {
            this.edgeCallback?.(GPIOValue.LOW);
          }
        }
      }
    });
    
    this.watchProcess.on('error', (err) => {
      console.error(`[GPIO] Watch error on pin ${this.pin}:`, err);
    });
  }
  
  async unwatchEdge(): Promise<void> {
    if (this.watchProcess) {
      this.watchProcess.kill();
      this.watchProcess = null;
    }
    this.edgeCallback = null;
  }
  
  async close(): Promise<void> {
    await this.unwatchEdge();
    this.removeAllListeners();
  }
}

/**
 * Sysfs GPIO fallback (legacy, but widely compatible)
 * 
 * Uses /sys/class/gpio interface. Works on all Pi models.
 */
class SysfsGPIOPin extends EventEmitter implements GPIOPin {
  readonly pin: number;
  private mode: GPIOMode;
  private pull: GPIOPull;
  private exported: boolean = false;
  private watchInterval: NodeJS.Timeout | null = null;
  private lastValue: GPIOValue = GPIOValue.LOW;
  
  constructor(pin: number, mode: GPIOMode, pull: GPIOPull = GPIOPull.NONE) {
    super();
    this.pin = pin;
    this.mode = mode;
    this.pull = pull;
  }
  
  private async exportPin(): Promise<void> {
    if (this.exported) return;
    
    try {
      // Check if already exported
      await access(`/sys/class/gpio/gpio${this.pin}`, constants.F_OK);
      this.exported = true;
    } catch {
      // Export the pin
      await writeFile('/sys/class/gpio/export', `${this.pin}`);
      // Wait for sysfs to create the pin directory
      await new Promise(resolve => setTimeout(resolve, 100));
      this.exported = true;
    }
    
    // Set direction
    await writeFile(`/sys/class/gpio/gpio${this.pin}/direction`, this.mode);
    
    // Set edge detection (for input pins)
    if (this.mode === GPIOMode.INPUT) {
      await writeFile(`/sys/class/gpio/gpio${this.pin}/edge`, 'none');
    }
  }
  
  async write(value: GPIOValue): Promise<void> {
    if (this.mode !== GPIOMode.OUTPUT) {
      throw new Error(`Cannot write to pin ${this.pin} in ${this.mode} mode`);
    }
    
    await this.exportPin();
    await writeFile(`/sys/class/gpio/gpio${this.pin}/value`, `${value}`);
  }
  
  async read(): Promise<GPIOValue> {
    await this.exportPin();
    const data = await readFile(`/sys/class/gpio/gpio${this.pin}/value`, 'utf-8');
    return parseInt(data.trim(), 10) === 1 ? GPIOValue.HIGH : GPIOValue.LOW;
  }
  
  async watchEdge(edge: GPIOEdge, callback: (value: GPIOValue) => void): Promise<void> {
    if (this.mode !== GPIOMode.INPUT) {
      throw new Error(`Cannot watch edge on pin ${this.pin} in ${this.mode} mode`);
    }
    
    await this.exportPin();
    
    // Set edge detection in sysfs
    await writeFile(`/sys/class/gpio/gpio${this.pin}/edge`, edge);
    
    // Poll for changes (not ideal, but works everywhere)
    // TODO: Use epoll or inotify for better performance
    this.watchInterval = setInterval(async () => {
      try {
        const value = await this.read();
        if (value !== this.lastValue) {
          this.lastValue = value;
          callback(value);
        }
      } catch (err) {
        console.error(`[GPIO] Read error on pin ${this.pin}:`, err);
      }
    }, 10); // Poll every 10ms
  }
  
  async unwatchEdge(): Promise<void> {
    if (this.watchInterval) {
      clearInterval(this.watchInterval);
      this.watchInterval = null;
    }
    
    if (this.exported) {
      try {
        await writeFile(`/sys/class/gpio/gpio${this.pin}/edge`, 'none');
      } catch {
        // Ignore errors during cleanup
      }
    }
  }
  
  async close(): Promise<void> {
    await this.unwatchEdge();
    
    if (this.exported) {
      try {
        await writeFile('/sys/class/gpio/unexport', `${this.pin}`);
      } catch {
        // Ignore errors during cleanup
      }
      this.exported = false;
    }
    
    this.removeAllListeners();
  }
}

/**
 * GPIO Factory
 * 
 * Creates GPIO pin instances with automatic detection of available backend.
 */
export class GPIO {
  private static backend: 'gpiod' | 'sysfs' | null = null;
  
  /**
   * Detect available GPIO backend
   */
  private static async detectBackend(): Promise<'gpiod' | 'sysfs'> {
    if (this.backend) return this.backend;
    
    // Check for gpiod tools
    try {
      await new Promise<void>((resolve, reject) => {
        const proc = spawn('gpioget', ['--version']);
        proc.on('close', (code) => {
          if (code === 0) resolve();
          else reject();
        });
        proc.on('error', reject);
      });
      
      this.backend = 'gpiod';
      console.log('[GPIO] Using gpiod backend');
      return 'gpiod';
    } catch {
      // Fall back to sysfs
      this.backend = 'sysfs';
      console.log('[GPIO] Falling back to sysfs backend');
      return 'sysfs';
    }
  }
  
  /**
   * Open a GPIO pin
   */
  static async open(pin: number, mode: GPIOMode, pull: GPIOPull = GPIOPull.NONE): Promise<GPIOPin> {
    const backend = await this.detectBackend();
    
    if (backend === 'gpiod') {
      return new GPIOdPin(pin, mode, pull);
    } else {
      return new SysfsGPIOPin(pin, mode, pull);
    }
  }
  
  /**
   * Open an input pin with pull-up resistor (common for buttons)
   */
  static async openInput(pin: number, pull: GPIOPull = GPIOPull.UP): Promise<GPIOPin> {
    return this.open(pin, GPIOMode.INPUT, pull);
  }
  
  /**
   * Open an output pin
   */
  static async openOutput(pin: number): Promise<GPIOPin> {
    return this.open(pin, GPIOMode.OUTPUT);
  }
}

/**
 * Debounce helper for button inputs
 * 
 * Prevents multiple triggers from a single button press due to contact bounce.
 */
export class DebouncedButton {
  private pin: GPIOPin;
  private debounceMs: number;
  private lastTrigger: number = 0;
  private currentState: GPIOValue = GPIOValue.HIGH; // Assuming pull-up
  
  constructor(pin: GPIOPin, debounceMs: number = 50) {
    this.pin = pin;
    this.debounceMs = debounceMs;
  }
  
  /**
   * Watch for button press events (falling edge with pull-up)
   */
  async watchPress(callback: () => void): Promise<void> {
    await this.pin.watchEdge(GPIOEdge.FALLING, async (value) => {
      const now = Date.now();
      
      // Debounce check
      if (now - this.lastTrigger < this.debounceMs) {
        return;
      }
      
      this.lastTrigger = now;
      this.currentState = value;
      
      callback();
    });
  }
  
  /**
   * Watch for button release events (rising edge with pull-up)
   */
  async watchRelease(callback: () => void): Promise<void> {
    await this.pin.watchEdge(GPIOEdge.RISING, async (value) => {
      const now = Date.now();
      
      if (now - this.lastTrigger < this.debounceMs) {
        return;
      }
      
      this.lastTrigger = now;
      this.currentState = value;
      
      callback();
    });
  }
  
  /**
   * Watch for both press and release
   */
  async watchBoth(
    onPress: () => void,
    onRelease: () => void
  ): Promise<void> {
    await this.pin.watchEdge(GPIOEdge.BOTH, async (value) => {
      const now = Date.now();
      
      if (now - this.lastTrigger < this.debounceMs) {
        return;
      }
      
      this.lastTrigger = now;
      this.currentState = value;
      
      if (value === GPIOValue.LOW) {
        onPress();
      } else {
        onRelease();
      }
    });
  }
  
  async close(): Promise<void> {
    await this.pin.close();
  }
}

/**
 * Rotary encoder handler
 * 
 * Decodes quadrature signals from a rotary encoder (two-phase).
 */
export class RotaryEncoder extends EventEmitter {
  private pinA: GPIOPin;
  private pinB: GPIOPin;
  private lastA: GPIOValue = GPIOValue.HIGH;
  private lastB: GPIOValue = GPIOValue.HIGH;
  private position: number = 0;
  
  constructor(pinA: GPIOPin, pinB: GPIOPin) {
    super();
    this.pinA = pinA;
    this.pinB = pinB;
  }
  
  /**
   * Start listening for rotation events
   */
  async start(): Promise<void> {
    // Watch both pins for edges
    await this.pinA.watchEdge(GPIOEdge.BOTH, async (valueA) => {
      const valueB = await this.pinB.read();
      this.handleTransition(valueA, valueB);
    });
    
    await this.pinB.watchEdge(GPIOEdge.BOTH, async (valueB) => {
      const valueA = await this.pinA.read();
      this.handleTransition(valueA, valueB);
    });
  }
  
  /**
   * Handle state transition and decode rotation direction
   */
  private handleTransition(a: GPIOValue, b: GPIOValue): void {
    // Quadrature decoding logic
    // Based on Gray code state machine
    const aChanged = a !== this.lastA;
    const bChanged = b !== this.lastB;
    
    if (!aChanged && !bChanged) return;
    
    // Determine direction
    // CW: A leads B (A changes before B in the same direction)
    // CCW: B leads A
    if (aChanged) {
      if (a === GPIOValue.LOW && b === GPIOValue.HIGH) {
        this.position++;
        this.emit('clockwise', this.position);
      } else if (a === GPIOValue.HIGH && b === GPIOValue.LOW) {
        this.position--;
        this.emit('counterclockwise', this.position);
      }
    }
    
    this.lastA = a;
    this.lastB = b;
  }
  
  /**
   * Get current position (relative)
   */
  getPosition(): number {
    return this.position;
  }
  
  /**
   * Reset position counter
   */
  resetPosition(): void {
    this.position = 0;
  }
  
  async close(): Promise<void> {
    await this.pinA.close();
    await this.pinB.close();
    this.removeAllListeners();
  }
}
