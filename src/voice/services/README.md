# Voice Services

External service integrations for speech processing.

## Services

### Deepgram (STT)

Speech-to-text transcription with error handling and retries.

**Features:**
- Nova-3 model with smart formatting
- Automatic audio format detection (WAV, Opus, MP3, FLAC)
- Exponential backoff retry logic
- Configurable timeout and retry policies
- Request statistics tracking

**Usage:**
```typescript
import { createDeepgramService } from './services';
import { loadVoiceConfig } from './voice-config';

const config = loadVoiceConfig();
const deepgram = createDeepgramService(config);

const audioBuffer = await recordAudio();
const result = await deepgram.transcribe(audioBuffer, {
  model: 'nova-3',
  smartFormat: true,
  language: 'en',
});

console.log('Transcript:', result.text);
console.log('Confidence:', result.confidence);
```

### Chatterbox (TTS)

Text-to-speech with voice cloning and memory management.

**Features:**
- Voice cloning with uploaded sample
- Automatic memory reset (prevents Errno 22)
- Audio format conversion (WAV → Opus via ffmpeg)
- 3000 character input limit enforcement
- Retry logic with exponential backoff
- Health check endpoint

**Usage:**
```typescript
import { createChatterboxService } from './services';
import { loadVoiceConfig } from './voice-config';

const config = loadVoiceConfig();
const chatterbox = createChatterboxService(config);

const result = await chatterbox.generateSpeech({
  text: 'Hello, this is Cyclops.',
  outputFormat: 'opus', // or 'wav'
});

await playAudio(result.audioBuffer);
```

**Memory Management:**
Chatterbox accumulates memory state that causes errors after 2-3 generations. The service automatically resets memory every N requests (configured via `behavior.ttsResetInterval` in voice config, default: 2).

### Integration

Both services are integrated into the voice bot workflow:

1. **PTT Press** → Start audio recording
2. **PTT Release** → Stop recording
3. **Deepgram** → Transcribe audio → text
4. **Agent Session** → Process text → response
5. **Chatterbox** → Generate speech from response
6. **Audio Playback** → Play response through speaker

## Error Handling

Both services implement:
- Automatic retry with exponential backoff
- Timeout protection
- Network error detection
- API error parsing
- Graceful degradation

Retriable errors:
- Network failures (ECONNREFUSED, ECONNRESET, ETIMEDOUT)
- HTTP 5xx server errors
- Rate limit errors (429)
- Request timeouts
- Chatterbox Errno 22 (triggers memory reset + retry)

## Configuration

Service configuration is defined in `voice-config.ts`:

```typescript
services: {
  deepgram: {
    endpoint: 'https://api.deepgram.com/v1/listen',
    apiKey: process.env.DEEPGRAM_API_KEY,
    model: 'nova-3',
    smartFormat: true,
  },
  chatterbox: {
    baseUrl: 'http://100.114.0.61:4123',
    voiceSamplePath: '/mnt/ssd/cyclops-workspace/cy-voice-sample.wav',
    exaggeration: 0.9,
    cfgWeight: 0.3,
    temperature: 0.9,
  },
}
```

## Dependencies

**Node.js packages:**
- `form-data` - Multipart form data for Chatterbox voice upload
- (Standard library: `fs/promises`, `child_process`, `util`)

**External tools:**
- `ffmpeg` - Audio format conversion (WAV → Opus)

**API keys:**
- `DEEPGRAM_API_KEY` - Environment variable or config
