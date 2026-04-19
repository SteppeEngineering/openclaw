/**
 * Voice Channel Plugin
 * 
 * Integrates ShopClaw voice hardware with OpenClaw gateway.
 * Implements the ChannelPlugin interface for voice assistant hardware.
 */

import type {
  ChannelPlugin,
  OpenClawConfig,
  ChannelGatewayContext,
} from "openclaw/plugin-sdk";
import { DEFAULT_ACCOUNT_ID } from "openclaw/plugin-sdk";
import type { VoiceChannelConfig } from "openclaw/dist/config/types.voice.js";
import { getVoiceRuntime } from "./runtime.js";

/**
 * Resolved voice account configuration
 */
export type ResolvedVoiceAccount = {
  accountId: string;
  enabled: boolean;
  config: VoiceChannelConfig;
};

/**
 * Resolve voice channel configuration from OpenClaw config
 */
function resolveVoiceAccount(params: {
  cfg: OpenClawConfig;
  accountId?: string | null;
}): ResolvedVoiceAccount {
  const { cfg } = params;
  const config = cfg.channels?.voice ?? {};
  
  return {
    accountId: DEFAULT_ACCOUNT_ID,
    enabled: config.enabled ?? false,
    config,
  };
}

/**
 * Voice channel plugin
 * 
 * This plugin:
 * - Registers voice as a channel in OpenClaw
 * - Starts VoiceBot on gateway startup
 * - Routes voice messages through session manager
 * - Delivers agent responses via TTS
 */
export const voicePlugin: ChannelPlugin<ResolvedVoiceAccount> = {
  id: "voice",
  meta: {
    label: "Voice",
    icon: "🎤",
    description: "Hardware voice assistant (Raspberry Pi)",
    order: 100, // Load after standard channels
  },
  capabilities: {
    chatTypes: ["direct"], // Voice is always direct (single user)
    reactions: false,
    threads: false,
    media: false,
    nativeCommands: false,
    blockStreaming: false, // Could support streaming TTS in future
  },
  reload: { configPrefixes: ["channels.voice"] },
  
  // Configuration adapter
  config: {
    listAccountIds: () => [DEFAULT_ACCOUNT_ID], // Voice is always single-account
    
    resolveAccount: (cfg, accountId) => resolveVoiceAccount({ cfg, accountId }),
    
    defaultAccountId: () => DEFAULT_ACCOUNT_ID,
    
    isEnabled: (account) => account.enabled,
    
    isConfigured: async (account) => {
      // Voice is configured if:
      // 1. Enabled flag is true
      // 2. Service endpoints are configured
      const cfg = account.config;
      
      if (!cfg || !cfg.enabled) {
        return false;
      }
      
      // Check Deepgram API key (required for STT)
      const hasDeepgramKey = Boolean(
        cfg.services?.deepgram?.apiKey || process.env.DEEPGRAM_API_KEY
      );
      
      // Check Chatterbox endpoint (required for TTS)
      const hasChatterbox = Boolean(cfg.services?.chatterbox?.baseUrl);
      
      return hasDeepgramKey && hasChatterbox;
    },
    
    unconfiguredReason: (account) => {
      const cfg = account.config;
      
      if (!cfg?.enabled) {
        return "Voice channel not enabled in config";
      }
      
      const hasDeepgramKey = Boolean(
        cfg.services?.deepgram?.apiKey || process.env.DEEPGRAM_API_KEY
      );
      
      const hasChatterbox = Boolean(cfg.services?.chatterbox?.baseUrl);
      
      if (!hasDeepgramKey) {
        return "Deepgram API key not configured (set DEEPGRAM_API_KEY or channels.voice.services.deepgram.apiKey)";
      }
      
      if (!hasChatterbox) {
        return "Chatterbox TTS endpoint not configured (set channels.voice.services.chatterbox.baseUrl)";
      }
      
      return "Voice channel configuration incomplete";
    },
    
    describeAccount: (account) => ({
      accountId: account.accountId,
      enabled: account.enabled,
      configured: Boolean(
        account.config?.enabled &&
        (account.config.services?.deepgram?.apiKey || process.env.DEEPGRAM_API_KEY) &&
        account.config.services?.chatterbox?.baseUrl
      ),
    }),
  },
  
  // Status adapter
  status: {
    defaultRuntime: {
      accountId: DEFAULT_ACCOUNT_ID,
      running: false,
      lastStartAt: null,
      lastStopAt: null,
      lastError: null,
    },
    
    buildChannelSummary: ({ snapshot }) => ({
      running: snapshot.running ?? false,
      hardwareType: snapshot.hardwareType ?? "unknown",
      lastStartAt: snapshot.lastStartAt ?? null,
      lastStopAt: snapshot.lastStopAt ?? null,
      lastError: snapshot.lastError ?? null,
    }),
  },
  
  // Gateway adapter - this is where the magic happens
  gateway: {
    /**
     * Start voice bot account
     * 
     * This is called by the OpenClaw gateway when:
     * - Gateway starts up (if voice.enabled = true)
     * - Voice channel is manually started via CLI
     */
    startAccount: async (ctx: ChannelGatewayContext<ResolvedVoiceAccount>) => {
      const { cfg, account, log, abortSignal, setStatus } = ctx;
      
      log?.info?.("[voice] Starting voice bot...");
      
      setStatus({
        accountId: DEFAULT_ACCOUNT_ID,
        running: true,
        lastStartAt: Date.now(),
        lastError: null,
      });
      
      try {
        // Import voice bot implementation
        const { VoiceBot } = await import("../../../dist/voice/voice-bot.js");
        const { createHardwareFactory } = await import("./hardware-factory.js");
        
        // Create voice bot instance with runtime integration
        const voiceBot = new VoiceBot({
          config: account.config,
          hardwareFactory: createHardwareFactory(cfg),
          debug: true, // Enable debug logging in gateway mode
        });
        
        // Start the bot
        await voiceBot.start();
        
        log?.info?.("[voice] Voice bot started successfully");
        
        setStatus({
          accountId: DEFAULT_ACCOUNT_ID,
          running: true,
          hardwareType: "pi5", // TODO: Get from hardware status
        });
        
        // Wait for abort signal (shutdown)
        await new Promise<void>((resolve, reject) => {
          if (abortSignal.aborted) {
            resolve();
            return;
          }
          
          abortSignal.addEventListener("abort", () => resolve(), { once: true });
          
          // Also handle bot shutdown
          voiceBot.onShutdown(async () => {
            log?.info?.("[voice] Voice bot shutdown requested");
            resolve();
          });
        });
        
        // Clean shutdown
        log?.info?.("[voice] Stopping voice bot...");
        await voiceBot.stop();
        
        setStatus({
          accountId: DEFAULT_ACCOUNT_ID,
          running: false,
          lastStopAt: Date.now(),
        });
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        log?.error?.(`[voice] Voice bot failed: ${errorMessage}`);
        
        setStatus({
          accountId: DEFAULT_ACCOUNT_ID,
          running: false,
          lastError: errorMessage,
          lastStopAt: Date.now(),
        });
        
        throw error;
      }
    },
    
    /**
     * Stop voice bot account
     * 
     * This is called when:
     * - Gateway is shutting down
     * - Voice channel is manually stopped via CLI
     * - Config reload requires restart
     */
    stopAccount: async (ctx) => {
      const { log } = ctx;
      
      log?.info?.("[voice] Stop requested (handled via abort signal)");
      
      // Actual stop is handled by abort signal in startAccount
      // Just log here for visibility
    },
  },
};
