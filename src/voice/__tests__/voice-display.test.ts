/**
 * Voice Display Tests
 * 
 * Tests for the VoiceDisplay UI manager.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { VoiceDisplay, ScreenState } from '../ui/voice-display';
import { MockVoiceHardware } from '../hardware/mock-hardware';
import { loadVoiceConfig } from '../voice-config';

describe('VoiceDisplay', () => {
  let display: VoiceDisplay;
  let mockHardware: MockVoiceHardware;
  
  beforeEach(async () => {
    mockHardware = new MockVoiceHardware();
    const config = loadVoiceConfig();
    await mockHardware.init(config);
    
    display = new VoiceDisplay(mockHardware.display, config);
    await display.init();
  });
  
  afterEach(async () => {
    await display.close();
    await mockHardware.close();
  });
  
  describe('Initialization', () => {
    it('should initialize and show home screen', async () => {
      const state = display.getState();
      expect(state).toBe(ScreenState.HOME);
    });
    
    it('should have correct display dimensions', async () => {
      const dims = mockHardware.display.getDimensions();
      expect(dims.width).toBe(128);
      expect(dims.height).toBe(64);
    });
  });
  
  describe('Screen States', () => {
    it('should transition to RECORDING state', async () => {
      await display.showRecording();
      expect(display.getState()).toBe(ScreenState.RECORDING);
    });
    
    it('should transition to PROCESSING state', async () => {
      await display.showProcessing('Transcribing...');
      expect(display.getState()).toBe(ScreenState.PROCESSING);
    });
    
    it('should transition to PLAYING state', async () => {
      await display.showResponse('Test response from agent');
      expect(display.getState()).toBe(ScreenState.PLAYING);
    });
    
    it('should transition to ERROR state', async () => {
      await display.showError('Test error message');
      expect(display.getState()).toBe(ScreenState.ERROR);
    });
    
    it('should transition to STATUS state', async () => {
      await display.showStatus({
        hardware: 'OK',
        network: 'Connected',
        session: 'Active',
      });
      expect(display.getState()).toBe(ScreenState.STATUS);
    });
    
    it('should return to HOME state', async () => {
      await display.showRecording();
      await display.showHome();
      expect(display.getState()).toBe(ScreenState.HOME);
    });
  });
  
  describe('Display Updates', () => {
    it('should update with display data', async () => {
      await display.update({
        state: ScreenState.RECORDING,
        primary: 'Recording...',
        icon: 'microphone',
      });
      
      expect(display.getState()).toBe(ScreenState.RECORDING);
    });
    
    it('should handle progress updates', async () => {
      await display.update({
        state: ScreenState.PROCESSING,
        primary: 'Processing...',
        progress: 50,
      });
      
      expect(display.getState()).toBe(ScreenState.PROCESSING);
    });
    
    it('should handle long text with wrapping', async () => {
      const longText = 'This is a very long response from the agent that will need to be wrapped across multiple lines on the OLED display screen.';
      
      await display.showResponse(longText);
      expect(display.getState()).toBe(ScreenState.PLAYING);
    });
  });
  
  describe('Idle Time Tracking', () => {
    it('should track time since last update', async () => {
      await display.showHome();
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const idleTime = display.getIdleTime();
      expect(idleTime).toBeGreaterThanOrEqual(100);
    });
    
    it('should reset idle time on update', async () => {
      await display.showHome();
      await new Promise(resolve => setTimeout(resolve, 100));
      
      await display.showRecording();
      
      const idleTime = display.getIdleTime();
      expect(idleTime).toBeLessThan(50);
    });
  });
  
  describe('Error Handling', () => {
    it('should handle display errors gracefully', async () => {
      // Even if underlying display fails, should not throw
      await expect(display.showError('Test error')).resolves.not.toThrow();
    });
    
    it('should handle close when already closed', async () => {
      await display.close();
      await expect(display.close()).resolves.not.toThrow();
    });
  });
  
  describe('Recording Display', () => {
    it('should show recording with duration', async () => {
      await display.showRecording(1500);
      expect(display.getState()).toBe(ScreenState.RECORDING);
    });
    
    it('should show recording without duration', async () => {
      await display.showRecording();
      expect(display.getState()).toBe(ScreenState.RECORDING);
    });
  });
  
  describe('Response Display', () => {
    it('should display short response text', async () => {
      await display.showResponse('OK');
      expect(display.getState()).toBe(ScreenState.PLAYING);
    });
    
    it('should display medium response text', async () => {
      await display.showResponse('This is a medium length response that fits nicely.');
      expect(display.getState()).toBe(ScreenState.PLAYING);
    });
    
    it('should handle very long response text', async () => {
      const veryLongText = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(10);
      await display.showResponse(veryLongText);
      expect(display.getState()).toBe(ScreenState.PLAYING);
    });
  });
});
