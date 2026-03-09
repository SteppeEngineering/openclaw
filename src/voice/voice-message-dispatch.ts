/**
 * Voice message dispatch - routes voice queries to agent sessions
 */

import { getChildLogger } from "../logging.js";
import type { RuntimeEnv } from "../runtime.js";

const log = getChildLogger("voice-dispatch");

export type VoiceMessage = {
  transcript: string;
  confidence: number;
  timestamp: Date;
};

export type VoiceResponse = {
  text: string;
  timestamp: Date;
};

/**
 * Voice session manager
 * Routes voice messages to the main session for cross-channel context
 */
export class VoiceSessionManager {
  private runtime: RuntimeEnv;
  private sessionKey: string;
  private agentId: string;

  constructor(params: { runtime: RuntimeEnv; sessionKey?: string; agentId?: string }) {
    this.runtime = params.runtime;
    this.sessionKey = params.sessionKey || "main";
    this.agentId = params.agentId || "main";
  }

  /**
   * Initialize voice session
   * Routes to main session for shared context with other channels (TUI, Telegram, etc.)
   */
  async initialize(): Promise<void> {
    log.info(`Voice routing to session: ${this.sessionKey}`);

    // TODO: Integrate with runtime.sessions API
    // For Phase 2, we'll use a simple approach
    // In Phase 3, integrate with full session management

    log.info("✓ Voice session routing ready");
  }

  /**
   * Send voice message to agent session
   */
  async sendMessage(message: VoiceMessage): Promise<VoiceResponse | null> {
    try {
      log.info(`Sending voice message: "${message.transcript}"`);

      // TODO: Integrate with OpenClaw session system
      // For now, return mock response
      // In Phase 3, route through runtime.sessions

      // Simulate processing delay
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const mockResponse: VoiceResponse = {
        text: `This is a mock response to: "${message.transcript}"`,
        timestamp: new Date(),
      };

      log.info(`Received response: "${mockResponse.text}"`);

      return mockResponse;
    } catch (err) {
      log.error("Error sending voice message:", err);
      return null;
    }
  }

  /**
   * Cleanup session
   */
  async cleanup(): Promise<void> {
    log.info("Cleaning up voice session");
    // TODO: Close session if needed
  }
}

/**
 * Create voice session manager
 */
export function createVoiceSessionManager(params: {
  runtime: RuntimeEnv;
  sessionKey?: string;
  agentId?: string;
}): VoiceSessionManager {
  return new VoiceSessionManager(params);
}
