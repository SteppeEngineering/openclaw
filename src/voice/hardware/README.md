# Voice Hardware Layer

Hardware abstraction for physical voice interface components.

## Components

- Push-to-talk button (GPIO)
- Rotary encoder (GPIO)
- OLED display (I2C)
- USB microphone
- Audio output

## Implementation

- `types.ts` - Hardware interface definitions
- `mock-hardware.ts` - Testing implementation
- `real-hardware.ts` - Production Pi 5 implementation
