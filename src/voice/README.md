# Voice Channel - OpenClaw Integration

**Status:** Phase 1 - Minimal Proof of Concept  
**Branch:** `feature/voice-channel`

## Overview

Voice channel for OpenClaw, enabling hands-free voice interaction with full conversation context, memory access, and tool availability.

## Current Implementation (Phase 1)

**Phase 1 Goal:** Basic structure and hardware abstraction without real hardware or session integration.

**Implemented:**
- ✅ Hardware abstraction interface (`VoiceHardware`)
- ✅ Mock hardware implementation for testing
- ✅ Configuration schema with defaults
- ✅ Basic voice bot initialization
- ✅ Hardware event handlers (PTT, encoder)
- ✅ Display state management
- ✅ Unit tests

**Not Yet Implemented:**
- ❌ Real Pi hardware (GPIO, SPI, audio)
- ❌ Session routing and message dispatch
- ❌ STT integration (Deepgram)
- ❌ TTS integration (Chatterbox)
- ❌ OLED rendering
- ❌ Gateway integration

## File Structure

```
src/voice/
├── voice-bot.ts              # Main bot initialization
├── voice-bot.test.ts         # Unit tests
├── voice-config.ts           # Configuration types and defaults
├── test-standalone.ts        # Standalone test script
├── README.md                 # This file
│
├── hardware/
│   ├── types.ts              # Hardware abstraction interface
│   └── mock-hardware.ts      # Mock implementation for testing
│
├── ui/                       # (not yet implemented)
├── services/                 # (not yet implemented)
```

## Testing

### Unit Tests

```bash
npm test -- src/voice/voice-bot.test.ts
```

### Standalone Test

```bash
npx tsx src/voice/test-standalone.ts
```

Expected output:
```
=== Voice Bot Phase 1 Test ===

[MockHardware] Initialized
[voice-bot] Starting voice bot...
[voice-bot] Using mock hardware (no physical Pi required)
[MockHardware] PTT callback registered
[MockHardware] Encoder rotate callback registered
[MockHardware] Encoder press callback registered
[MockHardware] Display updated: home
[voice-bot] ✓ Voice bot ready

=== Simulating PTT interaction ===

User presses PTT button...
[voice-bot] PTT button pressed - start recording
[MockHardware] Display updated: voice
  Content: { voiceState: 'listening' }

User releases PTT button...
[voice-bot] PTT button released - process recording
[MockHardware] Display updated: voice
  Content: { voiceState: 'transcribing' }
[MockHardware] Display updated: voice
  Content: { voiceState: 'thinking', text: 'Test query (mock)' }
[MockHardware] Display updated: voice
  Content: { voiceState: 'response', response: 'This is a test response...' }
[MockHardware] Display updated: home

...

✓ Phase 1 test complete!
```

## Configuration

### Example Config

```json
{
  "voice": {
    "enabled": true,
    "useMockHardware": true,
    "hardware": {
      "oled": {
        "dc": 17,
        "rst": 27,
        "width": 128,
        "height": 64
      },
      "encoder": {
        "clk": 5,
        "dt": 6,
        "sw": 26
      },
      "pttButton": 23
    },
    "audio": {
      "device": "plughw:3,0",
      "rate": 16000
    },
    "services": {
      "deepgram": {
        "apiKey": "YOUR_KEY",
        "model": "nova-2"
      },
      "chatterbox": {
        "url": "http://100.114.0.61:4123",
        "voiceSample": "/mnt/ssd/cyclops-workspace/cy-voice-sample.wav"
      }
    },
    "ui": {
      "ackDelay": 500,
      "returnHomeDelay": 5000,
      "ackDir": "/mnt/ssd/cyclops-workspace/voice-acks"
    }
  }
}
```

## Hardware Interface

The `VoiceHardware` interface abstracts all hardware operations:

```typescript
export interface VoiceHardware {
  // Audio
  recordAudio(): Promise<Buffer>;
  playAudio(buffer: Buffer): Promise<void>;

  // Display
  updateDisplay(screen: ScreenState): void;

  // Input
  onPushToTalk(callback: (pressed: boolean) => void): void;
  onEncoderRotate(callback: (delta: number) => void): void;
  onEncoderPress(callback: () => void): void;

  // Lifecycle
  initialize(): Promise<boolean>;
  cleanup(): Promise<void>;
}
```

Implementations:
- **MockVoiceHardware** - Console-based simulation (current)
- **PiHardware** - Real GPIO/SPI/audio (Phase 2)

## Display States

```typescript
type ScreenState = {
  type: "home" | "voice" | "menu" | "status";
  content?: {
    voiceState?: "idle" | "listening" | "transcribing" | "thinking" | "response";
    text?: string;
    response?: string;
  };
};
```

## Next Steps (Phase 2)

1. Implement real Pi hardware:
   - GPIO handling for buttons/encoder
   - SPI driver for OLED
   - Audio recording/playback

2. Session integration:
   - Create/manage voice session
   - Route messages to agent
   - Handle responses

3. Service integration:
   - Deepgram STT
   - Chatterbox TTS

4. OLED rendering:
   - Port display code from Python
   - Implement screen layouts

## Development Workflow

### 1. Local Testing (no Pi)
```bash
# Run with mock hardware
npx tsx src/voice/test-standalone.ts
```

### 2. Pi Testing
```bash
# Build
npm run build

# Copy to Pi
rsync -av dist/ cyclops@100.107.25.51:/opt/openclaw/

# Run standalone
ssh cyclops@100.107.25.51
sudo node /opt/openclaw/dist/voice/test-standalone.js
```

### 3. Gateway Integration
```bash
# Enable in config
openclaw gateway start
```

## Architecture Notes

### Why TypeScript?

- Consistent with OpenClaw codebase
- Better type safety for complex hardware interactions
- Easier testing with mock interfaces
- Cleaner integration with session management

### Why Hardware Abstraction?

- Testable without physical hardware
- Supports future hardware variations
- Clean separation of concerns
- Easier to debug and maintain

### Why Not Python Bridge?

- Simpler architecture (no IPC overhead)
- Better error handling
- Integrated logging
- Native async/await support

---

**Created:** 2026-03-08  
**Author:** Cyclops (with Anthony)  
**Status:** Phase 1 complete, ready for Phase 2
