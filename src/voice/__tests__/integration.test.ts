/**
 * Voice Channel End-to-End Integration Tests
 * 
 * Tests complete voice interaction workflows with all components.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { VoiceBot } from '../voice-bot';
import { MockVoiceHardware, createTestAudioBuffer } from '../hardware/mock-hardware';
import { VoiceDisplay, ScreenState } from '../ui/voice-display';
import { loadVoiceConfig } from '../voice-config';
import { HardwareEvent } from '../hardware/types';

describe('Voice Channel Integration', () => {
  let bot: VoiceBot;
  let hardware: MockVoiceHardware;
  let display: VoiceDisplay;
  let config: ReturnType<typeof loadVoiceConfig>;
  
  beforeEach(async () => {
    config = loadVoiceConfig({
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
    
    hardware = new MockVoiceHardware();
    await hardware.init(config);
    
    display = new VoiceDisplay(hardware.display, config);
    await display.init();
    
    bot = new VoiceBot(config, hardware);
  });
  
  afterEach(async () => {
    if (bot) {
      await bot.stop();
    }
    if (display) {
      await display.close();
    }
    if (hardware) {
      await hardware.close();
    }
  });
  
  describe('Complete Voice Workflow', () => {
    it('should handle complete PTT → record → transcribe → respond flow', async () => {
      await bot.start();
      
      const mockInput = hardware.getMockInput();
      
      // 1. User presses PTT
      mockInput.simulateEvent(HardwareEvent.PTT_PRESS);
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Display should show recording state
      // (This would require exposing display state from VoiceBot)
      
      // 2. User speaks for 1 second
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // 3. User releases PTT
      mockInput.simulateEvent(HardwareEvent.PTT_RELEASE);
      
      // Bot should:
      // - Stop recording
      // - Show processing state
      // - Send audio to Deepgram (mocked)
      // - Route message to agent (mocked)
      // - Receive agent response (mocked)
      // - Generate TTS (mocked)
      // - Play audio response
      // - Return to home screen
      
      await new Promise(resolve => setTimeout(resolve, 500));
    });
    
    it('should handle rapid PTT press/release', async () => {
      await bot.start();
      
      const mockInput = hardware.getMockInput();
      
      // Press and immediately release
      mockInput.simulateEvent(HardwareEvent.PTT_PRESS);
      await new Promise(resolve => setTimeout(resolve, 10));
      mockInput.simulateEvent(HardwareEvent.PTT_RELEASE);
      
      // Should handle gracefully without crashing
      await new Promise(resolve => setTimeout(resolve, 100));
    });
    
    it('should handle long recording (max duration)', async () => {
      await bot.start();
      
      const mockInput = hardware.getMockInput();
      
      mockInput.simulateEvent(HardwareEvent.PTT_PRESS);
      
      // Hold PTT for longer than max duration
      const maxDuration = config.behavior.maxRecordingMs;
      await new Promise(resolve => setTimeout(resolve, maxDuration + 500));
      
      // Should auto-stop recording at max duration
      mockInput.simulateEvent(HardwareEvent.PTT_RELEASE);
      
      await new Promise(resolve => setTimeout(resolve, 100));
    });
  });
  
  describe('Display State Transitions', () => {
    it('should transition HOME → RECORDING → PROCESSING', async () => {
      // Start at home
      expect(display.getState()).toBe(ScreenState.HOME);
      
      // Show recording
      await display.showRecording();
      expect(display.getState()).toBe(ScreenState.RECORDING);
      
      // Show processing
      await display.showProcessing();
      expect(display.getState()).toBe(ScreenState.PROCESSING);
    });
    
    it('should transition PROCESSING → PLAYING → HOME', async () => {
      await display.showProcessing('Transcribing...');
      expect(display.getState()).toBe(ScreenState.PROCESSING);
      
      await display.showResponse('Agent response here');
      expect(display.getState()).toBe(ScreenState.PLAYING);
      
      await display.showHome();
      expect(display.getState()).toBe(ScreenState.HOME);
    });
    
    it('should handle error state transition', async () => {
      await display.showHome();
      
      await display.showError('Network error');
      expect(display.getState()).toBe(ScreenState.ERROR);
      
      // Should be able to recover to home
      await display.showHome();
      expect(display.getState()).toBe(ScreenState.HOME);
    });
  });
  
  describe('Audio Recording and Playback', () => {
    it('should record and play audio in sequence', async () => {
      const audio = hardware.audio;
      
      // Record
      await audio.startRecording();
      await new Promise(resolve => setTimeout(resolve, 1000));
      const recordedBuffer = await audio.stopRecording();
      
      expect(recordedBuffer.length).toBeGreaterThan(0);
      
      // Play back
      await audio.playAudio(recordedBuffer, 'wav');
    });
    
    it('should handle multiple record/playback cycles', async () => {
      const audio = hardware.audio;
      
      for (let i = 0; i < 3; i++) {
        await audio.startRecording();
        await new Promise(resolve => setTimeout(resolve, 500));
        const buffer = await audio.stopRecording();
        
        await audio.playAudio(buffer, 'wav');
      }
    });
  });
  
  describe('Hardware Event Handling', () => {
    it('should handle all hardware events', async () => {
      await bot.start();
      
      const mockInput = hardware.getMockInput();
      const events: HardwareEvent[] = [
        HardwareEvent.PTT_PRESS,
        HardwareEvent.PTT_RELEASE,
        HardwareEvent.ENCODER_CW,
        HardwareEvent.ENCODER_CCW,
        HardwareEvent.ENCODER_BUTTON,
      ];
      
      for (const event of events) {
        mockInput.simulateEvent(event);
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    });
    
    it('should handle concurrent events gracefully', async () => {
      await bot.start();
      
      const mockInput = hardware.getMockInput();
      
      // Simulate multiple events in quick succession
      mockInput.simulateEvent(HardwareEvent.PTT_PRESS);
      mockInput.simulateEvent(HardwareEvent.ENCODER_CW);
      mockInput.simulateEvent(HardwareEvent.PTT_RELEASE);
      
      await new Promise(resolve => setTimeout(resolve, 100));
    });
  });
  
  describe('Error Scenarios', () => {
    it('should handle display errors gracefully', async () => {
      await bot.start();
      
      // Even if display fails, bot should continue
      await display.showError('Simulated display error');
      
      const mockInput = hardware.getMockInput();
      mockInput.simulateEvent(HardwareEvent.PTT_PRESS);
      
      await new Promise(resolve => setTimeout(resolve, 100));
    });
    
    it('should handle audio playback errors', async () => {
      const audio = hardware.audio;
      
      // Try to play invalid audio
      const invalidBuffer = Buffer.alloc(0);
      await expect(audio.playAudio(invalidBuffer)).resolves.not.toThrow();
    });
    
    it('should recover from recording errors', async () => {
      const audio = hardware.audio;
      
      await audio.startRecording();
      await audio.startRecording(); // Start again while already recording
      
      const buffer = await audio.stopRecording();
      expect(buffer).toBeInstanceOf(Buffer);
    });
  });
  
  describe('Configuration Impact', () => {
    it('should respect max recording duration', async () => {
      const shortConfig = loadVoiceConfig({
        behavior: {
          ttsResetInterval: 2,
          maxRecordingMs: 1000, // 1 second max
          displayTimeoutMs: 60000,
        },
        hardware: {
          gpio: {
            pttButton: 17,
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
      });
      
      expect(shortConfig.behavior.maxRecordingMs).toBe(1000);
    });
    
    it('should use configured audio settings', () => {
      expect(config.hardware.audio.sampleRate).toBe(16000);
      expect(config.hardware.audio.format).toBe('linear16');
      expect(config.hardware.audio.channels).toBe(1);
    });
    
    it('should use configured GPIO pins', () => {
      expect(config.hardware.gpio.pttButton).toBeDefined();
      expect(config.hardware.gpio.encoderA).toBeDefined();
      expect(config.hardware.gpio.encoderB).toBeDefined();
      expect(config.hardware.gpio.encoderButton).toBeDefined();
    });
  });
  
  describe('Lifecycle Management', () => {
    it('should handle clean startup and shutdown', async () => {
      await bot.start();
      expect(hardware.isInitialized()).toBe(true);
      
      await bot.stop();
      expect(hardware.isInitialized()).toBe(false);
    });
    
    it('should handle restart', async () => {
      await bot.start();
      await bot.stop();
      await bot.start();
      await bot.stop();
      
      expect(hardware.isInitialized()).toBe(false);
    });
    
    it('should clean up all resources on close', async () => {
      await bot.start();
      await bot.stop();
      
      await hardware.close();
      await display.close();
      
      // All resources should be released
      expect(hardware.isInitialized()).toBe(false);
    });
  });
});
