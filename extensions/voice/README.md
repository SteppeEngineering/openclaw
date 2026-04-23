# OpenClaw Voice Channel Plugin

Physical voice interface for OpenClaw using Raspberry Pi hardware.

**Status:** ✅ Ready for deployment (Phase 2 complete)  
**Version:** 0.1.0  
**Platform:** Raspberry Pi 5

---

## Overview

The Voice Channel turns your Raspberry Pi into a voice-controlled AI assistant with:

- **Push-to-talk** button interface (no wake word)
- **OLED display** for status and feedback
- **Voice cloning** using custom voice samples
- **OpenClaw integration** for full tool access
- **Privacy-first** local processing (except STT)

---

## Features

### Hardware
- ✅ GPIO button input (push-to-talk)
- ✅ Rotary encoder (volume control)
- ✅ SSD1306 OLED display (128x64, I2C)
- ✅ USB audio device (microphone + speaker)
- ✅ Mock hardware mode for development

### Services
- ✅ Deepgram Nova-3 STT (speech-to-text)
- ✅ Chatterbox TTS (voice cloning)
- ✅ Automatic memory management (TTS)
- ✅ Exponential backoff retry logic
- ✅ Audio format conversion (WAV ↔ Opus)

### Integration
- ✅ OpenClaw channel plugin
- ✅ Persistent session (`voice:main`)
- ✅ Voice-optimized personality (Cyclops)
- ✅ Tool access (all OpenClaw features)
- ✅ Context-aware multi-turn conversations

---

## Quick Start

### Prerequisites
- Raspberry Pi 5 with assembled hardware
- Node.js v22.22.0+
- OpenClaw Gateway installed
- Deepgram API key

### Installation
```bash
# 1. Navigate to OpenClaw repository
cd /mnt/ssd/cyclops-workspace/projects/shopclaw/openclaw

# 2. Build TypeScript
npm install
npm run build

# 3. Configure voice channel
# Edit ~/.openclaw/config.json (see Configuration section)

# 4. Set environment
export DEEPGRAM_API_KEY="your-api-key-here"

# 5. Start gateway
systemctl --user start openclaw-gateway

# 6. Test voice interface
# Press PTT button, speak, release
```

### First Test
```
Press button → Say "What is the CPU temperature?" → Release button → Listen
```

---

## Documentation

Comprehensive documentation is available in this directory:

| Document | Description |
|----------|-------------|
| **[BUILD.md](BUILD.md)** | Build instructions, dependencies, hardware setup |
| **[PERSONALITY.md](PERSONALITY.md)** | Voice session configuration, personality tuning |
| **[TESTING.md](TESTING.md)** | Integration test plan with 28 test scenarios |
| **[SERVICE.md](SERVICE.md)** | Systemd service setup, auto-start configuration |
| **[USER-GUIDE.md](USER-GUIDE.md)** | End-user guide, troubleshooting, FAQ |

**Start here:** [BUILD.md](BUILD.md) → [PERSONALITY.md](PERSONALITY.md) → [SERVICE.md](SERVICE.md)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    OpenClaw Gateway                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │           Voice Channel Plugin                        │  │
│  │  (extensions/voice/)                                  │  │
│  │                                                        │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐           │  │
│  │  │ channel  │  │ runtime  │  │ hardware │           │  │
│  │  │  .ts     │  │  .ts     │  │ factory  │           │  │
│  │  └──────────┘  └──────────┘  └──────────┘           │  │
│  └──────────────────────────────────────────────────────┘  │
│                        ↓                                     │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              VoiceBot (src/voice/)                    │  │
│  │                                                        │  │
│  │  ┌────────────┐  ┌────────────┐  ┌──────────────┐   │  │
│  │  │  hardware  │  │  services  │  │  ui/display  │   │  │
│  │  │  (GPIO)    │  │ (STT/TTS)  │  │   (OLED)     │   │  │
│  │  └────────────┘  └────────────┘  └──────────────┘   │  │
│  │                                                        │  │
│  │  ┌────────────────────────────────────────────────┐  │  │
│  │  │        voice-message-dispatch.ts               │  │  │
│  │  │  (Routes messages to OpenClaw session)         │  │  │
│  │  └────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────┘  │
│                        ↓                                     │
│  ┌──────────────────────────────────────────────────────┐  │
│  │         OpenClaw Session Manager                      │  │
│  │         (voice:main session)                          │  │
│  │                                                        │  │
│  │  ┌──────────────────────────────────────────────┐    │  │
│  │  │  Cyclops Personality (SOUL.md)               │    │  │
│  │  │  - Jarvis + Jeeves fusion                    │    │  │
│  │  │  - Voice mode: 2-sentence max                │    │  │
│  │  │  - Direct answers, no preamble               │    │  │
│  │  └──────────────────────────────────────────────┘    │  │
│  │                                                        │  │
│  │  ┌──────────────────────────────────────────────┐    │  │
│  │  │  Model: anthropic/claude-sonnet-4-5          │    │  │
│  │  │  Thinking: low                               │    │  │
│  │  │  Tools: All OpenClaw tools available         │    │  │
│  │  └──────────────────────────────────────────────┘    │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## Configuration

### Minimal Config
```json
{
  "channels": {
    "voice": {
      "enabled": true,
      "accounts": [
        {
          "id": "pi-voice-main",
          "hardware": {
            "mockMode": false,
            "gpio": {
              "pttButton": 17,
              "encoderA": 22,
              "encoderB": 27
            },
            "i2c": {
              "bus": 1,
              "oledAddress": "0x3C"
            },
            "audio": {
              "device": "default",
              "sampleRate": 16000
            }
          },
          "services": {
            "deepgram": {
              "apiKey": "${DEEPGRAM_API_KEY}",
              "model": "nova-3"
            },
            "chatterbox": {
              "endpoint": "http://100.114.0.61:4123",
              "voiceSamplePath": "/mnt/ssd/cyclops-workspace/cy-voice-sample.wav"
            }
          }
        }
      ]
    }
  },
  "sessions": {
    "voice:main": {
      "agentId": "main",
      "model": "anthropic/claude-sonnet-4-5",
      "thinking": "low",
      "workspace": "/mnt/ssd/cyclops-workspace",
      "contextFiles": ["SOUL.md", "USER.md", "AGENTS.md", "TOOLS.md"]
    }
  }
}
```

See [PERSONALITY.md](PERSONALITY.md) for full session configuration.

---

## Hardware Requirements

### Components
- Raspberry Pi 5 (4GB+ RAM recommended)
- USB audio device (Jabra Speak 410 or compatible)
- SSD1306 OLED display (128x64, I2C, 0x3C address)
- Momentary push button (PTT)
- Rotary encoder (optional, for volume control)
- Jumper wires, breadboard (or PCB)

### GPIO Pin Mapping (BCM numbering)
```
PTT Button:  GPIO 17 (Pin 11) → GND
Encoder A:   GPIO 22 (Pin 15)
Encoder B:   GPIO 27 (Pin 13)
OLED SDA:    GPIO 2  (Pin 3)
OLED SCL:    GPIO 3  (Pin 5)
```

### Wiring Diagram
See [BUILD.md](BUILD.md) for detailed wiring instructions.

---

## API Reference

### VoiceChannel Plugin

```typescript
import { VoiceChannel } from './src/channel.js';
import { createHardware } from './src/hardware-factory.js';

const channel = new VoiceChannel();

// Plugin metadata
channel.id        // 'voice'
channel.meta      // { label: 'Voice', icon: '🎤', ... }

// Start voice bot
await channel.gateway.startAccount(runtime, accountConfig);

// Stop voice bot
await channel.gateway.stopAccount(runtime, accountId);
```

### VoiceBot

```typescript
import { VoiceBot } from '../voice/voice-bot.js';

const bot = new VoiceBot(config, hardware);

// Start listening
await bot.start();

// Stop and cleanup
await bot.stop();
```

### Services

```typescript
import { createDeepgramService, createChatterboxService } from '../voice/services/index.js';

// STT
const deepgram = createDeepgramService(config);
const result = await deepgram.transcribe(audioBuffer);

// TTS
const chatterbox = createChatterboxService(config);
const audioBuffer = await chatterbox.generateSpeech({
  text: "Hello, sir.",
  format: "opus"
});
```

---

## Development

### Mock Hardware Mode
For development without physical hardware:

```json
{
  "channels": {
    "voice": {
      "accounts": [{
        "hardware": {
          "mockMode": true
        }
      }]
    }
  }
}
```

This enables:
- Simulated GPIO (console logs)
- Virtual OLED (console output)
- Test audio (generates sine wave)

### Testing
```bash
# Run unit tests
npm test -- voice

# Run integration tests (requires hardware)
# See TESTING.md for detailed test plan

# Test services individually
node dist/voice/services/example.js transcribe
node dist/voice/services/example.js tts
```

---

## Deployment

### Production Deployment
```bash
# 1. Build
npm run build

# 2. Install systemd service
cp extensions/voice/openclaw-gateway.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable openclaw-gateway

# 3. Enable auto-start on boot
sudo loginctl enable-linger cyclops

# 4. Start service
systemctl --user start openclaw-gateway

# 5. Verify
systemctl --user status openclaw-gateway
journalctl --user -u openclaw-gateway -f
```

See [SERVICE.md](SERVICE.md) for complete systemd setup.

---

## Performance

### Typical Latency (Pi 5)
- **STT (Deepgram):** ~1-2 seconds
- **Agent processing:** ~1-3 seconds
- **TTS (Chatterbox):** ~2-3 seconds
- **Total (press to audio):** ~6-10 seconds

### Optimization Tips
- Use `claude-haiku-4` for faster responses
- Lower `thinking` to `off` or `low`
- Local STT (Whisper) for offline operation
- Pre-cache common responses

See [TESTING.md](TESTING.md) for detailed benchmarks.

---

## Troubleshooting

### Quick Diagnostics
```bash
# Check service
systemctl --user status openclaw-gateway

# View logs
journalctl --user -u openclaw-gateway -f

# Test hardware
sudo i2cdetect -y 1  # OLED should appear at 0x3C
gpioinfo | grep 17   # PTT button
arecord -l           # Audio input
aplay -l             # Audio output

# Test services
curl -s http://100.114.0.61:4123/health  # Chatterbox
```

### Common Issues
See [USER-GUIDE.md](USER-GUIDE.md#troubleshooting) for detailed troubleshooting.

---

## Roadmap

### Planned Features
- [ ] Wake word support ("Hey Cyclops")
- [ ] Local STT (Whisper integration)
- [ ] Multi-language support
- [ ] Voice activity detection (VAD)
- [ ] Custom wake word training
- [ ] Voice biometrics (speaker identification)
- [ ] Streaming STT/TTS (lower latency)
- [ ] Offline mode (full local processing)

### Contributing
Contributions welcome! See `CONTRIBUTING.md` in main repo.

---

## License

Same as OpenClaw main repository.

---

## Credits

**Voice Channel Implementation:**
- Phase 1: Voice channel structure
- Phase 2: OpenClaw integration
- Agent: phase2-deploy (subagent)

**Technologies:**
- [Deepgram Nova-3](https://deepgram.com) - Speech-to-text
- [Chatterbox](https://github.com/rsxdalv/tts-generation-webui) - Voice cloning
- [OpenClaw](https://github.com/openclaw/openclaw) - Agent runtime
- [node-gpiod](https://github.com/somebox/node-gpiod) - GPIO access
- [spi-device](https://github.com/fivdi/spi-device) - I2C/SPI

**Inspiration:**
- Jarvis (Iron Man)
- Jeeves (P.G. Wodehouse)
- HAL 9000 (2001: A Space Odyssey)

---

## Support

- **Documentation:** This directory (BUILD.md, USER-GUIDE.md, etc.)
- **Issues:** [GitHub Issues](https://github.com/openclaw/openclaw/issues)
- **Community:** [Discord](https://discord.gg/openclaw)

---

**Voice Channel Status:** ✅ Production Ready  
**Last Updated:** 2026-04-19  
**Version:** 0.1.0
