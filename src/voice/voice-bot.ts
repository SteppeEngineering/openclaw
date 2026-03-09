/**
 * Voice channel bot - main entry point
 * Handles hardware initialization and message routing
 */

import { getChildLogger } from "../logging.js";
import type { RuntimeEnv } from "../runtime.js";
import { MockVoiceHardware } from "./hardware/mock-hardware.js";
import type { VoiceHardware } from "./hardware/types.js";
import { DEFAULT_VOICE_CONFIG, resolveVoiceConfig, type VoiceChannelConfig } from "./voice-config.js";

const log = getChildLogger("voice-bot");

export type VoiceBotOptions = {
  config?: VoiceChannelConfig;
  runtime?: RuntimeEnv;
  hardware?: VoiceHardware;
};

export class VoiceBot {
  private config: Required<VoiceChannelConfig>;
  private runtime?: RuntimeEnv;
  private hardware: VoiceHardware;
  private isRunning = false;

  constructor(opts: VoiceBotOptions = {}) {
    this.config = resolveVoiceConfig(opts.config);
    this.runtime = opts.runtime;

    // Use provided hardware or create mock
    if (opts.hardware) {
      this.hardware = opts.hardware;
    } else if (this.config.useMockHardware) {
      log.info("Using mock hardware (no physical Pi required)");
      this.hardware = new MockVoiceHardware();
    } else {
      // TODO: Create real PiHardware when implemented
      log.warn("Real Pi hardware not implemented yet, falling back to mock");
      this.hardware = new MockVoiceHardware();
    }
  }

  /**
   * Start the voice bot
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      log.warn("Voice bot already running");
      return;
    }

    log.info("Starting voice bot...");

    // Initialize hardware
    const initialized = await this.hardware.initialize();
    if (!initialized) {
      throw new Error("Failed to initialize voice hardware");
    }

    // Register hardware event handlers
    this.setupHardwareHandlers();

    // Update display to home screen
    this.hardware.updateDisplay({ type: "home" });

    this.isRunning = true;
    log.info("✓ Voice bot ready");
  }

  /**
   * Stop the voice bot
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    log.info("Stopping voice bot...");
    this.isRunning = false;

    // Cleanup hardware
    await this.hardware.cleanup();

    log.info("Voice bot stopped");
  }

  /**
   * Setup hardware event handlers
   */
  private setupHardwareHandlers(): void {
    // Push-to-talk button
    this.hardware.onPushToTalk((pressed) => {
      if (pressed) {
        this.handlePTTPressed();
      } else {
        this.handlePTTReleased();
      }
    });

    // Encoder rotation
    this.hardware.onEncoderRotate((delta) => {
      this.handleEncoderRotate(delta);
    });

    // Encoder button press
    this.hardware.onEncoderPress(() => {
      this.handleEncoderPress();
    });
  }

  /**
   * Handle push-to-talk button press
   */
  private handlePTTPressed(): void {
    log.info("PTT button pressed - start recording");
    this.hardware.updateDisplay({
      type: "voice",
      content: {
        voiceState: "listening",
      },
    });

    // TODO: Start audio recording
  }

  /**
   * Handle push-to-talk button release
   */
  private async handlePTTReleased(): Promise<void> {
    log.info("PTT button released - process recording");
    this.hardware.updateDisplay({
      type: "voice",
      content: {
        voiceState: "transcribing",
      },
    });

    // TODO: Stop recording, transcribe, route to session
    // For now, just demonstrate the flow
    setTimeout(() => {
      this.hardware.updateDisplay({
        type: "voice",
        content: {
          voiceState: "thinking",
          text: "Test query (mock)",
        },
      });

      setTimeout(() => {
        this.hardware.updateDisplay({
          type: "voice",
          content: {
            voiceState: "response",
            response: "This is a test response from the voice bot.",
          },
        });

        // Return to home after delay
        setTimeout(() => {
          this.hardware.updateDisplay({ type: "home" });
        }, this.config.ui.returnHomeDelay);
      }, 2000);
    }, 1000);
  }

  /**
   * Handle encoder rotation
   */
  private handleEncoderRotate(delta: number): void {
    log.debug(`Encoder rotated: ${delta > 0 ? "clockwise" : "counter-clockwise"}`);
    // TODO: Handle menu navigation, response scrolling
  }

  /**
   * Handle encoder button press
   */
  private handleEncoderPress(): void {
    log.debug("Encoder button pressed");
    // TODO: Handle menu selection, screen navigation
  }
}

/**
 * Create and initialize a voice bot instance
 */
export async function createVoiceBot(opts: VoiceBotOptions = {}): Promise<VoiceBot> {
  const bot = new VoiceBot(opts);
  await bot.start();
  return bot;
}
