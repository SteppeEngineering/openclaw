/**
 * Voice bot tests
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { MockVoiceHardware } from "./hardware/mock-hardware.js";
import { VoiceBot } from "./voice-bot.js";

describe("VoiceBot", () => {
  let hardware: MockVoiceHardware;
  let bot: VoiceBot;

  beforeEach(async () => {
    hardware = new MockVoiceHardware();
    bot = new VoiceBot({
      config: { enabled: true, useMockHardware: true },
      hardware,
    });
  });

  afterEach(async () => {
    await bot.stop();
  });

  it("should initialize successfully", async () => {
    await bot.start();
    // Bot should be running and display should show home screen
    const screen = hardware.getCurrentScreen();
    expect(screen?.type).toBe("home");
  });

  it("should handle PTT button press/release", async () => {
    await bot.start();

    // Simulate PTT press
    hardware.simulatePTT(true);
    let screen = hardware.getCurrentScreen();
    expect(screen?.type).toBe("voice");
    expect(screen?.content?.voiceState).toBe("listening");

    // Simulate PTT release
    hardware.simulatePTT(false);
    screen = hardware.getCurrentScreen();
    expect(screen?.type).toBe("voice");
    expect(screen?.content?.voiceState).toBe("transcribing");
  });

  it("should handle encoder rotation", async () => {
    await bot.start();

    // This shouldn't throw
    hardware.simulateEncoderRotate(1);
    hardware.simulateEncoderRotate(-1);
  });

  it("should handle encoder press", async () => {
    await bot.start();

    // This shouldn't throw
    hardware.simulateEncoderPress();
  });
});
