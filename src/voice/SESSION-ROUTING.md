# Voice Channel Session Routing

## Shared Context Across Channels

The voice channel routes to the **main session** (same as TUI, Telegram, Discord, etc.) to enable seamless cross-channel context.

### Behavior

**Cross-channel conversation flow:**
```
You (Telegram):  "I'm working on the kinetic mirror project"
Assistant:       "The ball-pivot design with 3-point solenoids?"

You (Voice):     "What was the cost per mirror again?"
Assistant:       "$7-8 per mirror"  ← Has full context from Telegram

You (TUI):       "Add that to the project notes"
Assistant:       [Updates notes]  ← Knows we're discussing kinetic mirrors
```

### Why Main Session?

**Use Case:** Workshop/garage assistant where projects are discussed across multiple channels:
- Research and planning in TUI (typing at desk)
- Quick questions in Telegram (mobile)
- Hands-free queries via voice (at workbench)

All three need to share the same conversation context.

### Implementation

```typescript
// voice-message-dispatch.ts
constructor(params: { runtime: RuntimeEnv; sessionKey?: string }) {
  this.sessionKey = params.sessionKey || "main";  // Routes to main session
}

// voice-bot.ts
this.sessionManager = createVoiceSessionManager({
  runtime: this.runtime,
  sessionKey: "main",  // Same session as TUI/Telegram
  agentId: "main",
});
```

### Effects

**✅ Benefits:**
- Full cross-channel context
- Seamless conversation flow
- Can reference prior discussion from any channel
- Voice queries have access to project context

**⚠️ Considerations:**
- Voice transcripts appear in TUI/webchat/Telegram
- If actively typing in TUI, voice message appears in that conversation
- This is the desired behavior for project-focused work

### Alternative (Not Implemented)

A dedicated `voice-main` session would isolate voice queries, but **loses cross-channel context**:

```
You (Telegram):  "Working on kinetic mirrors"
You (Voice):     "What was the cost?"
Assistant:       ❌ "What project are you referring to?"
```

This defeats the purpose of a conversational assistant for project work.

### Comparison to Official Talk Mode

Our implementation matches Official Talk Mode's session strategy:
- Talk Mode: Routes to `main` via `chat.send`
- Voice Channel: Routes to `main` via session manager

Both provide the same **shared context** behavior.

---

**Created:** 2026-03-09  
**Rationale:** Workshop use case requires cross-channel context for ongoing project discussions
