/**
 * Voice Bot Integration Tests
 * 
 * Tests for VoiceBot initialization, lifecycle, and integration with mock hardware.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { VoiceBot } from '../voice-bot';
import { MockVoiceHardware } from '../hardware/mock-hardware';
import { loadVoiceConfig } from '../voice-config';
import { HardwareEvent } from '../hardware/types';

describe('VoiceBot', () => {
  let bot: VoiceBot;
  let mockHardware: MockVoiceHardware;
  
  beforeEach(async () => {
    // Create mock hardware
    mockHardware = new MockVoiceHardware();
    
    // Create config with mock hardware
    const config = loadVoiceConfig({
      services: {
        deepgram: {
          endpoint: 'https://api.deepgram.com/v1/listen',
          apiKey: 'test-key',
          model: 'nova-3',
          smartFormat: true,
        },
        chatterbox: {
          baseUrl: 'http://localhost:4123',
          voiceSamplePath: '/tmp/test-voice.wav',
          exaggeration: 0.9,
          cfgWeight: 0.3,
          temperature: 0.9,
        },
      },
    });
    
    bot = new VoiceBot(config, mockHardware);
  });
  
  afterEach(async () => {
    if (bot) {
      await bot.stop();
    }
  });
  
  describe('Initialization', () => {
    it('should initialize successfully with mock hardware', async () => {
      await bot.start();
      
      // Check that hardware is initialized
      expect(mockHardware.isInitialized()).toBe(true);
    });
    
    it('should set up hardware event handlers', async () => {
      await bot.start();
      
      // Verify event listeners are registered
      const mockInput = mockHardware.getMockInput();
      const listenerCount = mockInput.listenerCount(HardwareEvent.PTT_PRESS);
      
      expect(listenerCount).toBeGreaterThan(0);
    });
    
    it('should initialize display with home screen', async () => {
      await bot.start();
      
      // Display should be powered on and showing home state
      // (This would require exposing display state in VoiceBot)
    });
  });
  
  describe('Lifecycle', () => {
    it('should start and stop cleanly', async () => {
      await bot.start();
      await bot.stop();
      
      // Hardware should be closed
      expect(mockHardware.isInitialized()).toBe(false);
    });
    
    it('should handle multiple start/stop cycles', async () => {
      await bot.start();
      await bot.stop();
      
      await bot.start();
      await bot.stop();
      
      expect(mockHardware.isInitialized()).toBe(false);
    });
    
    it('should not fail when stopping before starting', async () => {
      await expect(bot.stop()).resolves.not.toThrow();
    });
  });
  
  describe('Hardware Events', () => {
    it('should respond to PTT press event', async () => {
      await bot.start();
      
      const mockInput = mockHardware.getMockInput();
      
      // Simulate PTT press
      mockInput.simulateEvent(HardwareEvent.PTT_PRESS);
      
      // Should start recording (check audio state)
      // Note: This requires exposing internal state or using spies
    });
    
    it('should respond to PTT release event', async () => {
      await bot.start();
      
      const mockInput = mockHardware.getMockInput();
      
      // Simulate press and release
      mockInput.simulateEvent(HardwareEvent.PTT_PRESS);
      await new Promise(resolve => setTimeout(resolve, 100));
      mockInput.simulateEvent(HardwareEvent.PTT_RELEASE);
      
      // Should stop recording and process audio
    });
    
    it('should respond to encoder rotation', async () => {
      await bot.start();
      
      const mockInput = mockHardware.getMockInput();
      
      // Simulate encoder events
      mockInput.simulateEvent(HardwareEvent.ENCODER_CW);
      mockInput.simulateEvent(HardwareEvent.ENCODER_CCW);
      
      // Should update UI state
    });
    
    it('should respond to encoder button press', async () => {
      await bot.start();
      
      const mockInput = mockHardware.getMockInput();
      
      mockInput.simulateEvent(HardwareEvent.ENCODER_BUTTON);
      
      // Should toggle menu or perform action
    });
  });
  
  describe('Error Handling', () => {
    it('should handle hardware initialization failure gracefully', async () => {
      // Create a failing hardware mock
      const failingHardware = new MockVoiceHardware();
      const originalInit = failingHardware.init.bind(failingHardware);
      failingHardware.init = async () => {
        throw new Error('Hardware init failed');
      };
      
      const config = loadVoiceConfig();
      const failingBot = new VoiceBot(config, failingHardware);
      
      await expect(failingBot.start()).rejects.toThrow();
    });
    
    it('should handle missing API keys gracefully', async () => {
      const config = loadVoiceConfig({
        services: {
          deepgram: {
            endpoint: 'https://api.deepgram.com/v1/listen',
            // apiKey missing
            model: 'nova-3',
            smartFormat: true,
          },
          chatterbox: {
            baseUrl: 'http://localhost:4123',
            voiceSamplePath: '/tmp/test-voice.wav',
            exaggeration: 0.9,
            cfgWeight: 0.3,
            temperature: 0.9,
          },
        },
      });
      
      const testBot = new VoiceBot(config, new MockVoiceHardware());
      
      // Should start but warn about missing API key
      await expect(testBot.start()).resolves.not.toThrow();
      await testBot.stop();
    });
  });
  
  describe('Configuration', () => {
    it('should load default configuration', () => {
      const config = loadVoiceConfig();
      
      expect(config.hardware.gpio.pttButton).toBe(17);
      expect(config.hardware.display.width).toBe(128);
      expect(config.hardware.audio.sampleRate).toBe(16000);
    });
    
    it('should apply configuration overrides', () => {
      const config = loadVoiceConfig({
        hardware: {
          gpio: {
            pttButton: 99,
            encoderA: 22,
            encoderB: 27,
            encoderButton: 23,
          },
          display: {
            i2cBus: 1,
            i2cAddress: 0x3C,
            width: 128,
            height: 64,
          },
          audio: {
            inputDevice: 'default',
            outputDevice: 'default',
            sampleRate: 16000,
            bitDepth: 16,
            channels: 1,
            format: 'linear16',
          },
        },
        services: {
          deepgram: {
            endpoint: 'https://api.deepgram.com/v1/listen',
            model: 'nova-3',
            smartFormat: true,
          },
          chatterbox: {
            baseUrl: 'http://localhost:4123',
            voiceSamplePath: '/tmp/test.wav',
            exaggeration: 0.9,
            cfgWeight: 0.3,
            temperature: 0.9,
          },
        },
        session: {
          defaultSession: 'agent:main:main',
          label: 'voice',
        },
        behavior: {
          ttsResetInterval: 2,
          maxRecordingMs: 30000,
          displayTimeoutMs: 60000,
        },
      });
      
      expect(config.hardware.gpio.pttButton).toBe(99);
    });
  });
});
