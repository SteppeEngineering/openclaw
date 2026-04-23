/**
 * Voice Hardware Event Handlers
 * 
 * Event handlers for GPIO inputs (PTT button, encoder).
 * Implements the audio recording state machine and hardware interaction logic.
 */

import type { VoiceHardware, HardwareEvent, HardwareEventHandler } from './hardware/types';
import { HardwareEvent as HWEvent, RecordingState } from './hardware/types';
import type { VoiceBot } from './voice-bot';

/**
 * Audio recording context
 */
interface RecordingContext {
  startTime?: number;
  audioBuffer?: Buffer;
  timeout?: NodeJS.Timeout;
}

/**
 * Handler registry for cleanup
 */
const handlerRegistry = new WeakMap<VoiceHardware, Map<HardwareEvent, HardwareEventHandler>>();

/**
 * Register all hardware event handlers
 */
export function registerHardwareHandlers(hardware: VoiceHardware, bot: VoiceBot): void {
  const handlers = new Map<HardwareEvent, HardwareEventHandler>();
  
  // Create recording context (shared state across handlers)
  const recordingContext: RecordingContext = {};
  
  // PTT button press - start recording
  const pttPressHandler = createPTTPressHandler(hardware, bot, recordingContext);
  hardware.input.on(HWEvent.PTT_PRESS, pttPressHandler);
  handlers.set(HWEvent.PTT_PRESS, pttPressHandler);
  
  // PTT button release - stop recording and process
  const pttReleaseHandler = createPTTReleaseHandler(hardware, bot, recordingContext);
  hardware.input.on(HWEvent.PTT_RELEASE, pttReleaseHandler);
  handlers.set(HWEvent.PTT_RELEASE, pttReleaseHandler);
  
  // Encoder rotation - menu navigation
  const encoderCWHandler = createEncoderRotationHandler(hardware, bot, 'cw');
  hardware.input.on(HWEvent.ENCODER_CW, encoderCWHandler);
  handlers.set(HWEvent.ENCODER_CW, encoderCWHandler);
  
  const encoderCCWHandler = createEncoderRotationHandler(hardware, bot, 'ccw');
  hardware.input.on(HWEvent.ENCODER_CCW, encoderCCWHandler);
  handlers.set(HWEvent.ENCODER_CCW, encoderCCWHandler);
  
  // Encoder button press - menu select
  const encoderButtonHandler = createEncoderButtonHandler(hardware, bot);
  hardware.input.on(HWEvent.ENCODER_BUTTON, encoderButtonHandler);
  handlers.set(HWEvent.ENCODER_BUTTON, encoderButtonHandler);
  
  // Store for cleanup
  handlerRegistry.set(hardware, handlers);
}

/**
 * Unregister all hardware event handlers
 */
export function unregisterHardwareHandlers(hardware: VoiceHardware): void {
  const handlers = handlerRegistry.get(hardware);
  if (!handlers) return;
  
  for (const [event, handler] of handlers.entries()) {
    hardware.input.off(event, handler);
  }
  
  handlerRegistry.delete(hardware);
}

/**
 * Create PTT press handler (start recording)
 */
function createPTTPressHandler(
  hardware: VoiceHardware,
  bot: VoiceBot,
  context: RecordingContext
): HardwareEventHandler {
  return async () => {
    try {
      const currentState = hardware.audio.getRecordingState();
      
      // Ignore if already recording
      if (currentState === RecordingState.RECORDING) {
        console.warn('[PTT] Already recording, ignoring press');
        return;
      }
      
      // Ignore if processing previous recording
      if (currentState === RecordingState.PROCESSING) {
        console.warn('[PTT] Still processing previous recording');
        await updateDisplay(hardware, 'Processing...', 'Please wait');
        return;
      }
      
      console.log('[PTT] Button pressed - starting recording');
      
      // Update display
      await updateDisplay(hardware, 'Recording...', 'Release to send');
      
      // Start recording
      context.startTime = Date.now();
      await hardware.audio.startRecording();
      
      // Set maximum recording timeout
      const config = bot.getConfig();
      context.timeout = setTimeout(async () => {
        console.warn('[PTT] Maximum recording time reached, auto-stopping');
        await handleRecordingComplete(hardware, bot, context);
      }, config.behavior.maxRecordingMs);
      
    } catch (error) {
      console.error('[PTT] Failed to start recording:', error);
      await updateDisplay(hardware, 'Error', 'Recording failed');
      
      // Reset state
      if (context.timeout) {
        clearTimeout(context.timeout);
        context.timeout = undefined;
      }
    }
  };
}

/**
 * Create PTT release handler (stop recording and process)
 */
function createPTTReleaseHandler(
  hardware: VoiceHardware,
  bot: VoiceBot,
  context: RecordingContext
): HardwareEventHandler {
  return async () => {
    try {
      const currentState = hardware.audio.getRecordingState();
      
      // Ignore if not recording
      if (currentState !== RecordingState.RECORDING) {
        return;
      }
      
      console.log('[PTT] Button released - stopping recording');
      
      // Clear timeout
      if (context.timeout) {
        clearTimeout(context.timeout);
        context.timeout = undefined;
      }
      
      await handleRecordingComplete(hardware, bot, context);
      
    } catch (error) {
      console.error('[PTT] Failed to stop recording:', error);
      await updateDisplay(hardware, 'Error', 'Failed to stop');
    }
  };
}

/**
 * Handle recording completion (shared logic for button release and timeout)
 */
async function handleRecordingComplete(
  hardware: VoiceHardware,
  bot: VoiceBot,
  context: RecordingContext
): Promise<void> {
  // Check recording duration
  const duration = context.startTime ? Date.now() - context.startTime : 0;
  
  if (duration < 500) {
    console.warn('[PTT] Recording too short, discarding');
    await hardware.audio.stopRecording(); // Discard
    await updateDisplay(hardware, 'Too Short', 'Try again');
    
    // Reset display after 2 seconds
    setTimeout(async () => {
      await showIdleScreen(hardware);
    }, 2000);
    
    return;
  }
  
  // Update display
  await updateDisplay(hardware, 'Processing...', 'Transcribing...');
  
  // Stop recording and get audio buffer
  context.audioBuffer = await hardware.audio.stopRecording();
  
  console.log(`[PTT] Recording complete: ${duration}ms, ${context.audioBuffer.length} bytes`);
  
  // Dispatch voice message to agent session
  try {
    const { dispatchVoiceMessage } = await import('./voice-message-dispatch.js');
    await dispatchVoiceMessage(context.audioBuffer, hardware, bot);
  } catch (error) {
    console.error('[PTT] Message dispatch failed:', error);
    await updateDisplay(hardware, 'Error', 'Dispatch failed');
    
    // Reset display after 3 seconds
    setTimeout(async () => {
      await showIdleScreen(hardware);
    }, 3000);
  }
  
  // Clear context
  context.startTime = undefined;
  context.audioBuffer = undefined;
}

/**
 * Create encoder rotation handler (volume control)
 */
function createEncoderRotationHandler(
  hardware: VoiceHardware,
  bot: VoiceBot,
  direction: 'cw' | 'ccw'
): HardwareEventHandler {
  return async () => {
    try {
      // Don't allow volume changes while recording/processing
      const currentState = hardware.audio.getRecordingState();
      if (currentState === RecordingState.RECORDING || currentState === RecordingState.PROCESSING) {
        return;
      }
      
      // Adjust volume by ±5%
      const delta = direction === 'cw' ? 5 : -5;
      const newVolume = await hardware.audio.adjustVolume(delta);
      
      console.log(`[Encoder] Volume ${direction === 'cw' ? 'up' : 'down'}: ${newVolume}%`);
      
      // Show volume bar on display
      await showVolumeIndicator(hardware, newVolume);
      
      // Reset display after 2 seconds
      setTimeout(async () => {
        await showIdleScreen(hardware);
      }, 2000);
      
    } catch (error) {
      console.error('[Encoder] Volume adjustment failed:', error);
    }
  };
}

/**
 * Create encoder button handler (toggle mute)
 */
function createEncoderButtonHandler(
  hardware: VoiceHardware,
  bot: VoiceBot
): HardwareEventHandler {
  let isMuted = false;
  
  return async () => {
    try {
      // Don't allow mute toggle while recording/processing
      const currentState = hardware.audio.getRecordingState();
      if (currentState === RecordingState.RECORDING || currentState === RecordingState.PROCESSING) {
        return;
      }
      
      // Toggle mute state
      isMuted = !isMuted;
      await hardware.audio.setMute(isMuted);
      
      console.log(`[Encoder] ${isMuted ? 'Muted' : 'Unmuted'}`);
      
      // Show mute status
      await updateDisplay(hardware, isMuted ? 'MUTED' : 'UNMUTED', isMuted ? '🔇' : '🔊');
      
      // Reset display after 1.5 seconds
      setTimeout(async () => {
        await showIdleScreen(hardware);
      }, 1500);
      
    } catch (error) {
      console.error('[Encoder] Mute toggle failed:', error);
    }
  };
}

/**
 * Update display with status message
 */
async function updateDisplay(
  hardware: VoiceHardware,
  line1: string,
  line2?: string
): Promise<void> {
  try {
    await hardware.display.clear();
    await hardware.display.writeText(line1, 0, 0, 2);
    
    if (line2) {
      await hardware.display.writeText(line2, 0, 24, 1);
    }
    
    await hardware.display.update();
  } catch (error) {
    console.error('[Display] Update failed:', error);
  }
}

/**
 * Show volume indicator with visual bar
 */
async function showVolumeIndicator(hardware: VoiceHardware, volume: number): Promise<void> {
  try {
    await hardware.display.clear();
    
    // Title
    await hardware.display.writeText('VOLUME', 34, 4, 1);
    
    // Volume percentage (centered)
    const volumeText = `${volume}%`;
    const textWidth = volumeText.length * 12; // 12 pixels per char at size 2
    await hardware.display.writeText(volumeText, 64 - textWidth / 2, 20, 2);
    
    // Progress bar (graphical)
    const barWidth = 100;
    const barHeight = 8;
    const barX = 14; // Center on 128px display
    const barY = 45;
    
    // Draw outline
    hardware.display.drawRect(barX, barY, barWidth, barHeight, false);
    
    // Draw fill
    const fillWidth = Math.floor((barWidth - 4) * (volume / 100));
    if (fillWidth > 0) {
      hardware.display.drawRect(barX + 2, barY + 2, fillWidth, barHeight - 4, true);
    }
    
    await hardware.display.update();
  } catch (error) {
    console.error('[Display] Volume indicator failed:', error);
  }
}

/**
 * Show idle/ready screen
 */
async function showIdleScreen(hardware: VoiceHardware): Promise<void> {
  await updateDisplay(hardware, 'Ready', 'Press PTT');
}

/**
 * Audio recording state machine
 * 
 * State transitions:
 * 
 *   IDLE --> RECORDING (on PTT press)
 *   RECORDING --> PROCESSING (on PTT release or timeout)
 *   PROCESSING --> IDLE (after transcription + agent response)
 *   any --> ERROR (on failure) --> IDLE (after error display)
 * 
 * The state is managed by the AudioDevice implementation,
 * but handlers enforce the state machine rules.
 */
export enum AudioFlowState {
  /** Waiting for user input */
  IDLE = 'idle',
  
  /** Actively recording audio */
  RECORDING = 'recording',
  
  /** Recording complete, transcribing and routing to agent */
  PROCESSING = 'processing',
  
  /** Playing agent response audio */
  PLAYING = 'playing',
  
  /** Error state */
  ERROR = 'error',
}

/**
 * Get human-readable state description
 */
export function getStateDescription(state: AudioFlowState): string {
  switch (state) {
    case AudioFlowState.IDLE:
      return 'Ready for input';
    case AudioFlowState.RECORDING:
      return 'Recording audio';
    case AudioFlowState.PROCESSING:
      return 'Processing message';
    case AudioFlowState.PLAYING:
      return 'Playing response';
    case AudioFlowState.ERROR:
      return 'Error occurred';
    default:
      return 'Unknown state';
  }
}
