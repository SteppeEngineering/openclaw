# OpenClaw Voice Channel User Guide

**Welcome to the OpenClaw Voice Interface!**

This guide covers everything you need to know about using the physical voice channel on your Raspberry Pi.

---

## Table of Contents

1. [What is the Voice Channel?](#what-is-the-voice-channel)
2. [Quick Start](#quick-start)
3. [Using the Voice Interface](#using-the-voice-interface)
4. [Voice Commands](#voice-commands)
5. [OLED Display](#oled-display)
6. [Troubleshooting](#troubleshooting)
7. [Advanced Configuration](#advanced-configuration)
8. [FAQ](#faq)

---

## What is the Voice Channel?

The Voice Channel is a **physical voice interface** for OpenClaw, turning your Raspberry Pi into a voice-controlled assistant. Think Amazon Echo or Google Home, but:

- **Privacy-first:** Runs locally on your Pi
- **Self-hosted:** No cloud dependency (except Deepgram STT)
- **Customizable:** Full control over personality, responses, tools
- **Offline-capable:** Can work without internet (with local STT/TTS)

### Hardware
- **Raspberry Pi 5** with GPIO, I2C, USB audio
- **OLED display** (128x64, SSD1306) for status
- **Push-to-talk button** for initiating voice queries
- **Rotary encoder** for volume control (optional)
- **USB microphone & speaker** (e.g., Jabra Speak 410)

### Software
- **Deepgram Nova-3** for speech-to-text (STT)
- **Chatterbox TTS** for voice cloning (Cyclops voice)
- **OpenClaw Gateway** for session management and tools
- **Cyclops personality** (Jarvis + Jeeves fusion)

---

## Quick Start

### Prerequisites
1. **Hardware assembled** (see BUILD.md for wiring)
2. **Software installed** (OpenClaw built, dependencies installed)
3. **Service running:** `systemctl --user status openclaw-gateway`

### First Voice Interaction

1. **Check OLED display** — should show "Ready" or "Cyclops"
2. **Press PTT button** — display changes to "Listening..."
3. **Speak your query:** "What is the temperature?"
4. **Release button** — display shows "Processing..."
5. **Listen for response** — audio plays through speaker

**That's it!** You've had your first voice interaction.

---

## Using the Voice Interface

### Push-to-Talk (PTT) Flow

```
Press Button → Speak → Release Button → Listen
```

**Detailed Steps:**
1. **Press and hold** the PTT button (GPIO 17)
2. **Speak clearly** into the microphone
   - Hold microphone ~6 inches from mouth
   - Speak at normal volume
   - Minimize background noise
3. **Release button** when done speaking
4. **Wait for processing** (OLED shows status)
5. **Listen to response** (speaker plays TTS audio)

### Tips for Best Results

**Do:**
- ✅ Speak clearly and naturally
- ✅ Ask direct questions ("What is the CPU temperature?")
- ✅ Wait for response to finish before next query
- ✅ Check OLED for status updates

**Don't:**
- ❌ Speak while button is released (not recording)
- ❌ Release button mid-sentence
- ❌ Shout or whisper (use normal speaking volume)
- ❌ Press button repeatedly (causes queueing)

---

## Voice Commands

### System Queries
```
"What is the CPU temperature?"
"How much memory is being used?"
"What is the disk usage?"
"Is the Jellyfin server running?"
"Show me the uptime."
```

### Network Queries
```
"What is my IP address?"
"Are all Tailscale nodes online?"
"Ping the Mac mini."
```

### Home Automation (if configured)
```
"Turn on the garage lights."
"What is the temperature in the living room?"
"Set the thermostat to 22 degrees."
```

### Weather
```
"What's the weather like?"
"What's the forecast for tomorrow?"
```

### Information
```
"What time is it?"
"What's the date today?"
"Calculate 25 times 17."
```

### Conversational
```
"Good morning."
"Thank you."
"That will be all."
```

### Multi-Turn Conversations
The voice channel maintains context:
```
You:  "What is the garage temperature?"
Cy:   "Garage temperature is twenty-three celsius."
You:  "And the humidity?"
Cy:   "Garage humidity is sixty percent."
```

---

## OLED Display

### Display States

The 128x64 OLED shows current status:

#### 1. Idle / Ready
```
┌──────────────────────────┐
│       CYCLOPS            │
│         🎤               │
│                          │
│   Press to speak         │
└──────────────────────────┘
```
**Meaning:** System ready, waiting for PTT button

---

#### 2. Listening
```
┌──────────────────────────┐
│     LISTENING...         │
│         🔴               │
│                          │
│   Speak now              │
└──────────────────────────┘
```
**Meaning:** Recording audio, speak your query

---

#### 3. Processing
```
┌──────────────────────────┐
│    PROCESSING...         │
│         ⏳               │
│                          │
│   Please wait            │
└──────────────────────────┘
```
**Meaning:** Transcribing, querying agent, generating TTS

---

#### 4. Speaking
```
┌──────────────────────────┐
│     SPEAKING...          │
│         🔊               │
│                          │
│   [==================]   │
└──────────────────────────┘
```
**Meaning:** Playing audio response (progress bar optional)

---

#### 5. Error
```
┌──────────────────────────┐
│       ERROR              │
│         ⚠️               │
│                          │
│   Try again              │
└──────────────────────────┘
```
**Meaning:** Something went wrong, check logs or try again

---

#### 6. Volume Adjustment (Encoder)
```
┌──────────────────────────┐
│       VOLUME             │
│         🔊               │
│                          │
│   [========----]  60%    │
└──────────────────────────┘
```
**Meaning:** Rotary encoder being used to adjust volume

---

### Display Icons
- 🎤 Ready for input
- 🔴 Recording
- ⏳ Processing
- 🔊 Speaking
- ⚠️ Error
- 🔧 Hardware issue

---

## Troubleshooting

### Common Issues

#### 1. No Response to PTT Button
**Symptoms:** Pressing button does nothing, OLED stays on "Ready"

**Possible Causes:**
- Button not wired correctly
- GPIO permissions issue
- Service not running

**Solutions:**
```bash
# Check service status
systemctl --user status openclaw-gateway

# Check GPIO permissions
ls -l /dev/gpiochip0
# Should be readable by user or gpio group

# Test GPIO manually
gpioinfo | grep "line 17"
```

---

#### 2. "Transcription Failed" Error
**Symptoms:** OLED shows error after speaking, no response

**Possible Causes:**
- No internet connection (Deepgram requires network)
- Invalid API key
- Audio too quiet/noisy

**Solutions:**
```bash
# Check network
ping -c 1 api.deepgram.com

# Check API key
echo $DEEPGRAM_API_KEY

# Test microphone
arecord -D default -f S16_LE -r 16000 -c 1 -d 3 /tmp/test.wav
aplay /tmp/test.wav
```

---

#### 3. "Voice Generation Failed" Error
**Symptoms:** Query transcribed, but no audio response

**Possible Causes:**
- Chatterbox server offline
- Network issue to TTS server
- TTS memory error (Errno 22)

**Solutions:**
```bash
# Check Chatterbox server
curl -s http://100.114.0.61:4123/health

# Check service logs
journalctl --user -u openclaw-gateway -n 50 | grep -i "chatterbox"

# Reset TTS memory (if needed)
curl -X POST "http://100.114.0.61:4123/memory/reset?confirm=true"
```

---

#### 4. Response Too Long / Not Voice-Optimized
**Symptoms:** Response is lengthy, verbose, or hard to follow

**Possible Causes:**
- Voice personality not configured
- Session using wrong model
- System prompt missing voice rules

**Solutions:**
```bash
# Check session config
cat /mnt/ssd/cyclops-workspace/.openclaw/config.json | jq '.sessions["voice:main"]'

# Verify SOUL.md loaded
grep -A 5 "Voice Mode" /mnt/ssd/cyclops-workspace/SOUL.md

# Manually reset session
openclaw sessions reset voice:main
```

---

#### 5. OLED Display Blank / Corrupted
**Symptoms:** Display doesn't show anything or shows garbage

**Possible Causes:**
- I2C not enabled
- Wrong I2C address
- Display not wired correctly

**Solutions:**
```bash
# Enable I2C
sudo raspi-config
# Interface Options → I2C → Enable

# Detect I2C devices
sudo i2cdetect -y 1
# Should show device at 0x3C

# Check wiring
# SDA: GPIO 2 (Pin 3)
# SCL: GPIO 3 (Pin 5)
# VCC: 3.3V (Pin 1)
# GND: GND (Pin 6)
```

---

#### 6. Audio Quality Poor
**Symptoms:** Response sounds robotic, distorted, or choppy

**Possible Causes:**
- Low sample rate
- Wrong audio device
- Buffer underrun

**Solutions:**
```bash
# Test audio device
aplay -L

# Set correct device in config
# "audio": { "device": "default", "sampleRate": 16000 }

# Check CPU usage (should be <60%)
top -bn1 | grep node
```

---

#### 7. High Latency (Slow Responses)
**Symptoms:** Long wait between query and response (>15 seconds)

**Possible Causes:**
- Slow network
- Heavy model (e.g., GPT-4)
- CPU overload

**Solutions:**
```bash
# Check network latency
ping -c 5 api.deepgram.com

# Use faster model (Haiku instead of Sonnet)
# Edit config: "model": "anthropic/claude-haiku-4"

# Reduce CPU load
# Close other applications
# Check: htop
```

---

### Error Codes

| Code | Meaning | Solution |
|------|---------|----------|
| `STT_NETWORK_ERROR` | Deepgram unreachable | Check internet, API key |
| `TTS_GENERATION_FAILED` | Chatterbox error | Check TTS server, reset memory |
| `GPIO_ACCESS_DENIED` | Permissions issue | Add user to gpio group |
| `I2C_TIMEOUT` | OLED not responding | Check I2C wiring, enable in raspi-config |
| `AUDIO_DEVICE_NOT_FOUND` | USB audio missing | Plug in device, check `arecord -l` |
| `SESSION_TIMEOUT` | Query took too long | Use faster model, check network |

---

## Advanced Configuration

### Adjusting Voice Personality

Edit `/mnt/ssd/cyclops-workspace/SOUL.md`:

```markdown
## Voice Mode

When responding to voice queries:
- **Maximum 2 sentences** (3 only if critical)
- **NO acknowledgment preamble**
- **Direct answers only**
```

Adjust sentence limit, tone, or style as desired.

---

### Changing Voice Model

Edit `/mnt/ssd/cyclops-workspace/.openclaw/config.json`:

```json
{
  "sessions": {
    "voice:main": {
      "model": "anthropic/claude-haiku-4"
    }
  }
}
```

**Options:**
- `anthropic/claude-haiku-4` — Fastest, cheapest
- `anthropic/claude-sonnet-4-5` — Balanced (default)
- `openai/gpt-4o` — Alternative

Then restart:
```bash
systemctl --user restart openclaw-gateway
```

---

### Custom Voice Sample (TTS)

Replace Cyclops voice with your own:

1. **Record 10-30 second audio sample**
   ```bash
   arecord -D default -f S16_LE -r 16000 -c 1 -d 20 ~/my-voice.wav
   ```

2. **Update config:**
   ```json
   {
     "channels": {
       "voice": {
         "accounts": [{
           "services": {
             "chatterbox": {
               "voiceSamplePath": "/home/cyclops/my-voice.wav"
             }
           }
         }]
       }
     }
   }
   ```

3. **Restart service:**
   ```bash
   systemctl --user restart openclaw-gateway
   ```

---

### Volume Control

**Via Rotary Encoder:**
- Rotate clockwise: Increase volume
- Rotate counter-clockwise: Decrease volume

**Via Config:**
```json
{
  "channels": {
    "voice": {
      "accounts": [{
        "hardware": {
          "audio": {
            "defaultVolume": 75
          }
        }
      }]
    }
  }
}
```

**Via ALSA:**
```bash
alsamixer
# Adjust speaker volume with arrow keys
```

---

### Wake Word (Future Feature)

Currently, the voice channel uses **push-to-talk**. Wake word ("Hey Cyclops") may be added in future versions.

**Interested in wake word?**
- File feature request on GitHub
- Contribute implementation (see CONTRIBUTING.md)

---

## FAQ

### Q: Can I use this without internet?
**A:** Partially. You need internet for Deepgram STT (unless you use local STT like Whisper). TTS can be local if using piper or espeak instead of Chatterbox.

### Q: How do I change the wake word?
**A:** Currently no wake word — it's push-to-talk only. Wake word support planned for future release.

### Q: Can I use this with Google Home/Alexa?
**A:** Not directly. This is a standalone voice interface. You could integrate via custom skills/actions, but that's outside the scope of this guide.

### Q: How do I reset the conversation?
**A:** Say "Reset conversation" (if configured), or run:
```bash
openclaw sessions reset voice:main
```

### Q: Can I disable voice logging?
**A:** Edit config:
```json
{
  "logging": {
    "voice": {
      "level": "error"  // Only log errors
    }
  }
}
```

### Q: How much does Deepgram cost?
**A:** Deepgram pricing varies, but Nova-3 is ~$0.0043/min as of 2026. Check [Deepgram pricing](https://deepgram.com/pricing).

### Q: Can I use Whisper instead of Deepgram?
**A:** Yes! Replace Deepgram service with local Whisper implementation. See `src/voice/services/` for service interface.

### Q: How do I add new voice commands?
**A:** Voice commands are handled by the OpenClaw agent. Modify system prompts, tools, or skills in your workspace.

### Q: Can I use this on a Raspberry Pi 4?
**A:** Should work, but not tested. Pi 5 recommended for better performance. GPIO pin numbering may differ.

### Q: How do I update the voice channel?
**A:** Pull latest OpenClaw:
```bash
cd /mnt/ssd/cyclops-workspace/projects/shopclaw/openclaw
git pull
npm install
npm run build
systemctl --user restart openclaw-gateway
```

---

## Getting Help

### Check Logs
```bash
# View service logs
journalctl --user -u openclaw-gateway -f

# View errors only
journalctl --user -u openclaw-gateway -p err -n 50
```

### Test Components Individually
```bash
# Test STT
node dist/voice/services/example.js transcribe

# Test TTS
node dist/voice/services/example.js tts

# Test hardware
node dist/extensions/voice/src/hardware-factory.js
```

### Community Support
- **GitHub Issues:** [github.com/openclaw/openclaw/issues](https://github.com/openclaw/openclaw/issues)
- **Discord:** [discord.gg/openclaw](https://discord.gg/openclaw)
- **Documentation:** [openclaw.io/docs/voice](https://openclaw.io/docs/voice)

### Contributing
Found a bug? Want to improve the voice channel? Contributions welcome!
- See `CONTRIBUTING.md` in repo
- Submit pull requests on GitHub

---

## What's Next?

Now that you've set up the voice channel:

1. **Experiment with queries** — try different types of questions
2. **Customize personality** — edit SOUL.md to match your preferences
3. **Add skills** — teach Cyclops new capabilities via OpenClaw skills
4. **Monitor performance** — use TESTING.md to benchmark your setup
5. **Share feedback** — let us know what works (and what doesn't)

---

**Enjoy your voice-controlled Cyclops!** 🎤

---

**User Guide Version:** 1.0  
**Last Updated:** 2026-04-19  
**Platform:** Raspberry Pi 5  
**OpenClaw Version:** 2.0+
