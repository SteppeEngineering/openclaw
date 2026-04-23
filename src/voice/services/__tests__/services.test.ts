/**
 * Voice Services Tests
 * 
 * Unit tests for Deepgram and Chatterbox service clients.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { DeepgramService } from '../deepgram';
import { ChatterboxService } from '../chatterbox';
import type { VoiceConfig } from '../../voice-config';

// Mock fetch globally
global.fetch = jest.fn() as any;

const mockConfig: VoiceConfig = {
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
      apiKey: 'test-api-key',
      model: 'nova-3',
      smartFormat: true,
    },
    chatterbox: {
      baseUrl: 'http://localhost:4123',
      voiceSamplePath: '/tmp/voice-sample.wav',
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
};

describe('DeepgramService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should initialize with config', () => {
    const service = new DeepgramService(mockConfig.services.deepgram);
    expect(service).toBeDefined();
    expect(service.getStats().requestCount).toBe(0);
  });

  it('should throw if API key is missing', () => {
    const configWithoutKey = { ...mockConfig.services.deepgram, apiKey: undefined };
    delete process.env.DEEPGRAM_API_KEY;
    
    expect(() => new DeepgramService(configWithoutKey)).toThrow('API key not configured');
  });

  it('should detect WAV content type', async () => {
    const service = new DeepgramService(mockConfig.services.deepgram);
    
    // WAV magic bytes: RIFF....WAVE
    const wavBuffer = Buffer.from([
      0x52, 0x49, 0x46, 0x46, // RIFF
      0x00, 0x00, 0x00, 0x00, // size
      0x57, 0x41, 0x56, 0x45, // WAVE
    ]);

    // Mock successful response
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        metadata: {
          request_id: 'test-123',
          duration: 5.0,
        },
        results: {
          channels: [{
            alternatives: [{
              transcript: 'test transcript',
              confidence: 0.95,
            }],
          }],
        },
      }),
    });

    const result = await service.transcribe(wavBuffer);
    expect(result.text).toBe('test transcript');
    expect(result.confidence).toBe(0.95);
    
    // Check that fetch was called with WAV content type
    const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
    expect(fetchCall[1].headers['Content-Type']).toBe('audio/wav');
  });

  it('should retry on network errors', async () => {
    const service = new DeepgramService(mockConfig.services.deepgram, {
      maxRetries: 2,
      initialDelayMs: 10,
    });

    const audioBuffer = Buffer.from('test');

    // First call fails, second succeeds
    (global.fetch as jest.Mock)
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          metadata: { request_id: 'test', duration: 1.0 },
          results: {
            channels: [{
              alternatives: [{ transcript: 'retry success', confidence: 0.9 }],
            }],
          },
        }),
      });

    const result = await service.transcribe(audioBuffer);
    expect(result.text).toBe('retry success');
    expect((global.fetch as jest.Mock).mock.calls.length).toBe(2);
  });

  it('should handle API errors', async () => {
    const service = new DeepgramService(mockConfig.services.deepgram);
    const audioBuffer = Buffer.from('test');

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({
        err_code: 'INVALID_AUDIO',
        err_msg: 'Audio format not supported',
      }),
    });

    await expect(service.transcribe(audioBuffer)).rejects.toThrow('INVALID_AUDIO');
  });
});

describe('ChatterboxService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should initialize with config', () => {
    const service = new ChatterboxService(mockConfig.services.chatterbox, 2);
    expect(service).toBeDefined();
    expect(service.getStats().requestCount).toBe(0);
  });

  it('should reject text over 3000 characters', async () => {
    const service = new ChatterboxService(mockConfig.services.chatterbox);
    const longText = 'a'.repeat(3001);

    await expect(service.generateSpeech({ text: longText })).rejects.toThrow('exceeds Chatterbox limit');
  });

  it('should reject empty text', async () => {
    const service = new ChatterboxService(mockConfig.services.chatterbox);

    await expect(service.generateSpeech({ text: '' })).rejects.toThrow('cannot be empty');
    await expect(service.generateSpeech({ text: '   ' })).rejects.toThrow('cannot be empty');
  });

  it('should perform health check', async () => {
    const service = new ChatterboxService(mockConfig.services.chatterbox);

    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true });

    const healthy = await service.healthCheck();
    expect(healthy).toBe(true);
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toContain('/health');
  });

  it('should reset memory manually', async () => {
    const service = new ChatterboxService(mockConfig.services.chatterbox);

    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true });

    await service.resetMemory();
    
    const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
    expect(fetchCall[0]).toContain('/memory/reset');
    expect(fetchCall[0]).toContain('confirm=true');
  });

  it('should track request count and reset interval', () => {
    const service = new ChatterboxService(mockConfig.services.chatterbox, 3);
    
    const stats = service.getStats();
    expect(stats.resetInterval).toBe(3);
    expect(stats.requestCount).toBe(0);
    expect(stats.lastMemoryReset).toBe(0);
  });
});
