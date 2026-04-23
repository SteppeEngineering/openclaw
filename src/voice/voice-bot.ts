/**
 * Voice Bot - Main Voice Channel
 * 
 * Orchestrates the voice interface lifecycle:
 * - Hardware initialization
 * - Event loop management
 * - Graceful shutdown
 * 
 * This is the entry point for the ShopClaw voice channel.
 */

import type { VoiceConfig } from './voice-config';
import { loadVoiceConfig } from './voice-config';
import type { VoiceHardware, HardwareStatus } from './hardware/types';
import { registerHardwareHandlers, unregisterHardwareHandlers } from './voice-handlers';

export enum VoiceBotState {
  STOPPED = 'stopped',
  STARTING = 'starting',
  RUNNING = 'running',
  STOPPING = 'stopping',
  ERROR = 'error',
}

export interface VoiceBotOptions {
  /** Voice configuration (uses defaults if not provided) */
  config?: Partial<VoiceConfig>;
  
  /** Hardware factory (for dependency injection) */
  hardwareFactory?: (config: VoiceConfig) => Promise<VoiceHardware>;
  
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Main voice channel bot
 */
export class VoiceBot {
  private config: VoiceConfig;
  private hardware?: VoiceHardware;
  private state: VoiceBotState = VoiceBotState.STOPPED;
  private debug: boolean;
  private shutdownHandlers: Array<() => Promise<void>> = [];
  private ttsRequestCount: number = 0;
  
  constructor(options: VoiceBotOptions = {}) {
    this.config = loadVoiceConfig(options.config);
    this.debug = options.debug ?? false;
    
    // Store hardware factory if provided (for testing with mock hardware)
    if (options.hardwareFactory) {
      this._hardwareFactory = options.hardwareFactory;
    }
  }
  
  /**
   * Start the voice bot
   */
  async start(): Promise<void> {
    if (this.state !== VoiceBotState.STOPPED) {
      throw new Error(`Cannot start voice bot: already ${this.state}`);
    }
    
    this.log('Starting voice bot...');
    this.state = VoiceBotState.STARTING;
    
    try {
      // Initialize hardware
      await this._initializeHardware();
      
      // Register event handlers
      await this._registerEventHandlers();
      
      // Setup graceful shutdown
      this._setupShutdownHandlers();
      
      this.state = VoiceBotState.RUNNING;
      this.log('Voice bot started successfully');
      
      // Show welcome screen
      await this._showWelcomeScreen();
      
    } catch (error) {
      this.state = VoiceBotState.ERROR;
      this.error('Failed to start voice bot:', error);
      
      // Clean up partial initialization
      await this.stop();
      throw error;
    }
  }
  
  /**
   * Stop the voice bot
   */
  async stop(): Promise<void> {
    if (this.state === VoiceBotState.STOPPED || this.state === VoiceBotState.STOPPING) {
      return;
    }
    
    this.log('Stopping voice bot...');
    this.state = VoiceBotState.STOPPING;
    
    try {
      // Unregister event handlers
      if (this.hardware) {
        unregisterHardwareHandlers(this.hardware);
      }
      
      // Run custom shutdown handlers
      for (const handler of this.shutdownHandlers) {
        try {
          await handler();
        } catch (err) {
          this.error('Shutdown handler failed:', err);
        }
      }
      
      // Close hardware
      if (this.hardware) {
        await this.hardware.close();
        this.hardware = undefined;
      }
      
      this.state = VoiceBotState.STOPPED;
      this.log('Voice bot stopped');
      
    } catch (error) {
      this.error('Error during shutdown:', error);
      this.state = VoiceBotState.ERROR;
      throw error;
    }
  }
  
  /**
   * Get current bot state
   */
  getState(): VoiceBotState {
    return this.state;
  }
  
  /**
   * Get hardware status
   */
  async getHardwareStatus(): Promise<HardwareStatus | null> {
    if (!this.hardware) {
      return null;
    }
    
    // TODO: Implement proper hardware status query
    return {
      type: this.hardware.type,
      initialized: this.state === VoiceBotState.RUNNING,
      components: {
        audio: {
          available: true,
          inputDevice: this.config.hardware.audio.inputDevice,
          outputDevice: this.config.hardware.audio.outputDevice,
        },
        display: {
          available: true,
          width: this.config.hardware.display.width,
          height: this.config.hardware.display.height,
        },
        input: {
          available: true,
          pttButton: true,
          encoder: true,
        },
      },
    };
  }
  
  /**
   * Get configuration
   */
  getConfig(): VoiceConfig {
    return { ...this.config };
  }
  
  /**
   * Register a custom shutdown handler
   */
  onShutdown(handler: () => Promise<void>): void {
    this.shutdownHandlers.push(handler);
  }
  
  /**
   * Get TTS request count (for memory reset tracking)
   */
  getTTSRequestCount(): number {
    return this.ttsRequestCount;
  }
  
  /**
   * Increment TTS request count
   */
  incrementTTSRequestCount(): void {
    this.ttsRequestCount++;
  }
  
  /**
   * Reset TTS request count
   */
  resetTTSRequestCount(): void {
    this.ttsRequestCount = 0;
  }
  
  // Private methods
  
  private _hardwareFactory?: (config: VoiceConfig) => Promise<VoiceHardware>;
  
  private async _initializeHardware(): Promise<void> {
    this.log('Initializing hardware...');
    
    // Use provided factory or default to mock for now
    // TODO: Replace with real hardware factory when implemented
    if (!this._hardwareFactory) {
      throw new Error('Hardware factory not provided. Use VoiceBotOptions.hardwareFactory or implement default factory.');
    }
    
    this.hardware = await this._hardwareFactory(this.config);
    await this.hardware.init(this.config);
    
    this.log(`Hardware initialized (type: ${this.hardware.type})`);
  }
  
  private async _registerEventHandlers(): Promise<void> {
    if (!this.hardware) {
      throw new Error('Hardware not initialized');
    }
    
    this.log('Registering event handlers...');
    registerHardwareHandlers(this.hardware, this);
  }
  
  private _setupShutdownHandlers(): void {
    const shutdown = async () => {
      await this.stop();
      process.exit(0);
    };
    
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    
    this.log('Shutdown handlers registered');
  }
  
  private async _showWelcomeScreen(): Promise<void> {
    if (!this.hardware) return;
    
    try {
      await this.hardware.display.clear();
      await this.hardware.display.writeText('ShopClaw', 0, 0, 2);
      await this.hardware.display.writeText('Voice Ready', 0, 24, 1);
      await this.hardware.display.writeText('Press PTT', 0, 40, 1);
      await this.hardware.display.update();
    } catch (err) {
      this.error('Failed to show welcome screen:', err);
    }
  }
  
  private log(...args: any[]): void {
    if (this.debug) {
      console.log('[VoiceBot]', ...args);
    }
  }
  
  private error(...args: any[]): void {
    console.error('[VoiceBot ERROR]', ...args);
  }
}

/**
 * Create and start a voice bot instance
 * Convenience function for simple use cases
 */
export async function startVoiceBot(options?: VoiceBotOptions): Promise<VoiceBot> {
  const bot = new VoiceBot(options);
  await bot.start();
  return bot;
}
