/**
 * Voice channel bot - main entry point
 * Handles hardware initialization and message routing
 */

import { getChildLogger } from "../logging.js";
import type { RuntimeEnv } from "../runtime.js";
import { MockVoiceHardware } from "./hardware/mock-hardware.js";
import { PiHardware } from "./hardware/pi-hardware.js";
import type { VoiceHardware } from "./hardware/types.js";
import { createWavBuffer, transcribeAudio } from "./services/deepgram.js";
import { generateSpeech } from "./services/chatterbox.js";
import { createVoiceSessionManager, type VoiceSessionManager } from "./voice-message-dispatch.js";
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
  private sessionManager?: VoiceSessionManager;
  private isRunning = false;
  private recordingBuffer: Buffer[] = [];

  constructor(opts: VoiceBotOptions = {}) {
    this.config = resolveVoiceConfig(opts.config);
    this.runtime = opts.runtime;

    // Use provided hardware or create based on config
    if (opts.hardware) {
      this.hardware = opts.hardware;
    } else if (this.config.useMockHardware) {
      log.info("Using mock hardware (no physical Pi required)");
      this.hardware = new MockVoiceHardware();
    } else {
      log.info("Using real Pi hardware");
      this.hardware = new PiHardware({
        gpio: {
          pttButton: this.config.hardware.pttButton,
          encoderClk: this.config.hardware.encoder.clk,
          encoderDt: this.config.hardware.encoder.dt,
          encoderSw: this.config.hardware.encoder.sw,
          oledDc: this.config.hardware.oled.dc,
          oledRst: this.config.hardware.oled.rst,
        },
        spi: {
          bus: 0,
          device: 0,
        },
        audio: {
          device: this.config.audio.device,
          rate: this.config.audio.rate,
          chunkSize: this.config.audio.chunkSize,
        },
        display: {
          width: this.config.hardware.oled.width,
          height: this.config.hardware.oled.height,
        },
      });
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

    // Initialize session manager
    if (this.runtime) {
      this.sessionManager = createVoiceSessionManager({
        runtime: this.runtime,
        sessionKey: "main",
        agentId: "main",
      });
      await this.sessionManager.initialize();
    } else {
      log.warn("No runtime provided, voice messages will not be routed to agent");
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

    // Cleanup session manager
    if (this.sessionManager) {
      await this.sessionManager.cleanup();
    }

    // Cleanup hardware
    await this.hardware.cleanup();

    log.info("Voice bot stopped");
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
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

    try {
      // Get recorded audio
      const audioBuffer = await this.hardware.recordAudio();

      if (audioBuffer.length === 0) {
        log.warn("No audio recorded");
        this.hardware.updateDisplay({ type: "home" });
        return;
      }

      // Transcribe audio
      this.hardware.updateDisplay({
        type: "voice",
        content: { voiceState: "transcribing" },
      });

      const deepgramConfig = {
        apiKey: this.config.services.deepgram.apiKey,
        model: this.config.services.deepgram.model,
      };

      // Convert PCM to WAV if needed
      const wavBuffer = createWavBuffer(audioBuffer, this.config.audio.rate);
      const transcription = await transcribeAudio(wavBuffer, deepgramConfig);

      if (!transcription || !transcription.transcript) {
        log.warn("Transcription failed or empty");
        this.hardware.updateDisplay({ type: "home" });
        return;
      }

      log.info(`Transcribed: "${transcription.transcript}"`);

      // Pause before ack (natural timing)
      await this.sleep(this.config.ui.ackDelay);

      // TODO: Play acknowledgment audio

      // Send to agent session
      this.hardware.updateDisplay({
        type: "voice",
        content: {
          voiceState: "thinking",
          text: transcription.transcript,
        },
      });

      const response = this.sessionManager
        ? await this.sessionManager.sendMessage({
            transcript: transcription.transcript,
            confidence: transcription.confidence,
            timestamp: new Date(),
          })
        : null;

      if (!response) {
        log.warn("No response from agent");
        this.hardware.updateDisplay({ type: "home" });
        return;
      }

      // Generate TTS
      this.hardware.updateDisplay({
        type: "voice",
        content: {
          voiceState: "response",
          response: response.text,
        },
      });

      const chatterboxConfig = {
        url: this.config.services.chatterbox.url,
        voiceSample: this.config.services.chatterbox.voiceSample,
        exaggeration: this.config.services.chatterbox.exaggeration,
        cfgWeight: this.config.services.chatterbox.cfgWeight,
        temperature: this.config.services.chatterbox.temperature,
      };

      const audioResponse = await generateSpeech(response.text, chatterboxConfig);

      if (audioResponse) {
        // Play audio response
        await this.hardware.playAudio(audioResponse);
      }

      // Return to home after delay
      await this.sleep(this.config.ui.returnHomeDelay);
      this.hardware.updateDisplay({ type: "home" });
    } catch (err) {
      log.error("Error processing voice query:", err);
      this.hardware.updateDisplay({ type: "home" });
    }
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
