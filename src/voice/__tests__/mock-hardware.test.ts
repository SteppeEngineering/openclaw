/**
 * Mock Hardware Tests
 * 
 * Tests for the mock hardware implementation.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { 
  MockVoiceHardware, 
  createMockHardware,
  simulateVoiceInteraction,
  createTestAudioBuffer
} from '../hardware/mock-hardware';
import { loadVoiceConfig } from '../voice-config';
import { HardwareEvent, RecordingState } from '../hardware/types';

describe('MockVoiceHardware', () => {
  let hardware: MockVoiceHardware;
  let config: ReturnType<typeof loadVoiceConfig>;
  
  beforeEach(async () => {
    config = loadVoiceConfig();
    hardware = new MockVoiceHardware();
    await hardware.init(config);
  });
  
  afterEach(async () => {
    await hardware.close();
  });
  
  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      expect(hardware.isInitialized()).toBe(true);
    });
    
    it('should have correct type', () => {
      expect(hardware.type).toBe('mock');
    });
    
    it('should initialize all components', async () => {
      expect(hardware.audio).toBeDefined();
      expect(hardware.display).toBeDefined();
      expect(hardware.input).toBeDefined();
    });
    
    it('should use factory function', async () => {
      const hw = await createMockHardware(config);
      expect(hw.type).toBe('mock');
      await hw.close();
    });
  });
  
  describe('Audio Device', () => {
    it('should start and stop recording', async () => {
      const audio = hardware.audio;
      
      await audio.startRecording();
      expect(audio.getRecordingState()).toBe(RecordingState.RECORDING);
      
      const buffer = await audio.stopRecording();
      expect(audio.getRecordingState()).toBe(RecordingState.IDLE);
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });
    
    it('should record for specific duration', async () => {
      const audio = hardware.audio;
      
      await audio.startRecording();
      await new Promise(resolve => setTimeout(resolve, 500));
      const buffer = await audio.stopRecording();
      
      // Buffer should contain ~500ms of audio at 16kHz
      // 16000 samples/sec * 0.5sec * 2 bytes/sample = ~16000 bytes
      expect(buffer.length).toBeGreaterThan(10000);
    });
    
    it('should play audio buffer', async () => {
      const audio = hardware.audio;
      const testBuffer = createTestAudioBuffer(1000); // 1 second
      
      await expect(audio.playAudio(testBuffer, 'wav')).resolves.not.toThrow();
    });
    
    it('should handle playback with different formats', async () => {
      const audio = hardware.audio;
      const testBuffer = createTestAudioBuffer(500);
      
      await expect(audio.playAudio(testBuffer, 'opus')).resolves.not.toThrow();
      await expect(audio.playAudio(testBuffer, 'wav')).resolves.not.toThrow();
    });
    
    it('should clean up resources on close', async () => {
      const audio = hardware.audio;
      
      await audio.startRecording();
      await audio.close();
      
      expect(audio.getRecordingState()).toBe(RecordingState.IDLE);
    });
  });
  
  describe('Display Device', () => {
    it('should initialize with correct dimensions', () => {
      const dims = hardware.display.getDimensions();
      expect(dims.width).toBe(128);
      expect(dims.height).toBe(64);
    });
    
    it('should clear display', async () => {
      await expect(hardware.display.clear()).resolves.not.toThrow();
    });
    
    it('should write text at position', async () => {
      await hardware.display.writeText('Hello', 10, 10, 1);
      await hardware.display.update();
    });
    
    it('should write text with different sizes', async () => {
      await hardware.display.writeText('Small', 0, 0, 1);
      await hardware.display.writeText('Large', 0, 20, 2);
      await hardware.display.update();
    });
    
    it('should draw bitmap', async () => {
      const bitmap = Buffer.alloc(16 * 16); // 16x16 bitmap
      await hardware.display.drawBitmap(bitmap, 0, 0, 16, 16);
    });
    
    it('should control power state', async () => {
      await hardware.display.setPower(false);
      await hardware.display.setPower(true);
    });
    
    it('should handle multiple updates', async () => {
      await hardware.display.clear();
      await hardware.display.writeText('Line 1', 0, 0);
      await hardware.display.update();
      
      await hardware.display.clear();
      await hardware.display.writeText('Line 2', 0, 10);
      await hardware.display.update();
    });
  });
  
  describe('Input Device', () => {
    it('should register event handlers', async () => {
      const mockInput = hardware.getMockInput();
      const events: HardwareEvent[] = [];
      
      const handler = (event: HardwareEvent) => {
        events.push(event);
      };
      
      mockInput.on(HardwareEvent.PTT_PRESS, handler);
      mockInput.simulateEvent(HardwareEvent.PTT_PRESS);
      
      expect(events).toContain(HardwareEvent.PTT_PRESS);
      
      mockInput.off(HardwareEvent.PTT_PRESS, handler);
    });
    
    it('should emit PTT events', async () => {
      const mockInput = hardware.getMockInput();
      const events: string[] = [];
      
      mockInput.on(HardwareEvent.PTT_PRESS, () => events.push('press'));
      mockInput.on(HardwareEvent.PTT_RELEASE, () => events.push('release'));
      
      mockInput.simulateEvent(HardwareEvent.PTT_PRESS);
      mockInput.simulateEvent(HardwareEvent.PTT_RELEASE);
      
      expect(events).toEqual(['press', 'release']);
    });
    
    it('should emit encoder events', async () => {
      const mockInput = hardware.getMockInput();
      const events: string[] = [];
      
      mockInput.on(HardwareEvent.ENCODER_CW, () => events.push('cw'));
      mockInput.on(HardwareEvent.ENCODER_CCW, () => events.push('ccw'));
      mockInput.on(HardwareEvent.ENCODER_BUTTON, () => events.push('button'));
      
      mockInput.simulateEvent(HardwareEvent.ENCODER_CW);
      mockInput.simulateEvent(HardwareEvent.ENCODER_CCW);
      mockInput.simulateEvent(HardwareEvent.ENCODER_BUTTON);
      
      expect(events).toEqual(['cw', 'ccw', 'button']);
    });
    
    it('should remove event handlers', async () => {
      const mockInput = hardware.getMockInput();
      const events: string[] = [];
      
      const handler = () => events.push('event');
      
      mockInput.on(HardwareEvent.PTT_PRESS, handler);
      mockInput.simulateEvent(HardwareEvent.PTT_PRESS);
      expect(events.length).toBe(1);
      
      mockInput.off(HardwareEvent.PTT_PRESS, handler);
      mockInput.simulateEvent(HardwareEvent.PTT_PRESS);
      expect(events.length).toBe(1); // Should not increase
    });
  });
  
  describe('Full Interaction Simulation', () => {
    it('should simulate complete voice interaction', async () => {
      const responseBuffer = createTestAudioBuffer(2000);
      
      await expect(
        simulateVoiceInteraction(
          hardware,
          'Test transcription',
          responseBuffer
        )
      ).resolves.not.toThrow();
    });
    
    it('should handle interaction with short audio', async () => {
      const responseBuffer = createTestAudioBuffer(500);
      
      await simulateVoiceInteraction(
        hardware,
        'Quick test',
        responseBuffer
      );
    });
    
    it('should handle interaction with long audio', async () => {
      const responseBuffer = createTestAudioBuffer(5000);
      
      await simulateVoiceInteraction(
        hardware,
        'This is a longer transcription to test audio handling',
        responseBuffer
      );
    });
  });
  
  describe('Test Audio Buffer Utility', () => {
    it('should create audio buffer with correct duration', () => {
      const buffer = createTestAudioBuffer(1000); // 1 second
      
      // 16kHz sample rate, 16-bit samples = 32000 bytes/sec
      expect(buffer.length).toBeGreaterThan(30000);
      expect(buffer.length).toBeLessThan(34000);
    });
    
    it('should create buffers with different durations', () => {
      const buffer1 = createTestAudioBuffer(500);
      const buffer2 = createTestAudioBuffer(1000);
      const buffer3 = createTestAudioBuffer(2000);
      
      expect(buffer2.length).toBeGreaterThan(buffer1.length);
      expect(buffer3.length).toBeGreaterThan(buffer2.length);
    });
    
    it('should create buffer with custom sample rate', () => {
      const buffer = createTestAudioBuffer(1000, 44100);
      
      // 44.1kHz sample rate should create larger buffer
      expect(buffer.length).toBeGreaterThan(80000);
    });
  });
  
  describe('Cleanup', () => {
    it('should close all components', async () => {
      await hardware.close();
      expect(hardware.isInitialized()).toBe(false);
    });
    
    it('should handle multiple close calls', async () => {
      await hardware.close();
      await expect(hardware.close()).resolves.not.toThrow();
    });
  });
});
