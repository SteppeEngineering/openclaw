# Voice Session Personality Configuration

**Goal:** Configure the voice session to use Cyclops personality with voice-optimized response formatting.

---

## Overview

The voice channel creates a persistent session (`voice:main`) that routes messages through OpenClaw's session manager. This session should:

1. Load **Cyclops personality** from workspace context files
2. Apply **voice-specific constraints** (brevity, natural speech)
3. Use **appropriate model** for conversational voice
4. Handle **interruptions and errors gracefully**

---

## Session Configuration

### Location
Voice session settings are configured in:
```
/mnt/ssd/cyclops-workspace/.openclaw/config.json
```

### Voice-Specific Session Settings

```json
{
  "sessions": {
    "voice:main": {
      "label": "Cyclops Voice Interface",
      "agentId": "main",
      "model": "anthropic/claude-sonnet-4-5",
      "thinking": "low",
      "workspace": "/mnt/ssd/cyclops-workspace",
      "contextFiles": [
        "SOUL.md",
        "USER.md",
        "AGENTS.md",
        "TOOLS.md",
        "IDENTITY.md"
      ],
      "systemPrompt": {
        "mode": "append",
        "text": "\n\n## Voice Mode Active\n\nYou are responding via voice (spoken aloud). Follow these rules:\n\n1. **Maximum 2 sentences** (3 only if critical)\n2. **NO acknowledgment preamble** — skip \"I'll check that\" / \"Let me see\" / \"I took the liberty\"\n3. **Direct answers only** — the ack file already acknowledged, just give the info\n4. **Quote/passage limit:** 40 words maximum\n5. **Optimize for being read aloud** — crisp, punchy, natural speech rhythm\n6. **No markdown formatting** — plain text only for TTS\n7. **Numbers as words** — \"three\" not \"3\", \"twenty-five\" not \"25\"\n8. **Abbreviations spelled out** — \"gigabytes\" not \"GB\"\n\nThink conversational radio host, not technical documentation."
      },
      "maxTurns": 50,
      "responsePrefix": "",
      "autoCompact": true,
      "compactAfterTurns": 30
    }
  }
}
```

---

## Personality Files in Workspace

The voice session automatically loads these files from `/mnt/ssd/cyclops-workspace/`:

### 1. `SOUL.md` - Core Personality
Already exists with:
- Jarvis + Jeeves fusion personality
- Dry wit, technical precision
- "Voice Mode" section with brevity rules

**Voice Mode Section (already present):**
```markdown
## Voice Mode

When responding to voice queries (spoken input):
- **Maximum 2 sentences** (3 only if critical)
- **NO acknowledgment preamble**
- **Direct answers only**
- Quote/passage limit: 40 words maximum
- Optimize for being read aloud
```

### 2. `USER.md` - About Anthony
- Name, timezone, location
- Communication preferences
- Voice note preference

### 3. `AGENTS.md` - Agent Instructions
- Memory management
- Voice response guidelines

### 4. `TOOLS.md` - Local Tool Notes
- TTS instructions (Chatterbox)
- SSH access
- Storage paths

### 5. `IDENTITY.md` - Role Definition
- "Cyclops (Cy)" identity
- Hardware whisperer role

---

## Model Selection for Voice

### Recommended Model
```
anthropic/claude-sonnet-4-5
```

**Rationale:**
- Fast response time (critical for voice)
- Excellent instruction following (brevity rules)
- Natural conversational tone
- Cost-effective for high-frequency voice interactions

### Alternative Models
```
anthropic/claude-haiku-4       # Faster, cheaper, good for simple queries
openai/gpt-4o                  # Alternative if Claude unavailable
```

**Configure in session:**
```json
"sessions": {
  "voice:main": {
    "model": "anthropic/claude-sonnet-4-5",
    "fallback": ["anthropic/claude-haiku-4", "openai/gpt-4o"]
  }
}
```

---

## Thinking Mode for Voice

### Recommended Setting
```json
"thinking": "low"
```

**Why "low"?**
- Voice interactions need **fast responses**
- Extended reasoning (`high`) adds latency
- User is standing in front of hardware, expects immediacy
- "Low" still enables basic reasoning for tool use

### Thinking Modes
```
off:     No reasoning, fastest (not recommended - breaks tools)
low:     Light reasoning, fast, good for voice
stream:  Reasoning streamed (adds latency)
high:    Deep reasoning (too slow for voice)
```

---

## Response Formatting for TTS

### Text Preprocessing (in voice-send.ts)

Before sending text to Chatterbox TTS, apply these transformations:

```typescript
function prepareForTTS(text: string): string {
  // Remove markdown formatting
  text = text.replace(/\*\*/g, '');      // Bold
  text = text.replace(/\*/g, '');        // Italic
  text = text.replace(/`([^`]+)`/g, '$1'); // Code spans
  text = text.replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1'); // Links
  
  // Remove code blocks (replace with description)
  text = text.replace(/```[\s\S]*?```/g, '[code block]');
  
  // Convert numbers to words (optional, TTS may handle)
  // text = convertNumbersToWords(text);
  
  // Limit length (3000 chars is Chatterbox max)
  if (text.length > 2800) {
    text = text.substring(0, 2800) + '... [truncated for voice]';
  }
  
  return text.trim();
}
```

### Length Enforcement

**Session-level enforcement:**
```json
"systemPrompt": {
  "text": "...Maximum 2 sentences..."
}
```

**Application-level enforcement:**
```typescript
// In voice-send.ts
if (response.text.split('. ').length > 3) {
  console.warn('Response too long for voice, truncating...');
  response.text = response.text.split('. ').slice(0, 2).join('. ') + '.';
}
```

---

## Voice-Specific Prompt Additions

### Append to System Prompt
The voice session system prompt should include:

```markdown
## Voice Mode Active

You are Cyclops (Cy), the hardware whisperer for Steppe Engineering, responding via physical voice interface.

### Voice Response Rules
1. **Brevity:** 2 sentences maximum (3 if critical)
2. **No preamble:** Skip "I'll check" / "Let me" / "I took the liberty"
3. **Direct answers:** User asked a question, answer it immediately
4. **Natural speech:** Optimize for being read aloud, not read on screen
5. **No formatting:** Plain text only (no markdown, code blocks, or tables)
6. **Number pronunciation:** Spell out numbers and abbreviations
7. **Quote limits:** Max 40 words from any source

### Personality in Voice
- Maintain Jarvis + Jeeves dry wit, but compressed
- Technical precision without jargon overload
- Calm under pressure
- "Very good, sir" energy

### Examples
❌ "I'll check the temperature sensor for you. One moment please."
✅ "Garage temperature is twenty-three celsius, humidity sixty percent."

❌ "Let me take a look at that. The Jellyfin server appears to be running normally based on the systemd status output."
✅ "Jellyfin is running. CPU usage four percent."

❌ "I took the liberty of examining the network configuration..."
✅ "Tailscale mesh is up. All nodes reachable."
```

---

## Session Initialization

### On VoiceBot Startup

```typescript
// In voice-bot.ts or voice-channel.ts
async function initializeVoiceSession(runtime: OpenClawRuntime) {
  const sessionId = 'voice:main';
  
  // Check if session exists
  const existing = await runtime.session.get(sessionId);
  
  if (!existing) {
    // Create new session
    await runtime.session.create({
      sessionId,
      label: 'Cyclops Voice Interface',
      agentId: 'main',
      model: 'anthropic/claude-sonnet-4-5',
      thinking: 'low',
      workspace: '/mnt/ssd/cyclops-workspace',
      contextFiles: ['SOUL.md', 'USER.md', 'AGENTS.md', 'TOOLS.md', 'IDENTITY.md'],
      systemPrompt: {
        mode: 'append',
        text: VOICE_MODE_PROMPT, // From above
      },
    });
    
    console.log('✓ Voice session created:', sessionId);
  } else {
    console.log('✓ Voice session exists:', sessionId);
  }
  
  return sessionId;
}
```

### Session Lifecycle

```
VoiceBot.start()
  ↓
initializeVoiceSession()
  ↓
[Session persists across PTT interactions]
  ↓
VoiceBot.stop()
  ↓
Session remains (conversation history preserved)
```

---

## Memory Management

### Auto-Compaction
```json
"sessions": {
  "voice:main": {
    "autoCompact": true,
    "compactAfterTurns": 30
  }
}
```

After 30 turns (PTT presses), OpenClaw will:
1. Summarize conversation history
2. Preserve important context
3. Reduce token usage

### Manual Reset
```bash
# Via CLI
openclaw sessions reset voice:main

# Via voice command (if implemented)
"Reset conversation"
```

---

## Testing Personality

### Test Script
```bash
#!/bin/bash
# test-voice-personality.sh

# Simulate voice queries
echo "Testing voice personality..."

curl -X POST http://localhost:8080/sessions/voice:main/message \
  -H "Content-Type: application/json" \
  -d '{
    "text": "What is the temperature in the garage?",
    "channel": "voice"
  }'

# Expected: 2-sentence response, no preamble

curl -X POST http://localhost:8080/sessions/voice:main/message \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Is Jellyfin running?",
    "channel": "voice"
  }'

# Expected: "Jellyfin is running." or similar
```

### Voice Interaction Test
```bash
# Press PTT button
# Speak: "What is the Raspberry Pi CPU temperature?"

# Expected response (via TTS):
# "CPU temperature is fifty-two celsius. Load average one point two."
```

---

## Troubleshooting

### Response Too Long
**Symptom:** Agent ignores 2-sentence rule

**Fix:**
1. Check system prompt in config
2. Verify voice mode section exists in SOUL.md
3. Add application-level truncation in voice-send.ts

### Response Has Markdown
**Symptom:** TTS reads asterisks, backticks, etc.

**Fix:**
1. Add `prepareForTTS()` function to strip formatting
2. Enforce "no formatting" in system prompt

### Personality Inconsistent
**Symptom:** Sometimes Jarvis, sometimes generic

**Fix:**
1. Verify SOUL.md loaded in session
2. Check workspace path in config
3. Ensure contextFiles array includes all personality files

### Too Verbose
**Symptom:** Agent still too chatty despite brevity rules

**Fix:**
1. Switch to Claude Haiku (more instruction-following)
2. Add explicit truncation in voice-send.ts
3. Prepend "Be extremely brief:" to user messages

---

## Verification Checklist

- [ ] Voice session config in `/mnt/ssd/cyclops-workspace/.openclaw/config.json`
- [ ] Session ID: `voice:main`
- [ ] Model: `anthropic/claude-sonnet-4-5` (or alternative)
- [ ] Thinking: `low`
- [ ] Workspace: `/mnt/ssd/cyclops-workspace`
- [ ] Context files: SOUL.md, USER.md, AGENTS.md, TOOLS.md, IDENTITY.md
- [ ] Voice mode prompt appended to system prompt
- [ ] Max 2-3 sentences enforced
- [ ] No markdown formatting in responses
- [ ] TTS preprocessing function implemented
- [ ] Session auto-compaction enabled
- [ ] Test queries return appropriate brevity

**Personality Status:** Configured and ready for voice

---

**Configuration Date:** 2026-04-19  
**Session:** voice:main  
**Agent:** main (Cyclops)  
**Model:** anthropic/claude-sonnet-4-5
