/**
 * Hardware Factory for Voice Channel
 * 
 * Creates appropriate hardware implementation based on:
 * - Runtime environment (production Pi vs development)
 * - Configuration settings
 * - Hardware availability
 */

import type { OpenClawConfig } from "openclaw/plugin-sdk";
import type { VoiceConfig } from "openclaw/dist/voice/voice-config.js";
import type { VoiceHardware } from "openclaw/dist/voice/hardware/types.js";

/**
 * Detect if running on Raspberry Pi
 */
function isRaspberryPi(): boolean {
  try {
    const fs = require("fs");
    const cpuinfo = fs.readFileSync("/proc/cpuinfo", "utf8");
    return cpuinfo.includes("Raspberry Pi");
  } catch {
    return false;
  }
}

/**
 * Create hardware factory function
 * 
 * Returns a function that creates the appropriate VoiceHardware implementation:
 * - Real Pi hardware when running on Raspberry Pi
 * - Mock hardware for testing/development
 * 
 * @param cfg - OpenClaw configuration (for future hardware selection logic)
 * @returns Hardware factory function
 */
export function createHardwareFactory(cfg: OpenClawConfig) {
  return async (voiceConfig: VoiceConfig): Promise<VoiceHardware> => {
    const isPi = isRaspberryPi();
    
    if (isPi) {
      console.log("[HardwareFactory] Detected Raspberry Pi - using real hardware");
      
      try {
        // Try to load Pi hardware implementation
        const { createPiHardware } = await import("openclaw/dist/voice/hardware/pi-hardware.js");
        return await createPiHardware(voiceConfig);
      } catch (error) {
        console.error("[HardwareFactory] Failed to load Pi hardware:", error);
        console.warn("[HardwareFactory] Falling back to mock hardware");
        
        // Fall back to mock if Pi hardware not available
        const { createMockHardware } = await import("openclaw/dist/voice/hardware/mock-hardware.js");
        return await createMockHardware();
      }
    } else {
      console.log("[HardwareFactory] Not on Raspberry Pi - using mock hardware");
      
      // Use mock hardware for development/testing
      const { createMockHardware } = await import("openclaw/dist/voice/hardware/mock-hardware.js");
      return await createMockHardware();
    }
  };
}
