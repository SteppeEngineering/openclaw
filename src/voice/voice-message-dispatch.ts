/**
 * Voice Message Dispatch
 * 
 * Routes voice messages to agent sessions:
 * - Transcribe audio via Deepgram STT
 * - Format message envelope for agent
 * - Route to appropriate session
 * - Handle agent response
 */

import type { VoiceConfig } from './voice-config';
import type { VoiceBot } from './voice-bot';
import type { VoiceHardware } from './hardware/types';

/**
 * Transcription result from Deepgram
 */
export interface TranscriptionResult {
  /** Transcribed text */
  text: string;
  /** Confidence score (0-1) */
  confidence: number;
  /** Duration in seconds */
  duration: number;
  /** Full Deepgram response (for debugging) */
  raw?: any;
}

/**
 * Message envelope for agent session
 */
export interface MessageEnvelope {
  /** Session identifier (e.g., 'agent:main:main') */
  sessionId: string;
  /** Channel label (e.g., 'voice') */
  channel: string;
  /** Message content */
  content: string;
  /** Message metadata */
  metadata: {
    /** Source of message */
    source: 'voice';
    /** Timestamp */
    timestamp: number;
    /** Audio duration (ms) */
    audioDuration?: number;
    /** Transcription confidence */
    confidence?: number;
  };
}

/**
 * Agent response
 */
export interface AgentResponse {
  /** Response text */
  text: string;
  /** Response metadata */
  metadata?: {
    /** Model used */
    model?: string;
    /** Processing time (ms) */
    processingTime?: number;
  };
}

/**
 * Transcribe audio buffer using Deepgram STT
 * 
 * @param audioBuffer - Audio data (linear16 format expected)
 * @param config - Voice configuration
 * @returns Transcription result
 */
export async function transcribeAudio(
  audioBuffer: Buffer,
  config: VoiceConfig
): Promise<TranscriptionResult> {
  const { deepgram } = config.services;
  
  // Check for API key
  if (!deepgram.apiKey) {
    throw new Error('Deepgram API key not configured. Set DEEPGRAM_API_KEY environment variable.');
  }
  
  // Prepare request
  const url = new URL(deepgram.endpoint);
  url.searchParams.set('model', deepgram.model);
  url.searchParams.set('smart_format', String(deepgram.smartFormat));
  
  console.log(`[Deepgram] Transcribing ${audioBuffer.length} bytes...`);
  
  try {
    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Authorization': `Token ${deepgram.apiKey}`,
        'Content-Type': 'audio/linear16',
      },
      body: audioBuffer,
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Deepgram API error (${response.status}): ${errorText}`);
    }
    
    const result = await response.json();
    
    // Extract transcription
    const transcript = result.results?.channels?.[0]?.alternatives?.[0];
    
    if (!transcript || !transcript.transcript) {
      throw new Error('No transcription returned from Deepgram');
    }
    
    const transcriptionResult: TranscriptionResult = {
      text: transcript.transcript,
      confidence: transcript.confidence || 0,
      duration: result.metadata?.duration || 0,
      raw: result,
    };
    
    console.log(`[Deepgram] Transcription: "${transcriptionResult.text}" (confidence: ${transcriptionResult.confidence.toFixed(2)})`);
    
    return transcriptionResult;
    
  } catch (error) {
    console.error('[Deepgram] Transcription failed:', error);
    throw new Error(`Transcription failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Create message envelope for agent session
 * 
 * @param transcription - Transcription result
 * @param config - Voice configuration
 * @returns Message envelope
 */
export function createMessageEnvelope(
  transcription: TranscriptionResult,
  config: VoiceConfig
): MessageEnvelope {
  return {
    sessionId: config.session.defaultSession,
    channel: config.session.label,
    content: transcription.text,
    metadata: {
      source: 'voice',
      timestamp: Date.now(),
      audioDuration: Math.round(transcription.duration * 1000),
      confidence: transcription.confidence,
    },
  };
}

/**
 * Route message to agent session and wait for response
 * 
 * Integrates with OpenClaw session manager to deliver voice messages
 * to the configured agent session and receive responses.
 * 
 * @param envelope - Message envelope
 * @param config - Voice configuration
 * @returns Agent response
 */
export async function routeToSession(
  envelope: MessageEnvelope,
  config: VoiceConfig
): Promise<AgentResponse> {
  console.log(`[Dispatch] Routing message to session: ${envelope.sessionId}`);
  console.log(`[Dispatch] Content: "${envelope.content}"`);
  
  const startTime = Date.now();
  
  try {
    // Get the voice runtime (set by plugin registration)
    const { getVoiceRuntime } = await import('../../extensions/voice/src/runtime.js');
    const runtime = getVoiceRuntime();
    
    // Create session message payload
    // This uses the OpenClaw message routing system
    const messagePayload = {
      channel: 'voice',
      from: 'voice-hardware',
      fromId: 'voice:main',
      accountId: 'default',
      text: envelope.content,
      metadata: envelope.metadata,
    };
    
    console.log('[Dispatch] Sending message to session via runtime API...');
    
    // Route through OpenClaw session API
    // The runtime API provides session message routing
    const response = await runtime.session.sendMessage({
      sessionId: envelope.sessionId,
      payload: messagePayload,
      channel: 'voice',
      waitForReply: true, // Wait for agent response
      timeoutMs: 30000, // 30 second timeout
    });
    
    if (!response || !response.text) {
      throw new Error('No response from agent session');
    }
    
    const processingTime = Date.now() - startTime;
    
    const agentResponse: AgentResponse = {
      text: response.text,
      metadata: {
        model: response.metadata?.model || 'unknown',
        processingTime,
      },
    };
    
    console.log(`[Dispatch] Agent response received (${processingTime}ms): "${agentResponse.text}"`);
    
    return agentResponse;
    
  } catch (error) {
    console.error('[Dispatch] Session routing failed:', error);
    
    // If runtime not available or error, fall back to mock for graceful degradation
    console.warn('[Dispatch] Falling back to mock response (runtime integration not available)');
    
    const mockResponse: AgentResponse = {
      text: `I heard you say: "${envelope.content}". However, I'm not connected to the agent session right now.`,
      metadata: {
        model: 'mock-fallback',
        processingTime: Date.now() - startTime,
      },
    };
    
    return mockResponse;
  }
}

/**
 * Handle agent response (orchestrate TTS and display)
 * 
 * @param response - Agent response
 * @param hardware - Hardware interface
 * @param bot - Voice bot instance
 */
export async function handleResponse(
  response: AgentResponse,
  hardware: VoiceHardware,
  bot: VoiceBot
): Promise<void> {
  console.log(`[Response] Handling agent response...`);
  
  try {
    // Import voice-send module (will be implemented in Step 8)
    const { deliverResponse } = await import('./voice-send.js');
    
    // Deliver response via TTS and display
    await deliverResponse(response.text, hardware, bot);
    
  } catch (error) {
    console.error('[Response] Failed to handle response:', error);
    
    // Show error on display
    await hardware.display.clear();
    await hardware.display.writeText('Error', 0, 0, 2);
    await hardware.display.writeText('Response failed', 0, 24, 1);
    await hardware.display.update();
    
    throw error;
  }
}

/**
 * Complete message dispatch flow
 * 
 * This is the main entry point called from voice-handlers.ts
 * when a recording is complete.
 * 
 * @param audioBuffer - Recorded audio data
 * @param hardware - Hardware interface
 * @param bot - Voice bot instance
 */
export async function dispatchVoiceMessage(
  audioBuffer: Buffer,
  hardware: VoiceHardware,
  bot: VoiceBot
): Promise<void> {
  const config = bot.getConfig();
  
  try {
    // Step 1: Transcribe audio
    console.log('[Dispatch] Step 1: Transcribing audio...');
    await updateDisplay(hardware, 'Processing...', 'Transcribing...');
    
    const transcription = await transcribeAudio(audioBuffer, config);
    
    if (!transcription.text || transcription.text.trim().length === 0) {
      console.warn('[Dispatch] Empty transcription, aborting');
      await updateDisplay(hardware, 'No Speech', 'Try again');
      
      setTimeout(async () => {
        await showIdleScreen(hardware);
      }, 2000);
      
      return;
    }
    
    // Step 2: Create message envelope
    console.log('[Dispatch] Step 2: Creating message envelope...');
    const envelope = createMessageEnvelope(transcription, config);
    
    // Step 3: Route to agent session
    console.log('[Dispatch] Step 3: Routing to agent...');
    await updateDisplay(hardware, 'Thinking...', 'Agent processing');
    
    const response = await routeToSession(envelope, config);
    
    // Step 4: Handle response
    console.log('[Dispatch] Step 4: Delivering response...');
    await handleResponse(response, hardware, bot);
    
    console.log('[Dispatch] Message dispatch complete');
    
  } catch (error) {
    console.error('[Dispatch] Message dispatch failed:', error);
    
    await updateDisplay(hardware, 'Error', 'Dispatch failed');
    
    setTimeout(async () => {
      await showIdleScreen(hardware);
    }, 3000);
    
    throw error;
  }
}

/**
 * Helper: Update display with status
 */
async function updateDisplay(
  hardware: VoiceHardware,
  line1: string,
  line2?: string
): Promise<void> {
  try {
    await hardware.display.clear();
    await hardware.display.writeText(line1, 0, 0, 2);
    
    if (line2) {
      await hardware.display.writeText(line2, 0, 24, 1);
    }
    
    await hardware.display.update();
  } catch (error) {
    console.error('[Display] Update failed:', error);
  }
}

/**
 * Helper: Show idle screen
 */
async function showIdleScreen(hardware: VoiceHardware): Promise<void> {
  await updateDisplay(hardware, 'Ready', 'Press PTT');
}
