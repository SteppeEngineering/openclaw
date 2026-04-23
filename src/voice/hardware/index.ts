/**
 * Voice Hardware Module
 * 
 * Hardware abstraction layer for ShopClaw voice interface.
 * Supports both real Raspberry Pi hardware and mock implementations for testing.
 */

// Core types
export type {
  VoiceHardware,
  AudioDevice,
  DisplayDevice,
  InputDevice,
  HardwareEventHandler,
  HardwareFactory,
  HardwareStatus,
} from './types';

export {
  HardwareEvent,
  RecordingState,
} from './types';

// Mock hardware (for testing)
export {
  MockVoiceHardware,
  createMockHardware,
  simulateVoiceInteraction,
  createTestAudioBuffer,
} from './mock-hardware';

// Real Raspberry Pi hardware
export {
  RaspberryPi5Hardware,
  createRaspberryPi5Hardware,
  checkHardwareRequirements,
} from './pi-hardware';

// Low-level hardware components
export {
  GPIO,
  GPIOMode,
  GPIOEdge,
  GPIOValue,
  GPIOPull,
  DebouncedButton,
  RotaryEncoder,
} from './gpio';

export {
  SSD1306Display,
} from './spi';

export {
  ALSAAudioDevice,
  PyAudioDevice,
  createAudioDevice,
  type AudioFormat,
} from './audio';

/**
 * Hardware factory: Create hardware instance based on environment
 * 
 * Automatically detects if running on Raspberry Pi and creates appropriate hardware.
 */
import type { VoiceConfig } from '../voice-config';
import type { VoiceHardware } from './types';
import { createRaspberryPi5Hardware, checkHardwareRequirements } from './pi-hardware';
import { createMockHardware } from './mock-hardware';

export async function createHardware(
  config: VoiceConfig,
  forceMock: boolean = false
): Promise<VoiceHardware> {
  // Check if we should use mock hardware
  if (forceMock || process.env.VOICE_MOCK_HARDWARE === '1') {
    console.log('[Hardware] Using mock hardware (forced or via env var)');
    return createMockHardware(config);
  }
  
  // Check if we're on a Raspberry Pi
  const isRaspberryPi = await checkIfRaspberryPi();
  
  if (!isRaspberryPi) {
    console.log('[Hardware] Not running on Raspberry Pi, using mock hardware');
    return createMockHardware(config);
  }
  
  // Check hardware requirements
  const requirements = await checkHardwareRequirements();
  
  if (!requirements.available) {
    console.error('[Hardware] Missing required tools:', requirements.missing);
    console.error('[Hardware] Falling back to mock hardware');
    return createMockHardware(config);
  }
  
  if (requirements.warnings.length > 0) {
    console.warn('[Hardware] Warnings:', requirements.warnings);
  }
  
  // Create real hardware
  console.log('[Hardware] Creating Raspberry Pi 5 hardware...');
  return createRaspberryPi5Hardware(config);
}

/**
 * Detect if running on Raspberry Pi
 */
async function checkIfRaspberryPi(): Promise<boolean> {
  try {
    const { readFile } = await import('fs/promises');
    const cpuinfo = await readFile('/proc/cpuinfo', 'utf-8');
    
    // Check for Raspberry Pi in model or hardware fields
    return cpuinfo.includes('Raspberry Pi') || 
           cpuinfo.includes('BCM2') ||
           cpuinfo.includes('RP1'); // RP1 for Pi 5
  } catch {
    return false;
  }
}
