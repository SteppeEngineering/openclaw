# Voice Hardware Layer

Hardware abstraction layer for the ShopClaw voice interface.

## Overview

This module provides hardware access for the voice channel on Raspberry Pi 5:
- **GPIO**: Button and rotary encoder input via `gpiod` or sysfs
- **I2C OLED**: SSD1306 display driver (128x64 or 128x32)
- **ALSA Audio**: Recording and playback via `arecord`/`aplay`

## Files

### Core Types
- **types.ts**: Hardware interface definitions

### Implementations
- **pi-hardware.ts**: Main Raspberry Pi 5 implementation
- **mock-hardware.ts**: Mock hardware for testing (no physical device needed)

### Low-Level Drivers
- **gpio.ts**: GPIO access with gpiod/sysfs, debounced buttons, rotary encoder
- **spi.ts**: I2C/SSD1306 OLED display driver
- **audio.ts**: ALSA audio recording/playback, PyAudio fallback

### Exports
- **index.ts**: Unified exports and hardware factory

## Usage

```typescript
import { createHardware } from './hardware';
import { loadVoiceConfig } from '../voice-config';

// Auto-detect hardware
const config = loadVoiceConfig();
const hardware = await createHardware(config);

// Listen for PTT button
hardware.input.on(HardwareEvent.PTT_PRESS, async () => {
  await hardware.audio.startRecording();
  await hardware.display.writeText('Recording...', 0, 0);
  await hardware.display.update();
});

hardware.input.on(HardwareEvent.PTT_RELEASE, async () => {
  const audioBuffer = await hardware.audio.stopRecording();
  // Process audio...
});
```

## Hardware Requirements

### Raspberry Pi 5
- GPIO pins for button and encoder (BCM numbering)
- I2C bus 1 for OLED display
- USB audio device (e.g., Jabra Speak 410)

### Required Packages
```bash
sudo apt update
sudo apt install -y \
  i2c-tools \
  alsa-utils \
  ffmpeg
```

### Optional (for gpiod)
```bash
sudo apt install -y gpiod libgpiod-dev
```

## GPIO Pin Assignments (Default)

- **PTT Button**: GPIO17 (Physical Pin 11)
- **Encoder A**: GPIO22 (Physical Pin 15)
- **Encoder B**: GPIO27 (Physical Pin 13)
- **Encoder Button**: GPIO23 (Physical Pin 16)

All input pins use internal pull-up resistors. Connect buttons between GPIO and ground.

## I2C Display

Default: 128x64 SSD1306 OLED at address 0x3C on I2C bus 1.

Enable I2C:
```bash
sudo raspi-config
# Interface Options → I2C → Enable
```

Test I2C:
```bash
sudo i2cdetect -y 1
```

## Testing

Use mock hardware for development without physical Pi:
```bash
VOICE_MOCK_HARDWARE=1 npm run dev
```

Or in code:
```typescript
const hardware = await createHardware(config, true); // Force mock
```

## Python Fallback

PyAudio integration available if ALSA tools are insufficient:
```bash
sudo apt install -y python3-pyaudio
```

The `audio.ts` module includes a PyAudioDevice class that spawns Python subprocesses.

## Troubleshooting

### GPIO Errors
- Ensure user is in `gpio` group: `sudo usermod -a -G gpio $USER`
- Check GPIO numbering (BCM vs physical pin numbers)
- Pi 5 uses `gpiochip4` (not gpiochip0)

### I2C Errors
- Ensure I2C is enabled in raspi-config
- Check device address with `i2cdetect -y 1`
- Verify wiring (SDA to GPIO2, SCL to GPIO3)

### Audio Errors
- List devices: `arecord -l` and `aplay -l`
- Test recording: `arecord -f cd test.wav -d 3`
- Check ALSA config in `/etc/asound.conf` or `~/.asoundrc`

## Architecture Notes

### GPIO Backend Detection
- Prefers `gpiod` (libgpiod tools) for modern kernel support
- Falls back to sysfs (`/sys/class/gpio`) for compatibility
- Both backends implement the same `GPIOPin` interface

### Display Rendering
- Frame buffer held in memory (1 bit per pixel)
- Draw operations update buffer
- `update()` flushes buffer to display via I2C

### Audio Pipeline
- Uses ALSA tools for maximum compatibility
- Records to temp WAV file, returns Buffer
- Supports format conversion via ffmpeg
- PyAudio available for advanced features

## Future Enhancements

- Native Node.js bindings (replace shell commands)
- Hardware acceleration for display rendering
- Streaming audio (instead of buffered)
- Better rotary encoder debouncing
- Power management and sleep modes
