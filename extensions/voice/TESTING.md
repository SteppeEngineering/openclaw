# Voice Channel Integration Test Plan

**Status:** Ready for execution  
**Platform:** Raspberry Pi 5  
**Date:** 2026-04-19

---

## Test Overview

This document outlines comprehensive testing scenarios for the voice channel integration, covering:
- Hardware functionality
- Service integration (STT/TTS)
- Session routing
- Error handling
- Performance benchmarks
- Edge cases

---

## Test Environment

### Hardware Setup
- **Device:** Raspberry Pi 5 @ 100.107.25.51 (cyclops)
- **GPIO:** PTT button (17), Encoder (22, 27)
- **I2C:** OLED display (0x3C)
- **Audio:** USB audio device (default)

### Software Prerequisites
```bash
# Verify build
cd /mnt/ssd/cyclops-workspace/projects/shopclaw/openclaw
npm run build

# Verify environment
echo $DEEPGRAM_API_KEY  # Should print API key
ping -c 1 100.114.0.61  # Chatterbox server reachable

# Verify services
systemctl --user status openclaw-gateway  # Running
```

---

## Test Categories

## Category 1: Hardware Tests

### Test 1.1: GPIO Button Detection
**Objective:** Verify PTT button triggers recording

**Procedure:**
1. Start voice bot (via gateway or standalone)
2. Press PTT button (GPIO 17)
3. Hold for 2 seconds
4. Release button

**Expected:**
- OLED displays "Listening..."
- LED indicator turns on (if wired)
- Console log: `PTT button pressed`

**Pass Criteria:**
- Button press detected within 100ms
- Display updates correctly
- No GPIO errors in logs

**Actual Result:** ___________  
**Status:** [ ] PASS  [ ] FAIL

---

### Test 1.2: Rotary Encoder Volume Control
**Objective:** Verify encoder adjusts volume

**Procedure:**
1. Start voice bot
2. Rotate encoder clockwise 5 clicks
3. Rotate encoder counter-clockwise 5 clicks
4. Observe OLED display

**Expected:**
- OLED shows volume level (0-100%)
- Volume increases/decreases per detent
- Console log: `Encoder rotated: +1` / `-1`

**Pass Criteria:**
- Encoder state changes registered
- Volume level updates on display
- No I2C errors

**Actual Result:** ___________  
**Status:** [ ] PASS  [ ] FAIL

---

### Test 1.3: OLED Display Rendering
**Objective:** Verify OLED displays UI states

**Procedure:**
1. Power on Pi
2. Start voice bot
3. Cycle through states:
   - Idle (waiting)
   - Listening (PTT pressed)
   - Processing (STT → Agent → TTS)
   - Speaking (playback)
   - Error (simulate failure)

**Expected:**
- Each state displays correct text
- Icons render properly (🎤, ⏳, 🔊, ⚠️)
- Text is readable
- No screen corruption

**Pass Criteria:**
- All states display correctly
- No I2C timeout errors
- Display clears between states

**Actual Result:** ___________  
**Status:** [ ] PASS  [ ] FAIL

---

### Test 1.4: Audio Input Capture
**Objective:** Verify USB audio device records

**Procedure:**
1. Identify audio device: `arecord -l`
2. Press PTT button
3. Speak clearly for 5 seconds: "This is a test recording"
4. Release PTT
5. Check audio buffer

**Expected:**
- Audio recorded at 16kHz, mono, S16_LE
- Buffer contains audio data (non-zero samples)
- Console log: `Recorded X bytes`

**Pass Criteria:**
- Audio device accessible
- Non-zero audio buffer
- No ALSA errors

**Actual Result:** ___________  
**Status:** [ ] PASS  [ ] FAIL

---

### Test 1.5: Audio Output Playback
**Objective:** Verify speaker plays TTS audio

**Procedure:**
1. Generate test audio: `node dist/voice/services/example.js tts`
2. Play via voice bot TTS pipeline
3. Verify audible output

**Expected:**
- Audio plays through speaker
- Clear, intelligible speech
- Proper volume level

**Pass Criteria:**
- Audio plays without distortion
- No playback errors
- Volume adjustable via encoder

**Actual Result:** ___________  
**Status:** [ ] PASS  [ ] FAIL

---

## Category 2: Service Integration Tests

### Test 2.1: Deepgram STT - Basic Transcription
**Objective:** Verify Deepgram transcribes audio correctly

**Procedure:**
1. Record 5-second WAV: "What is the temperature?"
2. Call `DeepgramService.transcribe(buffer)`
3. Check transcription result

**Expected:**
```json
{
  "transcript": "What is the temperature?",
  "confidence": 0.95,
  "duration": 5.0
}
```

**Pass Criteria:**
- Transcript matches spoken text (±1-2 words)
- Confidence > 0.8
- Response time < 2 seconds

**Actual Result:** ___________  
**Actual Confidence:** ___________  
**Response Time:** ___________ ms  
**Status:** [ ] PASS  [ ] FAIL

---

### Test 2.2: Deepgram STT - Retry Logic
**Objective:** Verify retry on transient failures

**Procedure:**
1. Temporarily block network: `sudo iptables -A OUTPUT -d api.deepgram.com -j DROP`
2. Attempt transcription
3. Restore network: `sudo iptables -D OUTPUT -d api.deepgram.com -j DROP`
4. Observe retry behavior

**Expected:**
- Initial request fails
- Service retries (exponential backoff)
- Eventually succeeds or returns error

**Pass Criteria:**
- Retry attempts logged (up to 3)
- Backoff delays observed (500ms, 1000ms, 2000ms)
- Final error after max retries

**Actual Result:** ___________  
**Retry Count:** ___________  
**Status:** [ ] PASS  [ ] FAIL

---

### Test 2.3: Chatterbox TTS - Voice Cloning
**Objective:** Verify TTS generates Cyclops voice

**Procedure:**
1. Generate audio: `ChatterboxService.generateSpeech({ text: "Good morning, sir." })`
2. Play audio
3. Verify voice matches sample

**Expected:**
- Audio generated successfully
- Voice sounds like `cy-voice-sample.wav`
- Clear, natural speech

**Pass Criteria:**
- Audio file created
- Voice is recognizable as Cyclops
- No Errno 22 errors

**Actual Result:** ___________  
**Voice Match:** [ ] Yes  [ ] No  
**Status:** [ ] PASS  [ ] FAIL

---

### Test 2.4: Chatterbox TTS - Memory Reset
**Objective:** Verify automatic memory reset

**Procedure:**
1. Generate 3 TTS requests in sequence (config: `resetEveryNRequests: 2`)
2. Check logs for memory reset

**Expected:**
```
Request 1: TTS generated
Request 2: TTS generated
[Memory reset triggered]
Request 3: TTS generated (after reset)
```

**Pass Criteria:**
- Memory reset after 2nd request
- 3rd request succeeds
- No Errno 22 errors

**Actual Result:** ___________  
**Reset Triggered:** [ ] Yes  [ ] No  
**Status:** [ ] PASS  [ ] FAIL

---

### Test 2.5: TTS Audio Format Conversion
**Objective:** Verify WAV → Opus conversion

**Procedure:**
1. Generate WAV: `ChatterboxService.generateSpeech({ text: "Test", format: "wav" })`
2. Convert to Opus: `ChatterboxService.generateSpeech({ text: "Test", format: "opus" })`
3. Verify Opus file plays

**Expected:**
- WAV file created
- Opus conversion succeeds (ffmpeg)
- Opus file plays correctly

**Pass Criteria:**
- Both formats generated
- File sizes reasonable (Opus < WAV)
- Opus playback works

**Actual WAV Size:** ___________ KB  
**Actual Opus Size:** ___________ KB  
**Status:** [ ] PASS  [ ] FAIL

---

## Category 3: End-to-End Workflow Tests

### Test 3.1: Full Voice Interaction (Happy Path)
**Objective:** Complete PTT → STT → Agent → TTS → Playback

**Procedure:**
1. Press PTT button
2. Speak: "What is the Raspberry Pi CPU temperature?"
3. Release PTT
4. Wait for response
5. Verify audio playback

**Expected:**
- OLED: "Listening..." → "Processing..." → "Speaking..."
- Deepgram transcribes query
- Agent responds with temperature
- TTS generates audio
- Speaker plays response

**Pass Criteria:**
- Full workflow completes without errors
- Response is relevant and brief (2-3 sentences)
- Total latency < 10 seconds

**Actual Latency:** ___________ seconds  
**Response:** ___________  
**Status:** [ ] PASS  [ ] FAIL

---

### Test 3.2: Multi-Turn Conversation
**Objective:** Verify session maintains context

**Procedure:**
1. Interaction 1: "What is the garage temperature?"
2. Wait for response
3. Interaction 2: "And the humidity?" (context required)
4. Verify agent understands "the" refers to garage

**Expected:**
- Agent maintains conversation context
- Response to "And the humidity?" includes garage humidity
- Session `voice:main` persists

**Pass Criteria:**
- Context preserved across turns
- Response makes sense
- No session reset errors

**Actual Response 2:** ___________  
**Status:** [ ] PASS  [ ] FAIL

---

### Test 3.3: Rapid PTT Presses
**Objective:** Handle rapid button presses gracefully

**Procedure:**
1. Press PTT for 1 second
2. Release
3. Immediately press again
4. Repeat 5 times quickly

**Expected:**
- Each press queued or ignored during processing
- No concurrent recording sessions
- System doesn't crash

**Pass Criteria:**
- No race conditions
- Graceful handling of overlapping requests
- Error messages if requests queued

**Actual Result:** ___________  
**Status:** [ ] PASS  [ ] FAIL

---

## Category 4: Error Handling Tests

### Test 4.1: Network Failure (Deepgram Unreachable)
**Objective:** Handle STT service failure

**Procedure:**
1. Block Deepgram API: `sudo iptables -A OUTPUT -d api.deepgram.com -j DROP`
2. Press PTT, speak, release
3. Observe error handling

**Expected:**
- OLED displays "⚠️ Transcription failed"
- TTS announces error: "I couldn't hear you clearly. Please try again."
- System doesn't crash

**Pass Criteria:**
- Error detected
- User-friendly error message
- System remains functional

**Actual Result:** ___________  
**Status:** [ ] PASS  [ ] FAIL

---

### Test 4.2: TTS Service Failure (Chatterbox Offline)
**Objective:** Handle TTS service failure

**Procedure:**
1. Stop Chatterbox server (on 100.114.0.61)
2. Trigger voice query
3. Observe error handling

**Expected:**
- OLED displays "⚠️ Voice generation failed"
- Fallback: Display text response on OLED (no audio)
- Error logged

**Pass Criteria:**
- Error handled gracefully
- Fallback mechanism works
- System doesn't crash

**Actual Result:** ___________  
**Status:** [ ] PASS  [ ] FAIL

---

### Test 4.3: GPIO Hardware Failure
**Objective:** Handle hardware disconnection

**Procedure:**
1. Simulate GPIO failure (disconnect button wire)
2. Attempt to use voice interface
3. Check error handling

**Expected:**
- OLED displays "⚠️ Hardware error"
- Error logged
- System degrades gracefully (maybe allow software triggers)

**Pass Criteria:**
- GPIO error detected
- Error reported to user
- System doesn't crash

**Actual Result:** ___________  
**Status:** [ ] PASS  [ ] FAIL

---

### Test 4.4: Session Timeout
**Objective:** Handle long-running agent queries

**Procedure:**
1. Ask complex query that takes >30 seconds to answer
2. Observe timeout handling

**Expected:**
- Request times out after 30 seconds
- OLED displays "⚠️ Request timeout"
- TTS announces: "Sorry, that took too long. Please try again."

**Pass Criteria:**
- Timeout triggered correctly
- User notified
- Session doesn't hang

**Actual Result:** ___________  
**Status:** [ ] PASS  [ ] FAIL

---

### Test 4.5: Invalid Audio Input (Silence)
**Objective:** Handle empty/silent recordings

**Procedure:**
1. Press PTT
2. Don't speak (silence for 5 seconds)
3. Release PTT

**Expected:**
- Deepgram returns empty transcript or error
- OLED displays "⚠️ No audio detected"
- TTS announces: "I didn't catch that. Please try again."

**Pass Criteria:**
- Silence detected
- User-friendly error message
- System ready for next input

**Actual Result:** ___________  
**Status:** [ ] PASS  [ ] FAIL

---

## Category 5: Performance Benchmarks

### Test 5.1: STT Latency
**Objective:** Measure Deepgram transcription speed

**Procedure:**
1. Record 5-second audio clip
2. Measure time from API call to response

**Expected:** < 2 seconds

**Actual Results:**
| Attempt | Audio Length | API Latency |
|---------|--------------|-------------|
| 1       | 5.0s         | _________s  |
| 2       | 5.0s         | _________s  |
| 3       | 5.0s         | _________s  |
| **Avg** | **5.0s**     | **_________s** |

**Status:** [ ] PASS (<2s avg)  [ ] FAIL

---

### Test 5.2: TTS Latency
**Objective:** Measure Chatterbox generation speed

**Procedure:**
1. Generate 20-word response
2. Measure time from API call to audio received

**Expected:** < 3 seconds

**Actual Results:**
| Attempt | Text Length | API Latency |
|---------|-------------|-------------|
| 1       | 20 words    | _________s  |
| 2       | 20 words    | _________s  |
| 3       | 20 words    | _________s  |
| **Avg** | **20 words** | **_________s** |

**Status:** [ ] PASS (<3s avg)  [ ] FAIL

---

### Test 5.3: End-to-End Latency
**Objective:** Measure total interaction time

**Procedure:**
1. Press PTT
2. Speak 5-second query
3. Release PTT
4. Measure time until audio playback starts

**Expected:** < 10 seconds total

**Breakdown:**
- Recording: ~5s (user speech)
- STT: ~2s
- Agent processing: ~2s
- TTS: ~3s
- **Total:** ~12s (target <10s with optimizations)

**Actual Results:**
| Attempt | Speech | STT | Agent | TTS | Total |
|---------|--------|-----|-------|-----|-------|
| 1       | 5s     | __s | __s   | __s | ____s |
| 2       | 5s     | __s | __s   | __s | ____s |
| 3       | 5s     | __s | __s   | __s | ____s |
| **Avg** | **5s** | **__s** | **__s** | **__s** | **____s** |

**Status:** [ ] PASS (<10s avg)  [ ] FAIL

---

### Test 5.4: Memory Usage
**Objective:** Verify memory doesn't leak during prolonged use

**Procedure:**
1. Record initial memory: `ps aux | grep node`
2. Perform 50 voice interactions
3. Record final memory
4. Calculate delta

**Expected:** < 100MB growth

**Actual Results:**
- Initial memory: ___________ MB
- Final memory: ___________ MB
- Delta: ___________ MB

**Status:** [ ] PASS (<100MB)  [ ] FAIL

---

### Test 5.5: CPU Usage
**Objective:** Measure CPU load during voice processing

**Procedure:**
1. Monitor CPU: `top -bn1 | grep node`
2. Perform voice interaction
3. Record peak CPU usage

**Expected:** < 60% on Pi 5

**Actual Results:**
- Idle CPU: ___________%
- Peak CPU (during processing): ___________%
- Average CPU: ___________%

**Status:** [ ] PASS (<60% peak)  [ ] FAIL

---

## Category 6: Edge Cases

### Test 6.1: Long Audio Recording (>10 seconds)
**Objective:** Handle extended speech

**Procedure:**
1. Press PTT
2. Speak continuously for 15 seconds
3. Release PTT

**Expected:**
- Full audio captured (or truncated at 10s limit)
- STT processes entire buffer
- Response appropriate

**Actual Result:** ___________  
**Status:** [ ] PASS  [ ] FAIL

---

### Test 6.2: Background Noise
**Objective:** Verify STT handles noisy environments

**Procedure:**
1. Play background music or noise
2. Press PTT, speak query
3. Check transcription accuracy

**Expected:**
- Deepgram filters some noise
- Transcription accuracy degrades gracefully
- User informed if transcription fails

**Actual Transcript:** ___________  
**Accuracy:** [ ] High  [ ] Medium  [ ] Low  
**Status:** [ ] PASS  [ ] FAIL

---

### Test 6.3: Accented Speech
**Objective:** Verify STT handles various accents

**Procedure:**
1. Test with different speakers (if available)
2. Check transcription quality

**Expected:**
- Deepgram handles common accents
- Minor errors acceptable

**Actual Results:**
- Speaker 1: ___________
- Speaker 2: ___________

**Status:** [ ] PASS  [ ] FAIL

---

### Test 6.4: Special Characters in Response
**Objective:** Verify TTS handles punctuation, numbers

**Procedure:**
1. Ask query that includes numbers, symbols
2. Example: "What's the IP address of the Mac mini?"
3. Expected response: "100.95.231.233"

**Expected:**
- TTS pronounces numbers correctly ("one hundred dot ninety-five...")
- No TTS errors on special chars

**Actual TTS Output:** ___________  
**Status:** [ ] PASS  [ ] FAIL

---

### Test 6.5: Very Short PTT Press (<1 second)
**Objective:** Handle brief button presses

**Procedure:**
1. Press PTT for 0.5 seconds
2. Release immediately

**Expected:**
- Recording too short, ignored or error message
- "Please hold the button longer"

**Actual Result:** ___________  
**Status:** [ ] PASS  [ ] FAIL

---

## Test Execution Checklist

### Pre-Test Setup
- [ ] Hardware connected and verified
- [ ] Software built (`npm run build`)
- [ ] Environment variables set (DEEPGRAM_API_KEY)
- [ ] OpenClaw gateway running
- [ ] Chatterbox server accessible
- [ ] Test audio files prepared
- [ ] Monitoring tools ready (top, htop, logs)

### During Testing
- [ ] Log all results in this document
- [ ] Record timestamps for latency tests
- [ ] Screenshot OLED display states
- [ ] Save audio samples (input/output)
- [ ] Document any anomalies

### Post-Test Analysis
- [ ] Review all FAIL results
- [ ] Identify root causes
- [ ] Propose fixes
- [ ] Retest failed scenarios
- [ ] Update documentation

---

## Pass/Fail Summary

| Category | Tests | Pass | Fail | Skip |
|----------|-------|------|------|------|
| Hardware | 5     | __   | __   | __   |
| Services | 5     | __   | __   | __   |
| E2E      | 3     | __   | __   | __   |
| Errors   | 5     | __   | __   | __   |
| Performance | 5  | __   | __   | __   |
| Edge Cases | 5   | __   | __   | __   |
| **Total** | **28** | **__** | **__** | **__** |

**Overall Status:** [ ] PASS  [ ] FAIL

---

## Known Issues

*(Document any known bugs or limitations discovered during testing)*

1. ___________
2. ___________
3. ___________

---

## Recommendations

*(Suggested improvements based on test results)*

1. ___________
2. ___________
3. ___________

---

**Test Plan Version:** 1.0  
**Last Updated:** 2026-04-19  
**Tester:** ___________  
**Test Date:** ___________
