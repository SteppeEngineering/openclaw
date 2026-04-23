/**
 * Voice Services
 * 
 * External service integrations for speech processing.
 */

export {
  DeepgramService,
  createDeepgramService,
  type TranscriptionOptions,
  type TranscriptionResult,
} from './deepgram';

export {
  ChatterboxService,
  createChatterboxService,
  type TTSOptions,
  type TTSResult,
} from './chatterbox';

export {
  loadAcknowledgments,
  selectAcknowledgment,
  playAcknowledgment,
  playContextualAck,
  clearAckCache,
  type AckAudio,
} from './acknowledgments';
