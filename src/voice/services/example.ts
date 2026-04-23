/**
 * Usage Example for Voice Services
 * 
 * Demonstrates how to use Deepgram and Chatterbox services.
 */

import { readFile } from 'fs/promises';
import { createDeepgramService, createChatterboxService } from './index';
import { loadVoiceConfig } from '../voice-config';

/**
 * Example: Transcribe audio file
 */
async function transcribeExample() {
  const config = loadVoiceConfig();
  const deepgram = createDeepgramService(config);

  // Read audio file
  const audioBuffer = await readFile('/tmp/recording.wav');

  // Transcribe with default settings
  const result = await deepgram.transcribe(audioBuffer);
  console.log('Transcript:', result.text);
  console.log('Confidence:', result.confidence);
  console.log('Duration:', result.duration, 'seconds');

  // Transcribe with custom options
  const customResult = await deepgram.transcribe(audioBuffer, {
    model: 'nova-3',
    smartFormat: true,
    language: 'en-US',
    punctuate: true,
    profanityFilter: false,
    timeoutMs: 30000,
  });

  console.log('Custom result:', customResult.text);

  // Check stats
  console.log('Stats:', deepgram.getStats());
}

/**
 * Example: Generate speech
 */
async function ttsExample() {
  const config = loadVoiceConfig();
  const chatterbox = createChatterboxService(config);

  // Check if service is available
  const isHealthy = await chatterbox.healthCheck();
  console.log('Chatterbox healthy:', isHealthy);

  if (!isHealthy) {
    console.error('Chatterbox server not reachable!');
    return;
  }

  // Generate speech (WAV)
  const wavResult = await chatterbox.generateSpeech({
    text: 'Very good, sir. The hardware is operational.',
  });
  console.log('Generated WAV:', wavResult.audioBuffer.length, 'bytes');
  console.log('Generation time:', wavResult.generationTimeMs, 'ms');

  // Generate speech (Opus for Telegram)
  const opusResult = await chatterbox.generateSpeech({
    text: 'I took the liberty of preparing a status report.',
    outputFormat: 'opus',
    exaggeration: 0.9,
    cfgWeight: 0.3,
    temperature: 0.9,
  });
  console.log('Generated Opus:', opusResult.audioBuffer.length, 'bytes');

  // Check stats
  console.log('Stats:', chatterbox.getStats());

  // Manually reset memory if needed
  await chatterbox.resetMemory();
}

/**
 * Example: Complete voice interaction workflow
 */
async function completeWorkflowExample(recordedAudio: Buffer) {
  const config = loadVoiceConfig();
  const deepgram = createDeepgramService(config);
  const chatterbox = createChatterboxService(config);

  try {
    // 1. Transcribe user's voice input
    console.log('Transcribing audio...');
    const transcription = await deepgram.transcribe(recordedAudio, {
      model: 'nova-3',
      smartFormat: true,
    });
    console.log('User said:', transcription.text);

    // 2. Process with agent (simplified - actual implementation routes to session)
    const agentResponse = await processWithAgent(transcription.text);
    console.log('Agent response:', agentResponse);

    // 3. Generate speech response
    console.log('Generating speech...');
    const ttsResult = await chatterbox.generateSpeech({
      text: agentResponse,
      outputFormat: 'wav',
    });
    console.log('Generated audio:', ttsResult.audioBuffer.length, 'bytes');

    // 4. Play audio through hardware
    await playAudio(ttsResult.audioBuffer);

    console.log('Workflow complete!');
  } catch (error) {
    console.error('Workflow error:', error);
    throw error;
  }
}

/**
 * Mock agent processing (replace with actual session routing)
 */
async function processWithAgent(text: string): Promise<string> {
  // This would be replaced with actual session dispatch
  return `I heard you say: "${text}". Very good, sir.`;
}

/**
 * Mock audio playback (replace with actual hardware audio)
 */
async function playAudio(buffer: Buffer): Promise<void> {
  console.log('Playing audio buffer:', buffer.length, 'bytes');
  // Actual implementation would use hardware audio device
}

/**
 * Example: Error handling
 */
async function errorHandlingExample() {
  const config = loadVoiceConfig();
  const deepgram = createDeepgramService(config, {
    maxRetries: 5,
    initialDelayMs: 500,
    maxDelayMs: 10000,
    backoffMultiplier: 2,
  });

  try {
    const audioBuffer = await readFile('/tmp/test.wav');
    const result = await deepgram.transcribe(audioBuffer, {
      timeoutMs: 15000, // 15 second timeout
    });
    console.log('Success:', result.text);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('timeout')) {
        console.error('Request timed out');
      } else if (error.message.includes('API error')) {
        console.error('Deepgram API error:', error.message);
      } else if (error.message.includes('API key')) {
        console.error('API key not configured');
      } else {
        console.error('Unknown error:', error.message);
      }
    }
  }
}

// Export examples for testing
export {
  transcribeExample,
  ttsExample,
  completeWorkflowExample,
  errorHandlingExample,
};
