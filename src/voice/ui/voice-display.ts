/**
 * Voice Display Manager
 * 
 * OLED UI state machine and rendering logic for the ShopClaw voice interface.
 * Manages screen states, text wrapping, scrolling, and visual feedback.
 */

import type { DisplayDevice } from '../hardware/types';
import type { VoiceConfig } from '../voice-config';
import { renderLayout, SCREEN_LAYOUTS } from './screens';

/**
 * Screen states for the voice interface
 */
export enum ScreenState {
  /** Home/idle screen - shows status and prompt */
  HOME = 'home',
  
  /** Voice recording in progress */
  RECORDING = 'recording',
  
  /** Processing voice input (transcribing) */
  PROCESSING = 'processing',
  
  /** Playing agent response */
  PLAYING = 'playing',
  
  /** Menu navigation */
  MENU = 'menu',
  
  /** System status display */
  STATUS = 'status',
  
  /** Error display */
  ERROR = 'error',
}

/**
 * Display update data for each state
 */
export interface DisplayData {
  state: ScreenState;
  primary?: string;      // Main text content
  secondary?: string;    // Secondary/status text
  icon?: string;         // Icon identifier
  progress?: number;     // Progress bar (0-100)
  timestamp?: number;    // When to auto-clear/transition
}

/**
 * Text layout configuration
 */
interface TextLayout {
  lines: string[];
  totalHeight: number;
  scrollNeeded: boolean;
}

/**
 * Voice Display Manager
 * 
 * Manages the OLED display for the voice interface.
 * Handles state transitions, text rendering, and visual feedback.
 */
export class VoiceDisplay {
  private device: DisplayDevice;
  private config: VoiceConfig;
  private currentState: ScreenState = ScreenState.HOME;
  private scrollOffset: number = 0;
  private lastUpdate: number = 0;
  private autoScrollTimer?: NodeJS.Timeout;
  private animationFrame: number = 0;
  private animationTimer?: NodeJS.Timeout;
  
  // Display dimensions
  private width: number = 128;
  private height: number = 64;
  
  // Font metrics (approximate for monospace)
  private readonly CHAR_WIDTH = 6;
  private readonly LINE_HEIGHT = 10;
  private readonly PADDING = 2;
  
  constructor(device: DisplayDevice, config: VoiceConfig) {
    this.device = device;
    this.config = config;
    
    const dims = device.getDimensions();
    this.width = dims.width;
    this.height = dims.height;
  }
  
  /**
   * Initialize display and show home screen
   */
  async init(): Promise<void> {
    await this.device.init();
    await this.showHome();
  }
  
  /**
   * Update display with new data
   */
  async update(data: DisplayData): Promise<void> {
    this.currentState = data.state;
    this.lastUpdate = Date.now();
    
    await this.device.clear();
    
    switch (data.state) {
      case ScreenState.HOME:
        await this.renderHome(data);
        break;
        
      case ScreenState.RECORDING:
        await this.renderRecording(data);
        break;
        
      case ScreenState.PROCESSING:
        await this.renderProcessing(data);
        break;
        
      case ScreenState.PLAYING:
        await this.renderPlaying(data);
        break;
        
      case ScreenState.MENU:
        await this.renderMenu(data);
        break;
        
      case ScreenState.STATUS:
        await this.renderStatus(data);
        break;
        
      case ScreenState.ERROR:
        await this.renderError(data);
        break;
    }
    
    await this.device.update();
  }
  
  /**
   * Show home/idle screen
   */
  async showHome(): Promise<void> {
    this.stopAnimation();
    const layout = SCREEN_LAYOUTS.home();
    await renderLayout(this.device, layout);
    this.currentState = ScreenState.HOME;
    this.lastUpdate = Date.now();
  }
  
  /**
   * Show recording indicator
   */
  async showRecording(duration?: number): Promise<void> {
    const durationText = duration ? `${(duration / 1000).toFixed(1)}s` : undefined;
    const layout = SCREEN_LAYOUTS.recording(durationText);
    
    this.startAnimation(500); // Pulse animation every 500ms
    await renderLayout(this.device, layout, this.animationFrame);
    
    this.currentState = ScreenState.RECORDING;
    this.lastUpdate = Date.now();
  }
  
  /**
   * Show processing/transcribing state
   */
  async showProcessing(message?: string): Promise<void> {
    const layout = SCREEN_LAYOUTS.processing(message);
    
    this.startAnimation(200); // Spinner every 200ms
    await renderLayout(this.device, layout, this.animationFrame);
    
    this.currentState = ScreenState.PROCESSING;
    this.lastUpdate = Date.now();
  }
  
  /**
   * Show agent response text
   */
  async showResponse(text: string): Promise<void> {
    this.stopAnimation();
    const layout = SCREEN_LAYOUTS.playing(text);
    await renderLayout(this.device, layout);
    
    this.currentState = ScreenState.PLAYING;
    this.lastUpdate = Date.now();
  }
  
  /**
   * Show error message
   */
  async showError(error: string): Promise<void> {
    this.stopAnimation();
    const layout = SCREEN_LAYOUTS.error(error);
    await renderLayout(this.device, layout);
    
    this.currentState = ScreenState.ERROR;
    this.lastUpdate = Date.now();
  }
  
  /**
   * Show system status
   */
  async showStatus(status: Record<string, any>): Promise<void> {
    this.stopAnimation();
    const lines = Object.entries(status)
      .map(([key, value]) => `${key}: ${value}`);
    
    const layout = SCREEN_LAYOUTS.status(lines);
    await renderLayout(this.device, layout);
    
    this.currentState = ScreenState.STATUS;
    this.lastUpdate = Date.now();
  }
  
  /**
   * Render home screen
   */
  private async renderHome(data: DisplayData): Promise<void> {
    // Title at top
    await this.device.writeText(data.primary || 'ShopClaw', this.PADDING, this.PADDING, 2);
    
    // Instruction at bottom
    const y = this.height - this.LINE_HEIGHT - this.PADDING;
    await this.device.writeText(data.secondary || 'Hold PTT', this.PADDING, y, 1);
  }
  
  /**
   * Render recording screen
   */
  private async renderRecording(data: DisplayData): Promise<void> {
    // Recording indicator
    const centerY = this.height / 2 - this.LINE_HEIGHT;
    await this.device.writeText('● REC', this.width / 2 - 20, centerY, 2);
    
    // Duration if provided
    if (data.secondary) {
      const y = centerY + this.LINE_HEIGHT * 2;
      await this.device.writeText(data.secondary, this.PADDING, y, 1);
    }
    
    // Draw waveform simulation (animated)
    if (data.progress) {
      await this.drawWaveform(data.progress);
    }
  }
  
  /**
   * Render processing screen
   */
  private async renderProcessing(data: DisplayData): Promise<void> {
    const centerY = this.height / 2 - this.LINE_HEIGHT;
    await this.device.writeText(data.primary || 'Processing', this.PADDING, centerY, 1);
    
    // Progress bar
    if (data.progress !== undefined) {
      await this.drawProgressBar(data.progress);
    } else {
      // Spinner
      await this.drawSpinner();
    }
  }
  
  /**
   * Render playing/response screen
   */
  private async renderPlaying(data: DisplayData): Promise<void> {
    // Speaker icon at top
    await this.device.writeText('♪', this.PADDING, this.PADDING, 2);
    
    // Response text with wrapping
    if (data.primary) {
      const textY = this.LINE_HEIGHT * 2;
      const textHeight = this.height - textY - this.PADDING;
      const layout = this.layoutText(data.primary, this.width - 2 * this.PADDING, textHeight);
      
      // Render visible lines with scroll offset
      const visibleLines = Math.floor(textHeight / this.LINE_HEIGHT);
      const startLine = Math.floor(this.scrollOffset / this.LINE_HEIGHT);
      const endLine = Math.min(startLine + visibleLines, layout.lines.length);
      
      for (let i = startLine; i < endLine; i++) {
        const y = textY + (i - startLine) * this.LINE_HEIGHT;
        await this.device.writeText(layout.lines[i], this.PADDING, y, 1);
      }
      
      // Scroll indicator
      if (layout.scrollNeeded) {
        const scrollY = this.height - this.PADDING - 2;
        await this.device.writeText('▼', this.width - 10, scrollY, 1);
      }
    }
  }
  
  /**
   * Render menu screen
   */
  private async renderMenu(data: DisplayData): Promise<void> {
    await this.device.writeText('Menu', this.PADDING, this.PADDING, 2);
    
    // Menu items (TODO: implement menu system)
    const items = ['Status', 'Settings', 'Exit'];
    for (let i = 0; i < items.length; i++) {
      const y = this.LINE_HEIGHT * 2 + i * this.LINE_HEIGHT;
      await this.device.writeText(items[i], this.PADDING + 10, y, 1);
    }
  }
  
  /**
   * Render status screen
   */
  private async renderStatus(data: DisplayData): Promise<void> {
    await this.device.writeText(data.primary || 'Status', this.PADDING, this.PADDING, 1);
    
    if (data.secondary) {
      const lines = data.secondary.split('\n');
      for (let i = 0; i < Math.min(lines.length, 5); i++) {
        const y = this.LINE_HEIGHT * 2 + i * this.LINE_HEIGHT;
        await this.device.writeText(lines[i], this.PADDING, y, 1);
      }
    }
  }
  
  /**
   * Render error screen
   */
  private async renderError(data: DisplayData): Promise<void> {
    // Error icon/title
    await this.device.writeText('⚠ ERROR', this.PADDING, this.PADDING, 2);
    
    // Error message
    if (data.secondary) {
      const layout = this.layoutText(data.secondary, this.width - 2 * this.PADDING, this.height - 30);
      for (let i = 0; i < Math.min(layout.lines.length, 3); i++) {
        const y = this.LINE_HEIGHT * 3 + i * this.LINE_HEIGHT;
        await this.device.writeText(layout.lines[i], this.PADDING, y, 1);
      }
    }
  }
  
  /**
   * Layout text with word wrapping
   */
  private layoutText(text: string, maxWidth: number, maxHeight: number): TextLayout {
    const maxChars = Math.floor(maxWidth / this.CHAR_WIDTH);
    const maxLines = Math.floor(maxHeight / this.LINE_HEIGHT);
    
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';
    
    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      
      if (testLine.length <= maxChars) {
        currentLine = testLine;
      } else {
        if (currentLine) {
          lines.push(currentLine);
        }
        currentLine = word;
      }
    }
    
    if (currentLine) {
      lines.push(currentLine);
    }
    
    const totalHeight = lines.length * this.LINE_HEIGHT;
    const scrollNeeded = lines.length > maxLines;
    
    return { lines, totalHeight, scrollNeeded };
  }
  
  /**
   * Draw progress bar
   */
  private async drawProgressBar(progress: number): Promise<void> {
    const barWidth = this.width - 2 * this.PADDING;
    const barHeight = 8;
    const barY = this.height - barHeight - this.PADDING;
    
    const fillWidth = Math.floor((barWidth * progress) / 100);
    
    // Draw bar outline (simplified - actual implementation would use drawBitmap)
    // For now, just show text representation
    const percent = `${progress}%`;
    await this.device.writeText(percent, this.width / 2 - 15, barY, 1);
  }
  
  /**
   * Draw animated spinner
   */
  private async drawSpinner(): Promise<void> {
    const frames = ['|', '/', '-', '\\'];
    const frame = frames[Math.floor(Date.now() / 200) % frames.length];
    const x = this.width / 2 - 5;
    const y = this.height - this.LINE_HEIGHT * 2;
    await this.device.writeText(frame, x, y, 2);
  }
  
  /**
   * Draw waveform visualization
   */
  private async drawWaveform(amplitude: number): Promise<void> {
    // Simplified waveform (actual implementation would draw graphics)
    const bars = '█'.repeat(Math.floor(amplitude / 10));
    const y = this.height - this.LINE_HEIGHT - this.PADDING;
    await this.device.writeText(bars, this.PADDING, y, 1);
  }
  
  /**
   * Start animation timer
   */
  private startAnimation(intervalMs: number): void {
    this.stopAnimation();
    
    this.animationTimer = setInterval(async () => {
      this.animationFrame++;
      
      // Re-render with new animation frame
      switch (this.currentState) {
        case ScreenState.RECORDING: {
          const layout = SCREEN_LAYOUTS.recording();
          await renderLayout(this.device, layout, this.animationFrame);
          break;
        }
        case ScreenState.PROCESSING: {
          const layout = SCREEN_LAYOUTS.processing();
          await renderLayout(this.device, layout, this.animationFrame);
          break;
        }
      }
    }, intervalMs);
  }
  
  /**
   * Stop animation timer
   */
  private stopAnimation(): void {
    if (this.animationTimer) {
      clearInterval(this.animationTimer);
      this.animationTimer = undefined;
    }
    this.animationFrame = 0;
  }
  
  /**
   * Start auto-scrolling text
   */
  private startAutoScroll(): void {
    this.stopAutoScroll();
    
    this.autoScrollTimer = setInterval(() => {
      this.scrollOffset += this.LINE_HEIGHT;
      // TODO: Re-render with new offset
    }, 3000); // Scroll every 3 seconds
  }
  
  /**
   * Stop auto-scrolling
   */
  private stopAutoScroll(): void {
    if (this.autoScrollTimer) {
      clearInterval(this.autoScrollTimer);
      this.autoScrollTimer = undefined;
    }
    this.scrollOffset = 0;
  }
  
  /**
   * Get current screen state
   */
  getState(): ScreenState {
    return this.currentState;
  }
  
  /**
   * Get time since last update (ms)
   */
  getIdleTime(): number {
    return Date.now() - this.lastUpdate;
  }
  
  /**
   * Clean up resources
   */
  async close(): Promise<void> {
    this.stopAnimation();
    this.stopAutoScroll();
    await this.device.clear();
    await this.device.update();
    await this.device.setPower(false);
    await this.device.close();
  }
}
