/**
 * Acknowledgment Service Tests
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import {
  loadAcknowledgments,
  selectAcknowledgment,
  clearAckCache,
  type AckAudio,
} from '../acknowledgments';
import type { VoiceConfig } from '../../voice-config';

// Mock config
const mockConfig: VoiceConfig = {
  hardware: {
    gpio: {
      pttButton: 23,
      encoderA: 5,
      encoderB: 6,
      encoderButton: 26,
    },
    display: {
      i2cBus: 1,
      i2cAddress: 0x3c,
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
      apiKey: process.env.DEEPGRAM_API_KEY || 'test-key',
      endpoint: 'https://api.deepgram.com/v1/listen',
      model: 'nova-2',
      smartFormat: true,
    },
    chatterbox: {
      endpoint: 'http://localhost:4123',
      voiceSample: '/path/to/voice.wav',
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
    ackDirectory: '/mnt/ssd/cyclops-workspace/voice-acks',
    maxRecordingMs: 30000,
  },
};

describe('Acknowledgment Service', () => {
  beforeEach(() => {
    clearAckCache();
  });

  describe('selectAcknowledgment', () => {
    const mockAcks: AckAudio[] = [
      {
        name: 'let-me-see',
        path: '/acks/let-me-see.wav',
        keywords: ['what', 'show', 'look', 'see'],
      },
      {
        name: 'checking',
        path: '/acks/checking.wav',
        keywords: ['check', 'verify', 'confirm'],
      },
      {
        name: 'searching',
        path: '/acks/searching.wav',
        keywords: ['find', 'search', 'locate'],
      },
      {
        name: 'thinking',
        path: '/acks/thinking.wav',
        keywords: ['think', 'consider'],
      },
    ];

    test('selects ack based on keyword match', () => {
      const transcript = 'What is on the bench?';
      const selected = selectAcknowledgment(transcript, mockAcks);

      expect(selected).toBeDefined();
      expect(selected?.name).toBe('let-me-see');
    });

    test('selects ack for "check" keyword', () => {
      const transcript = 'Check the voltage';
      const selected = selectAcknowledgment(transcript, mockAcks);

      expect(selected?.name).toBe('checking');
    });

    test('selects ack for "find" keyword', () => {
      const transcript = 'Find the datasheet';
      const selected = selectAcknowledgment(transcript, mockAcks);

      expect(selected?.name).toBe('searching');
    });

    test('falls back to "thinking" when no keyword matches', () => {
      const transcript = 'Tell me about hardware';
      const selected = selectAcknowledgment(transcript, mockAcks);

      expect(selected).toBeDefined();
      expect(selected?.name).toBe('thinking');
    });

    test('is case-insensitive', () => {
      const transcript = 'WHAT IS THIS?';
      const selected = selectAcknowledgment(transcript, mockAcks);

      expect(selected?.name).toBe('let-me-see');
    });

    test('prefers earlier keyword matches', () => {
      const transcript = 'Search and verify this';
      // "search" appears before "verify"
      const selected = selectAcknowledgment(transcript, mockAcks);

      expect(selected?.name).toBe('searching');
    });

    test('returns null when acks array is empty', () => {
      const selected = selectAcknowledgment('What is this?', []);

      expect(selected).toBeNull();
    });

    test('handles partial keyword matches', () => {
      const transcript = 'Let me show you something';
      const selected = selectAcknowledgment(transcript, mockAcks);

      expect(selected?.name).toBe('let-me-see');
    });
  });

  describe('loadAcknowledgments', () => {
    test('loads and caches acknowledgments', async () => {
      // This test requires actual ack files to exist
      // For CI/CD, we might want to mock fs.stat and fs.access
      
      const acks = await loadAcknowledgments(mockConfig);
      
      expect(acks).toBeDefined();
      expect(Array.isArray(acks)).toBe(true);
      expect(acks.length).toBeGreaterThan(0);
      
      // Should include standard acks
      const ackNames = acks.map(a => a.name);
      expect(ackNames).toContain('thinking');
      expect(ackNames).toContain('checking');
      expect(ackNames).toContain('searching');
    });

    test('returns cached acks on second call', async () => {
      const acks1 = await loadAcknowledgments(mockConfig);
      const acks2 = await loadAcknowledgments(mockConfig);
      
      // Should return same instance (cached)
      expect(acks1).toBe(acks2);
    });

    test('clears cache when requested', async () => {
      const acks1 = await loadAcknowledgments(mockConfig);
      clearAckCache();
      const acks2 = await loadAcknowledgments(mockConfig);
      
      // Should be different instances
      expect(acks1).not.toBe(acks2);
    });
  });

  describe('Keyword Coverage', () => {
    const mockAcks: AckAudio[] = [
      { name: 'let-me-see', path: '/acks/let-me-see.wav', keywords: ['what', 'show', 'look', 'see', 'display', 'view'] },
      { name: 'checking', path: '/acks/checking.wav', keywords: ['check', 'verify', 'confirm', 'validate'] },
      { name: 'searching', path: '/acks/searching.wav', keywords: ['find', 'search', 'locate', 'where'] },
      { name: 'pulling-up', path: '/acks/pulling-up.wav', keywords: ['get', 'fetch', 'retrieve', 'pull', 'grab'] },
      { name: 'analyzing', path: '/acks/analyzing.wav', keywords: ['analyze', 'examine', 'study', 'review'] },
      { name: 'investigating', path: '/acks/investigating.wav', keywords: ['how', 'why', 'explain', 'tell me'] },
      { name: 'diagnostics', path: '/acks/diagnostics.wav', keywords: ['diagnose', 'debug', 'troubleshoot', 'fix'] },
      { name: 'executing', path: '/acks/executing.wav', keywords: ['run', 'execute', 'do', 'perform', 'start'] },
      { name: 'thinking', path: '/acks/thinking.wav', keywords: ['think', 'consider', 'evaluate'] },
      { name: 'on-it', path: '/acks/on-it.wav', keywords: ['help', 'assist', 'support', 'please'] },
      { name: 'understood', path: '/acks/understood.wav', keywords: ['set', 'configure', 'change', 'update'] },
    ];

    test('handles common question patterns', () => {
      const testCases = [
        { query: "What's on the bench?", expectedAck: 'let-me-see' },
        { query: "How does this work?", expectedAck: 'investigating' },
        { query: "Why did it fail?", expectedAck: 'investigating' },
        { query: "Find the datasheet", expectedAck: 'searching' },
        { query: "Check the voltage", expectedAck: 'checking' },
        { query: "Run a diagnostic", expectedAck: 'executing' },
        { query: "Help me with this", expectedAck: 'on-it' },
        { query: "Get the temperature", expectedAck: 'pulling-up' },
        { query: "Analyze this circuit", expectedAck: 'analyzing' },
        { query: "Debug the issue", expectedAck: 'diagnostics' },
      ];

      for (const { query, expectedAck } of testCases) {
        const selected = selectAcknowledgment(query, mockAcks);
        expect(selected?.name).toBe(expectedAck);
      }
    });
  });
});
