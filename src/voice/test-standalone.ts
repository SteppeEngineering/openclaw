/**
 * Standalone test script for voice bot Phase 1
 * Run with: npx tsx src/voice/test-standalone.ts
 */

import { MockVoiceHardware } from "./hardware/mock-hardware.js";
import { createVoiceBot } from "./voice-bot.js";

async function main() {
  console.log("=== Voice Bot Phase 1 Test ===\n");

  // Create mock hardware
  const hardware = new MockVoiceHardware();

  // Create bot with mock hardware
  const bot = await createVoiceBot({
    config: {
      enabled: true,
      useMockHardware: true,
    },
    hardware,
  });

  console.log("\n=== Simulating PTT interaction ===\n");

  // Simulate user pressing PTT button
  console.log("User presses PTT button...");
  hardware.simulatePTT(true);

  // Wait a bit (simulating user speaking)
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Simulate user releasing PTT button
  console.log("User releases PTT button...");
  hardware.simulatePTT(false);

  // Wait for simulated processing
  await new Promise((resolve) => setTimeout(resolve, 8000));

  console.log("\n=== Simulating encoder interaction ===\n");

  console.log("User rotates encoder clockwise...");
  hardware.simulateEncoderRotate(1);

  console.log("User rotates encoder counter-clockwise...");
  hardware.simulateEncoderRotate(-1);

  console.log("User presses encoder button...");
  hardware.simulateEncoderPress();

  // Cleanup
  console.log("\n=== Cleaning up ===\n");
  await bot.stop();

  console.log("✓ Phase 1 test complete!");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
