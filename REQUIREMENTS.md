# Interview Gym: Project Requirements

Status: draft v0.1. Personal project, local-first, no monetisation.

## 1. Vision

A private practice space where introverted job seekers rehearse interviews and workplace conversations with realistic AI characters, then get specific, kind feedback. Loop: **practise, get feedback, retry, see progress.**

## 2. Target user

- Job seekers (Australian market first) who find interviews and small talk draining.
- Wants low-stakes reps, no audience, no judgement, and control over pace.

## 3. Scope

### In scope (MVP)
- Web app only, running locally.
- Text chat with an AI character (voice output optional, voice input later).
- 3 personas: Recruiter (Priya), Hiring manager (Dave), Senior colleague (Mel).
- Scenario setup: pick persona, difficulty, optional pasted job ad as context.
- End-of-session coach report (structured, quote-grounded).
- Session history stored locally.

### Later
- Voice input (faster-whisper), progress dashboard, CV upload, custom scenarios generated from a job ad, more accents/voices.

### Out of scope
- Accounts, payments, cloud hosting, mobile apps, voice cloning of real people.

## 4. Functional requirements

| ID | Requirement |
|---|---|
| F1 | User can choose a persona and difficulty (Gentle / Realistic / Tough) before starting. |
| F2 | User can paste a job ad (text) to ground the conversation. |
| F3 | Character replies stream token by token; the character opens the conversation. |
| F4 | Character stays in role, asks one question at a time, probes vague answers, and never coaches mid-session. |
| F5 | Each character reply can be spoken aloud via Kokoro TTS; voice is selectable per persona and previewable. |
| F6 | User can pause, request a hint, see a suggested reply, or rewind one turn (no penalty). |
| F7 | User can end a session at any time and receive a coach report. |
| F8 | Coach report returns validated JSON: strengths, one focus area, filler/hedging count, questions asked back, STAR coverage (interview), one rewritten answer. Every point cites a quote from the transcript. |
| F9 | Sessions and reports are saved locally and can be reviewed or deleted. |
| F10 | Difficulty maps to persona parameters (pace, interruptions, friendliness, follow-up depth). |

## 5. Non-functional requirements

- **Privacy:** all inference local (Ollama, Kokoro). No third-party calls. Data deletable.
- **Latency:** first token under 2 s on target hardware; TTS streamed per sentence.
- **Calm UX:** no timers or scores by default, no streak pressure, short 3-5 minute sessions.
- **Accessibility:** keyboard operable, visible focus, WCAG AA contrast, `prefers-reduced-motion` honoured, captions for all audio.
- **Resilience:** clear message if Ollama or Kokoro is unavailable; the app still works text-only.

## 6. Tech stack

| Layer | Choice |
|---|---|
| LLM | Ollama, `qwen3.5:9b` (thinking off for character, optional on for coach) |
| Backend | Python 3.12, FastAPI, httpx, Pydantic, SQLite (SQLModel) |
| TTS | Kokoro (CPU), British voices as Australian placeholder; `synthesize(text, voice)` interface so it can be swapped |
| STT (later) | faster-whisper on CPU |
| Frontend | Next.js, TypeScript, Tailwind, shadcn/ui, Zustand, Recharts |
| Hardware | AMD RX 7900 GRE 16 GB (LLM via ROCm in Ollama), 32 GB RAM, TTS/STT on CPU |

## 7. Architecture

```
Browser (Next.js)
  chat UI, voice selector, audio playback
        | HTTP / streaming text
FastAPI
  /api/personas  /api/voices  /api/chat (stream)  /api/tts  /api/sessions  /api/coach
        |                     |                  |
     Ollama (Qwen)        Kokoro (CPU)        SQLite
```

Two separate prompts: **Character** (in role, short turns) and **Coach** (reads full transcript, returns JSON schema). They are never mixed.

## 8. Data model (SQLite)

- `session(id, persona_id, difficulty, context, started_at, ended_at)`
- `message(id, session_id, role, content, created_at)`
- `report(id, session_id, json, created_at)`

## 9. Coach report schema (draft)

```json
{
  "summary": "string",
  "strengths": [{"point": "string", "quote": "string"}],
  "focus_area": {"point": "string", "quote": "string", "try_next": "string"},
  "metrics": {"filler_words": 0, "hedges": 0, "questions_asked_back": 0, "talk_ratio_user": 0.0},
  "star": {"situation": true, "task": true, "action": true, "result": false},
  "rewrite": {"original": "string", "improved": "string"}
}
```

## 10. UX principles (introvert-first)

- Text first, voice optional; nothing starts without the user pressing go.
- Feedback framed as "what worked, one thing to try", never a grade out of 100.
- Hints and rewind always available, never penalised.
- Progressive exposure ladder: text, voice output, voice input, timed pressure, interruptions.

## 11. Motion principles (from emil-design-eng)

- Animate only what earns it; no animation on keyboard-initiated actions.
- Custom ease-out curves (`cubic-bezier(0.23, 1, 0.32, 1)`); UI motion under 300 ms; never `ease-in`.
- Buttons scale to 0.97 on press; entrances start from scale 0.95 + opacity 0, never `scale(0)`.
- Transitions, not keyframes, for rapid interactions (chat bubbles, toasts); exits faster than enters.
- Animate only `transform` and `opacity`; gate hover effects behind `(hover: hover) and (pointer: fine)`.
- Calm personality: soft, unhurried, no bounce.

## 12. Milestones

1. **M1 Foundation:** backend scaffold (done), streaming chat page, one persona.
2. **M2 Design system:** palette, type, components, motion tokens (pending palette decision).
3. **M3 Personas and setup flow:** 3 personas, difficulty, job-ad context.
4. **M4 Voice out:** Kokoro playback and voice picker.
5. **M5 Coach and history:** report JSON, session review, delete.
6. **M6 Polish:** accessibility pass, motion review, error states.

## 13. Risks

- Character is too agreeable: enforce pushback rules in the prompt; test with sample transcripts.
- Coach hallucination: require quote citations; reject output that fails schema or quote match.
- Kokoro on CPU latency: stream sentence by sentence; fall back to text.
- Not therapy: avoid clinical claims; include a gentle disclaimer.

## 14. Open decisions

- Colour palette and typography (to discuss).
- Light, dark, or both themes.
- Difficulty parameter definitions.
- Final Aussie voice approach (British placeholder for now).
