# Voice Channel Setup - Quick Reference

**5-Minute Setup Guide**

This is a condensed version of the full documentation. For detailed instructions, see individual guides.

---

## Prerequisites

- [ ] Raspberry Pi 5 with hardware assembled
- [ ] OpenClaw repository cloned
- [ ] Deepgram API key obtained
- [ ] Chatterbox TTS server running (100.114.0.61:4123)

---

## Step 1: Build (5 minutes)

```bash
cd /mnt/ssd/cyclops-workspace/projects/shopclaw/openclaw

# Install dependencies
npm install

# Build TypeScript
npm run build

# Verify
ls -lh dist/extensions/voice/
ls -lh dist/voice/
```

**Reference:** [BUILD.md](BUILD.md)

---

## Step 2: Configure (10 minutes)

### Environment Variables
```bash
# Add to ~/.bashrc or ~/.profile
export DEEPGRAM_API_KEY="your-api-key-here"
export CHATTERBOX_ENDPOINT="http://100.114.0.61:4123"

source ~/.bashrc
```

### OpenClaw Config
Edit `~/.openclaw/config.json`:

```json
{
  "channels": {
    "voice": {
      "enabled": true,
      "accounts": [{
        "id": "pi-voice-main",
        "hardware": {
          "mockMode": false,
          "gpio": { "pttButton": 17, "encoderA": 22, "encoderB": 27 },
          "i2c": { "bus": 1, "oledAddress": "0x3C" },
          "audio": { "device": "default", "sampleRate": 16000 }
        },
        "services": {
          "deepgram": { "apiKey": "${DEEPGRAM_API_KEY}" },
          "chatterbox": {
            "endpoint": "${CHATTERBOX_ENDPOINT}",
            "voiceSamplePath": "/mnt/ssd/cyclops-workspace/cy-voice-sample.wav"
          }
        }
      }]
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

**Reference:** [PERSONALITY.md](PERSONALITY.md)

---

## Step 3: Permissions (2 minutes)

```bash
# Add user to required groups
sudo usermod -a -G gpio,i2c,audio cyclops

# Enable I2C
sudo raspi-config
# Interface Options → I2C → Enable

# Log out and back in for group changes
exit
```

**Reference:** [BUILD.md](BUILD.md#permissions)

---

## Step 4: Install Service (3 minutes)

```bash
# Create service directory
mkdir -p ~/.config/systemd/user/

# Create service file
cat > ~/.config/systemd/user/openclaw-gateway.service << 'EOF'
[Unit]
Description=OpenClaw Gateway with Voice Channel
After=network-online.target

[Service]
Type=simple
WorkingDirectory=/mnt/ssd/cyclops-workspace/projects/shopclaw/openclaw
ExecStart=/usr/bin/node dist/entry.js gateway run
Environment="DEEPGRAM_API_KEY=your-key-here"
Environment="CHATTERBOX_ENDPOINT=http://100.114.0.61:4123"
Restart=on-failure
RestartSec=10s

[Install]
WantedBy=default.target
EOF

# Replace "your-key-here" with actual key
nano ~/.config/systemd/user/openclaw-gateway.service

# Reload systemd
systemctl --user daemon-reload

# Enable auto-start
systemctl --user enable openclaw-gateway

# Enable linger (start on boot)
sudo loginctl enable-linger cyclops

# Start service
systemctl --user start openclaw-gateway
```

**Reference:** [SERVICE.md](SERVICE.md)

---

## Step 5: Verify (5 minutes)

```bash
# Check service status
systemctl --user status openclaw-gateway

# Expected output:
# ● openclaw-gateway.service - OpenClaw Gateway with Voice Channel
#    Active: active (running)

# View logs
journalctl --user -u openclaw-gateway -f

# Check hardware
sudo i2cdetect -y 1  # OLED at 0x3C
gpioinfo | grep 17   # PTT button
arecord -l           # Microphone
aplay -l             # Speaker

# Test voice interface
# Press PTT button → Speak → Release → Listen
```

**Reference:** [USER-GUIDE.md](USER-GUIDE.md)

---

## Step 6: Test (Optional)

Run integration tests:

```bash
# See TESTING.md for full test plan (28 scenarios)

# Quick hardware test
node dist/extensions/voice/src/hardware-factory.js

# Quick STT test
node dist/voice/services/example.js transcribe

# Quick TTS test
node dist/voice/services/example.js tts
```

**Reference:** [TESTING.md](TESTING.md)

---

## Troubleshooting

### Service Won't Start
```bash
journalctl --user -u openclaw-gateway -n 50
# Check for errors in logs
```

### No Response to PTT Button
```bash
gpioinfo | grep 17
# Verify GPIO accessible

groups cyclops
# Should include "gpio"
```

### OLED Display Blank
```bash
sudo i2cdetect -y 1
# Should show device at 0x3C

# Check wiring:
# SDA: GPIO 2 (Pin 3)
# SCL: GPIO 3 (Pin 5)
```

### STT/TTS Failures
```bash
# Test Deepgram
curl -X POST "https://api.deepgram.com/v1/listen" \
  -H "Authorization: Token $DEEPGRAM_API_KEY" \
  --data-binary @test.wav

# Test Chatterbox
curl -s http://100.114.0.61:4123/health
```

**Full Troubleshooting:** [USER-GUIDE.md#troubleshooting](USER-GUIDE.md#troubleshooting)

---

## Quick Commands

```bash
# Start service
systemctl --user start openclaw-gateway

# Stop service
systemctl --user stop openclaw-gateway

# Restart service
systemctl --user restart openclaw-gateway

# View logs
journalctl --user -u openclaw-gateway -f

# Check status
systemctl --user status openclaw-gateway

# Test voice
# Press button → "What is the CPU temperature?" → Release
```

---

## Documentation Index

| Guide | Purpose |
|-------|---------|
| [README.md](README.md) | Plugin overview and API reference |
| [BUILD.md](BUILD.md) | Detailed build instructions |
| [PERSONALITY.md](PERSONALITY.md) | Voice session configuration |
| [TESTING.md](TESTING.md) | Integration test plan (28 tests) |
| [SERVICE.md](SERVICE.md) | Systemd service setup |
| [USER-GUIDE.md](USER-GUIDE.md) | End-user guide and FAQ |
| **SETUP.md** (this file) | Quick setup reference |

---

## Expected Timeline

| Step | Time |
|------|------|
| Build | 5 min |
| Configure | 10 min |
| Permissions | 2 min |
| Install Service | 3 min |
| Verify | 5 min |
| **Total** | **~25 minutes** |

*(Excludes hardware assembly and testing)*

---

## Success Checklist

- [ ] Build completes without errors
- [ ] Config file created and validated
- [ ] User in gpio, i2c, audio groups
- [ ] Service enabled and running
- [ ] Logs show "Voice channel plugin loaded"
- [ ] OLED displays "Ready" or "Cyclops"
- [ ] PTT button press triggers "Listening..."
- [ ] Voice query returns audio response
- [ ] Service survives reboot

---

## Next Steps

1. **Use it:** Press button, speak queries, listen
2. **Customize:** Edit SOUL.md for personality tweaks
3. **Monitor:** Check logs for errors or performance issues
4. **Optimize:** Tune latency, model, voice settings
5. **Extend:** Add skills, tools, custom commands

---

**Quick Setup Version:** 1.0  
**Last Updated:** 2026-04-19  
**Platform:** Raspberry Pi 5
