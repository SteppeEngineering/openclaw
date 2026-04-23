# Voice Channel Build Instructions

**Target:** Raspberry Pi 5  
**OpenClaw:** Gateway deployment  
**Status:** Ready for deployment

---

## Prerequisites

### Hardware Requirements
- Raspberry Pi 5 (tested on `cyclops` @ 100.107.25.51)
- USB audio device (Jabra Speak 410 or compatible)
- SSD1306 OLED display (128x64, I2C)
- Push-to-talk button (GPIO)
- Rotary encoder (optional, GPIO)
- Power supply (official Pi 5 PSU recommended)

### Software Dependencies

**System packages:**
```bash
# Audio recording/playback
sudo apt-get update
sudo apt-get install -y alsa-utils ffmpeg

# GPIO access
sudo apt-get install -y gpiod libgpiod-dev

# I2C tools (for OLED troubleshooting)
sudo apt-get install -y i2c-tools

# Python for hardware fallback (if needed)
sudo apt-get install -y python3 python3-pip python3-gpiod
```

**Node.js packages:**
Already listed in `/mnt/ssd/cyclops-workspace/projects/shopclaw/openclaw/package.json`:
- `form-data` - Multipart uploads for TTS
- `@types/node` - TypeScript definitions

---

## Build Steps

### 1. Navigate to Repository
```bash
cd /mnt/ssd/cyclops-workspace/projects/shopclaw/openclaw
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Build TypeScript
```bash
npm run build
```

**Expected Output:**
```
Compiling TypeScript...
✓ Built extensions/voice/
✓ Built src/voice/
Build complete: dist/
```

### 4. Verify Build Artifacts
```bash
# Check plugin files
ls -lh dist/extensions/voice/

# Expected:
# index.js
# openclaw.plugin.json
# package.json
# src/channel.js
# src/runtime.js
# src/hardware-factory.js

# Check voice core files
ls -lh dist/voice/

# Expected:
# voice-bot.js
# voice-config.js
# voice-handlers.js
# voice-message-dispatch.js
# voice-send.js
# hardware/
# ui/
# services/
```

---

## Environment Configuration

### 1. API Keys

**Required:**
```bash
export DEEPGRAM_API_KEY="your-deepgram-api-key-here"
```

**Optional (if not using local Chatterbox):**
```bash
export CHATTERBOX_ENDPOINT="http://100.114.0.61:4123"  # Default
```

### 2. OpenClaw Config

Edit `/mnt/ssd/cyclops-workspace/.openclaw/config.json`:

```json
{
  "channels": {
    "voice": {
      "enabled": true,
      "accounts": [
        {
          "id": "pi-voice-main",
          "label": "Cyclops Voice Interface",
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
              "model": "nova-3",
              "smartFormat": true
            },
            "chatterbox": {
              "endpoint": "http://100.114.0.61:4123",
              "voiceSamplePath": "/mnt/ssd/cyclops-workspace/cy-voice-sample.wav",
              "autoResetMemory": true,
              "resetEveryNRequests": 2
            }
          }
        }
      ]
    }
  }
}
```

### 3. Permissions

**GPIO Access:**
```bash
# Add user to gpio group
sudo usermod -a -G gpio cyclops

# Verify
groups cyclops
```

**I2C Access:**
```bash
# Enable I2C
sudo raspi-config
# Interface Options → I2C → Enable

# Add user to i2c group
sudo usermod -a -G i2c cyclops
```

**Audio Access:**
```bash
# Add user to audio group
sudo usermod -a -G audio cyclops

# Test audio device
arecord -l
aplay -l
```

**⚠️ Log out and back in for group changes to take effect.**

---

## Hardware Wiring Verification

### GPIO Pin Mapping (BCM numbering)
```
PTT Button:  GPIO 17 (Pin 11) → GND (Pin 9)
Encoder A:   GPIO 22 (Pin 15)
Encoder B:   GPIO 27 (Pin 13)
```

### I2C OLED Display
```
SDA: GPIO 2 (Pin 3)
SCL: GPIO 3 (Pin 5)
VCC: 3.3V (Pin 1)
GND: GND (Pin 6)
```

### Testing
```bash
# Check I2C devices
sudo i2cdetect -y 1
# Should show device at 0x3C

# Test GPIO
gpioinfo
# Should list GPIO chips and lines

# Test audio
arecord -D default -f S16_LE -r 16000 -c 1 -d 3 /tmp/test.wav
aplay /tmp/test.wav
```

---

## Manual Testing (Pre-Service)

### 1. Test Hardware Detection
```bash
cd /mnt/ssd/cyclops-workspace/projects/shopclaw/openclaw

# Run hardware factory test
node dist/extensions/voice/src/hardware-factory.js
```

**Expected Output:**
```
Detecting hardware environment...
Platform: linux
Arch: arm64
Raspberry Pi detected: Yes
Loading Pi hardware implementation...
Hardware initialized successfully.
```

### 2. Test Voice Bot Initialization
```bash
# Set environment
export DEEPGRAM_API_KEY="your-key"

# Run voice bot directly (will not start full gateway)
node -e "
const { VoiceBot } = require('./dist/voice/voice-bot.js');
const config = { /* config here */ };
const bot = new VoiceBot(config);
console.log('VoiceBot created successfully');
"
```

### 3. Test Service Integration
```bash
# Test Deepgram STT
node dist/voice/services/example.js transcribe

# Test Chatterbox TTS
node dist/voice/services/example.js tts
```

---

## Build Troubleshooting

### TypeScript Compilation Errors
```bash
# Clean and rebuild
rm -rf dist/
npm run build
```

### Missing Dependencies
```bash
# Reinstall all packages
rm -rf node_modules/ package-lock.json
npm install
```

### GPIO Permission Errors
```bash
# Check group membership
groups cyclops

# Re-add to groups if missing
sudo usermod -a -G gpio,i2c,audio cyclops

# Log out and back in
exit
```

### I2C Not Detected
```bash
# Enable I2C in kernel
sudo raspi-config
# Interface Options → I2C → Enable

# Reboot
sudo reboot
```

### Audio Device Not Found
```bash
# List audio devices
arecord -l
aplay -l

# Test specific device
arecord -D hw:0,0 -f S16_LE -r 16000 -c 1 -d 3 /tmp/test.wav
```

---

## Next Steps

After successful build:
1. ✅ Configure voice session personality (see PERSONALITY.md)
2. ✅ Run integration tests (see TESTING.md)
3. ✅ Install systemd service (see SERVICE.md)
4. ✅ Read user guide (see USER-GUIDE.md)

---

## Build Verification Checklist

- [ ] All TypeScript files compiled without errors
- [ ] `dist/extensions/voice/` contains plugin files
- [ ] `dist/voice/` contains voice bot implementation
- [ ] Environment variables set (DEEPGRAM_API_KEY)
- [ ] OpenClaw config updated with voice channel
- [ ] User added to gpio, i2c, audio groups
- [ ] I2C detected at 0x3C
- [ ] GPIO accessible
- [ ] Audio device working (test recording/playback)
- [ ] Hardware factory detects Raspberry Pi
- [ ] VoiceBot initializes without errors

**Build Status:** Ready for integration testing

---

**Build Date:** 2026-04-19  
**Platform:** Raspberry Pi 5  
**Node.js:** v22.22.0  
**OpenClaw:** Gateway deployment
