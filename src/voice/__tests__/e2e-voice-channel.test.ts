/**
 * End-to-End Voice Channel Integration Test
 * 
 * Tests the complete voice channel flow from hardware input to agent response.
 * 
 * Run with:
 *   npm test -- e2e-voice-channel.test.ts
 * 
 * Or with real hardware (on Pi):
 *   VOICE_REAL_HARDWARE=1 npm test -- e2e-voice-channel.test.ts
 */

import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { VoiceBot } from '../voice-bot.js';
import { createMockHardware } from '../hardware/mock-hardware.js';
import { HardwareEvent, RecordingState } from '../hardware/types.js';
import type { VoiceConfig } from '../voice-config.js';

// Default test configuration
const testConfig: VoiceConfig = {
  enabled: true,
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
    },
  },
  services: {
    deepgram: {
      apiKey: process.env.DEEPGRAM_API_KEY || 'test-key',
      model: 'nova-3',
      smartFormat: true,
    },
    chatterbox: {
      baseUrl: process.env.CHATTERBOX_URL || 'http://100.114.0.61:4123',
      voiceSamplePath: '/mnt/ssd/cyclops-workspace/cy-voice-sample.wav',
      exaggeration: 0.9,
      cfgWeight: 0.3,
      temperature: 0.9,
      memoryResetInterval: 2,
    },
  },
  session: {
    defaultSession: 'agent:main:main',
    label: 'voice',
  },
  behavior: {
    maxRecordingMs: 30000,
    displayTimeoutMs: 60000,
    ackDelay: 500,
    ackDir: '/tmp/voice-acks',
  },
};

describe('Voice Channel End-to-End', () => {
  let voiceBot: VoiceBot;
  let hardware: Awaited<ReturnType<typeof createMockHardware>>;
  
  beforeAll(async () => {
    // Create mock hardware for testing
    hardware = await createMockHardware();
    
    // Create voice bot with mock hardware
    voiceBot = new VoiceBot({
      config: testConfig,
      hardwareFactory: async () => hardware,
      debug: true,
    });
    
    // Start the voice bot
    await voiceBot.start();
  });
  
  afterAll(async () => {
    // Clean shutdown
    await voiceBot?.stop();
  });
  
  test('Voice bot starts and initializes hardware', async () => {
    expect(voiceBot).toBeDefined();
    
    // Verify hardware is initialized
    const displayDims = hardware.display.getDimensions();
    expect(displayDims.width).toBe(128);
    expect(displayDims.height).toBe(64);
    
    // Verify audio is ready
    const audioState = hardware.audio.getRecordingState();
    expect(audioState).toBe(RecordingState.IDLE);
  });
  
  test('PTT button triggers recording flow', async () => {
    // Simulate PTT button press
    hardware.input.emit(HardwareEvent.PTT_PRESS);
    
    // Wait for recording to start
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Verify recording started
    const state = hardware.audio.getRecordingState();
    expect(state).toBe(RecordingState.RECORDING);
    
    // Simulate PTT button release after 2 seconds
    await new Promise(resolve => setTimeout(resolve, 2000));
    hardware.input.emit(HardwareEvent.PTT_RELEASE);
    
    // Wait for processing to complete
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Verify recording stopped
    const finalState = hardware.audio.getRecordingState();
    expect(finalState).toBe(RecordingState.IDLE);
  }, 10000); // 10 second timeout
  
  test('Encoder rotation adjusts volume', async () => {
    const initialVolume = await hardware.audio.getVolume();
    expect(initialVolume).toBeGreaterThanOrEqual(0);
    expect(initialVolume).toBeLessThanOrEqual(100);
    
    // Rotate clockwise (increase volume)
    hardware.input.emit(HardwareEvent.ENCODER_CW);
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const newVolume = await hardware.audio.getVolume();
    expect(newVolume).toBeGreaterThan(initialVolume);
    
    // Rotate counter-clockwise (decrease volume)
    hardware.input.emit(HardwareEvent.ENCODER_CCW);
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const finalVolume = await hardware.audio.getVolume();
    expect(finalVolume).toBeLessThan(newVolume);
  });
  
  test('Encoder button toggles mute', async () => {
    // Press encoder button (mute)
    hardware.input.emit(HardwareEvent.ENCODER_BUTTON);
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Verify mute indicator shown on display (implementation-dependent)
    // This is a placeholder - actual verification would check display state
    
    // Press again (unmute)
    hardware.input.emit(HardwareEvent.ENCODER_BUTTON);
    await new Promise(resolve => setTimeout(resolve, 100));
  });
  
  test('Short recordings are rejected', async () => {
    // Press and release PTT very quickly (< 500ms)
    hardware.input.emit(HardwareEvent.PTT_PRESS);
    await new Promise(resolve => setTimeout(resolve, 200));
    hardware.input.emit(HardwareEvent.PTT_RELEASE);
    
    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Recording should be discarded (too short)
    const state = hardware.audio.getRecordingState();
    expect(state).toBe(RecordingState.IDLE);
  });
  
  test('Maximum recording timeout works', async () => {
    // Use a short timeout for testing
    const shortTimeoutConfig = { ...testConfig };
    shortTimeoutConfig.behavior.maxRecordingMs = 1000; // 1 second
    
    const testBot = new VoiceBot({
      config: shortTimeoutConfig,
      hardwareFactory: async () => hardware,
      debug: true,
    });
    
    await testBot.start();
    
    try {
      // Start recording
      hardware.input.emit(HardwareEvent.PTT_PRESS);
      
      // Wait longer than timeout
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Recording should have auto-stopped
      const state = hardware.audio.getRecordingState();
      expect(state).toBe(RecordingState.IDLE);
    } finally {
      await testBot.stop();
    }
  }, 5000);
  
  test('Display updates during voice flow', async () => {
    // This is a placeholder - actual implementation would verify display state
    // by checking the buffer or screen content
    
    // Home screen should be showing
    const dims = hardware.display.getDimensions();
    expect(dims.width).toBeGreaterThan(0);
    
    // Press PTT - display should update to "Recording"
    hardware.input.emit(HardwareEvent.PTT_PRESS);
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Release PTT - display should update to "Processing"
    await new Promise(resolve => setTimeout(resolve, 500));
    hardware.input.emit(HardwareEvent.PTT_RELEASE);
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // After processing - display should return to home
    await new Promise(resolve => setTimeout(resolve, 2000));
  }, 5000);
  
  test('Hardware cleanup on shutdown', async () => {
    // Create a new bot instance to test cleanup
    const testBot = new VoiceBot({
      config: testConfig,
      hardwareFactory: async () => hardware,
      debug: false,
    });
    
    await testBot.start();
    
    // Verify bot is running
    expect(testBot).toBeDefined();
    
    // Stop the bot
    await testBot.stop();
    
    // Hardware should be cleaned up (display off, audio closed)
    // This is implementation-dependent and would need specific checks
  });
});

describe('Voice Channel Error Handling', () => {
  test('Handles missing Deepgram API key gracefully', async () => {
    const invalidConfig = { ...testConfig };
    invalidConfig.services.deepgram.apiKey = '';
    
    const hardware = await createMockHardware();
    
    const voiceBot = new VoiceBot({
      config: invalidConfig,
      hardwareFactory: async () => hardware,
      debug: true,
    });
    
    await voiceBot.start();
    
    // Simulate voice input
    hardware.input.emit(HardwareEvent.PTT_PRESS);
    await new Promise(resolve => setTimeout(resolve, 500));
    hardware.input.emit(HardwareEvent.PTT_RELEASE);
    
    // Should handle error gracefully (not crash)
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    await voiceBot.stop();
  });
  
  test('Handles unreachable Chatterbox server', async () => {
    const invalidConfig = { ...testConfig };
    invalidConfig.services.chatterbox.baseUrl = 'http://invalid:9999';
    
    const hardware = await createMockHardware();
    
    const voiceBot = new VoiceBot({
      config: invalidConfig,
      hardwareFactory: async () => hardware,
      debug: true,
    });
    
    await voiceBot.start();
    
    // Simulate voice input
    hardware.input.emit(HardwareEvent.PTT_PRESS);
    await new Promise(resolve => setTimeout(resolve, 500));
    hardware.input.emit(HardwareEvent.PTT_RELEASE);
    
    // Should handle error gracefully
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    await voiceBot.stop();
  });
});

describe('Voice Channel Performance', () => {
  test('Measures recording latency', async () => {
    const hardware = await createMockHardware();
    
    const voiceBot = new VoiceBot({
      config: testConfig,
      hardwareFactory: async () => hardware,
      debug: false,
    });
    
    await voiceBot.start();
    
    const startTime = Date.now();
    
    // Simulate voice input
    hardware.input.emit(HardwareEvent.PTT_PRESS);
    await new Promise(resolve => setTimeout(resolve, 1000));
    hardware.input.emit(HardwareEvent.PTT_RELEASE);
    
    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const totalTime = Date.now() - startTime;
    
    console.log(`Total processing time: ${totalTime}ms`);
    
    // Processing should complete within reasonable time (< 10 seconds for mock)
    expect(totalTime).toBeLessThan(10000);
    
    await voiceBot.stop();
  }, 15000);
  
  test('Measures volume adjustment responsiveness', async () => {
    const hardware = await createMockHardware();
    
    const startTime = Date.now();
    
    // Adjust volume multiple times
    for (let i = 0; i < 10; i++) {
      await hardware.audio.adjustVolume(5);
    }
    
    const totalTime = Date.now() - startTime;
    const avgTime = totalTime / 10;
    
    console.log(`Average volume adjustment time: ${avgTime}ms`);
    
    // Volume adjustment should be fast (< 100ms each)
    expect(avgTime).toBeLessThan(100);
  });
});
