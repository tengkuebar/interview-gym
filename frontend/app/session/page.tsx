"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChatBubble } from "@/components/ChatBubble";
import { ThemeToggle } from "@/components/ThemeToggle";
import { VolumeSlider } from "@/components/VolumeSlider";
import {
  FALLBACK_PERSONAS,
  getAssist,
  getPersonas,
  streamChat,
  transcribe,
  type AssistKind,
  type Persona,
} from "@/lib/api";
import { SpeechQueue, takeSentence } from "@/lib/speech";
import { useSession } from "@/lib/store";

// A short soft tone: higher to say "recording", lower to say "stopped".
function tone(ctx: AudioContext, hz: number, volume: number): Promise<void> {
  if (volume === 0) return Promise.resolve();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const now = ctx.currentTime;
  osc.frequency.value = hz;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.08 * volume, now + 0.015);
  gain.gain.linearRampToValueAtTime(0, now + 0.12);
  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.13);
  return new Promise((resolve) => setTimeout(resolve, 150));
}

type Status ="idle" | "thinking" | "streaming" | "error";

export default function SessionPage() {
  const s = useSession();
  const [personas, setPersonas] = useState<Persona[]>(FALLBACK_PERSONAS);
  const [status, setStatus] = useState<Status>("idle");
  const [draft, setDraft] = useState("");
  const [voiceNote, setVoiceNote] = useState("");
  const [playingIdx, setPlayingIdx] = useState<number | null>(null);
  // Help result is tied to the number of messages when it was asked for, so it
  // disappears on its own once the conversation moves on.
  const [assist, setAssist] = useState<{ kind: AssistKind; text: string; at: number } | null>(null);
  const [assistBusy, setAssistBusy] = useState<AssistKind | null>(null);
  const [assistNote, setAssistNote] = useState("");
  const opened = useRef(false);
  const draftRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const speakingIdx = useRef<number | null>(null);
  const [mic, setMic] = useState<"idle" | "recording" | "transcribing">("idle");
  const [micNote, setMicNote] = useState("");
  // True after a voice answer was written into the box, until it is sent or cleared.
  const [reviewing, setReviewing] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const meterRef = useRef<HTMLDivElement>(null);
  const starting = useRef(false);
  const stopMeter = useRef<(() => void) | null>(null);
  const [secs, setSecs] = useState(0);
  const [quiet, setQuiet] = useState(false);

  const persona = useMemo(
    () => personas.find((p) => p.id === s.personaId) ?? personas[0],
    [personas, s.personaId],
  );
  const personaRef = useRef(persona);
  useEffect(() => {
    personaRef.current = persona;
  }, [persona]);

  const [speech] = useState(() => new SpeechQueue());
  useEffect(() => {
    speech.configure({
      voice: () => ({ voice: personaRef.current.voice, speed: personaRef.current.speed }),
      volume: () => useSession.getState().volume,
      onActive: (active) => setPlayingIdx(active ? speakingIdx.current : null),
      onError: () => setVoiceNote("Voice isn't set up yet. Captions still work."),
    });
  }, [speech]);

  useEffect(() => {
    getPersonas().then(setPersonas).catch(() => {});
  }, []);

  useEffect(() => {
    speech.setVolume(s.volume);
  }, [speech, s.volume]);

  // Stop any queued speech when leaving the page.
  useEffect(() => () => speech.stop(), [speech]);

  // Release the microphone if the page is left mid-recording.
  useEffect(
    () => () => {
      const rec = recorder.current;
      if (rec && rec.state !== "inactive") {
        rec.onstop = null;
        rec.stop();
        rec.stream.getTracks().forEach((t) => t.stop());
        stopMeter.current?.();
      }
    },
    [],
  );

  // Replay a whole reply (the speaker button on a bubble).
  const play = useCallback(
    (text: string, idx: number) => {
      setVoiceNote("");
      speech.stop();
      speakingIdx.current = idx;
      speech.enqueue(text);
    },
    [speech],
  );

  const runTurn = useCallback(
    async (history: { role: "user" | "assistant"; content: string }[]) => {
      setStatus("thinking");
      const state = useSession.getState();
      let started = false;
      // Speak each sentence as soon as it is complete rather than waiting for the whole reply.
      const talk = state.speakReplies;
      let pending = "";
      speech.stop();
      setVoiceNote("");
      try {
        for await (const chunk of streamChat({
          persona_id: state.personaId,
          messages: history,
          difficulty: state.difficulty,
          context: state.jobAd.trim() || undefined,
        })) {
          if (!started) {
            started = true;
            useSession.getState().addMessage({ role: "assistant", content: "" });
            speakingIdx.current = useSession.getState().messages.length - 1;
            setStatus("streaming");
          }
          useSession.getState().appendToLast(chunk);
          if (talk) {
            pending += chunk;
            let next = takeSentence(pending);
            while (next) {
              speech.enqueue(next[0]);
              pending = next[1];
              next = takeSentence(pending);
            }
          }
        }
        if (talk && pending.trim()) speech.enqueue(pending.trim());
        setStatus("idle");
      } catch {
        speech.stop();
        setStatus("error");
      }
    },
    [speech],
  );

  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    const existing = useSession.getState().messages;
    if (existing.length === 0) queueMicrotask(() => runTurn([]));
  }, [runTurn]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [s.messages, status]);

  async function toggleMic() {
    if (mic === "transcribing" || starting.current) return;
    if (mic === "recording") {
      recorder.current?.stop();
      return;
    }
    starting.current = true;
    setMicNote("");
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setMicNote("This browser can't record audio. You can still type.");
      starting.current = false;
      return;
    }
    try {
      // Stop the character talking first so the mic doesn't pick it up.
      speech.stop();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);

      // Level meter + start/stop tones, through one AudioContext.
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const samples = new Uint8Array(analyser.fftSize);
      const began = Date.now();
      let loudest = 0;
      let raf = 0;
      const tick = () => {
        analyser.getByteTimeDomainData(samples);
        let sum = 0;
        for (const v of samples) sum += ((v - 128) / 128) ** 2;
        const level = Math.sqrt(sum / samples.length);
        loudest = Math.max(loudest, level);
        if (meterRef.current) meterRef.current.style.transform = `scaleX(${Math.min(1, level * 5)})`;
        setSecs(Math.floor((Date.now() - began) / 1000));
        setQuiet(Date.now() - began > 3000 && loudest < 0.02);
        raf = requestAnimationFrame(tick);
      };
      // Tone first, so it isn't picked up by the recording.
      await tone(ctx, 880, useSession.getState().volume);

      rec.onstop = async () => {
        cancelAnimationFrame(raf);
        stream.getTracks().forEach((t) => t.stop());
        recorder.current = null;
        setQuiet(false);
        tone(ctx, 520, useSession.getState().volume).then(() => ctx.close());
        setMic("transcribing");
        try {
          const text = await transcribe(new Blob(chunks, { type: rec.mimeType }));
          if (text) {
            setDraft((d) => (d.trim() ? `${d.trim()} ${text}` : text));
            setReviewing(true);
            setTimeout(() => draftRef.current?.focus(), 0);
          } else {
            setMicNote("Didn't catch anything. Try again a little closer to the mic.");
          }
        } catch (e) {
          setMicNote((e as Error).message);
        }
        setMic("idle");
      };
      recorder.current = rec;
      rec.start();
      setSecs(0);
      setMic("recording");
      raf = requestAnimationFrame(tick);
      stopMeter.current = () => {
        cancelAnimationFrame(raf);
        ctx.close().catch(() => {});
      };
    } catch {
      setMicNote("Microphone access was blocked. Allow it in the address bar, or type instead.");
    }
    starting.current = false;
  }

  function send() {
    const text = draft.trim();
    if (!text || status === "thinking" || status === "streaming") return;
    setDraft("");
    setReviewing(false);
    s.addMessage({ role: "user", content: text });
    runTurn([...useSession.getState().messages]);
  }

  function retry() {
    const msgs = useSession.getState().messages;
    runTurn(msgs.filter((m) => m.content));
  }

  function rewind() {
    speech.stop();
    s.rewindOneTurn();
    setStatus("idle");
  }

  async function askAssist(kind: AssistKind) {
    if (assistBusy) return;
    const state = useSession.getState();
    const msgs = state.messages.filter((m) => m.content);
    if (status === "thinking" || status === "streaming" || msgs[msgs.length - 1]?.role !== "assistant") {
      setAssistNote(`Wait for ${persona.name} to finish, then ask again.`);
      return;
    }
    setAssistNote("");
    setAssistBusy(kind);
    try {
      const text = await getAssist(kind, {
        persona_id: state.personaId,
        messages: msgs,
        difficulty: state.difficulty,
        context: state.jobAd.trim() || undefined,
      });
      setAssist({ kind, text, at: state.messages.length });
    } catch (e) {
      setAssistNote((e as Error).message);
    }
    setAssistBusy(null);
  }

  function applySuggestion(text: string) {
    setDraft(text);
    setTimeout(() => draftRef.current?.focus(), 0);
  }

  const busy = status === "thinking" || status === "streaming";
  const showReview = reviewing && draft.trim() !== "" && mic === "idle";
  const shownAssist = assist && assist.at === s.messages.length ? assist : null;
  const canRewind = s.messages.some((m) => m.role === "user");

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-4 sm:px-10">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/"
            aria-label="Back to setup"
            className="press flex h-11 w-11 items-center justify-center rounded-xl border border-transparent text-muted"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M19 12H5M11 6l-6 6 6 6" />
            </svg>
          </Link>
          <div className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-soft font-medium text-accent-text" aria-hidden="true">
            {persona.name[0]}
          </div>
          <div className="min-w-0">
            <div className="truncate font-medium">
              {persona.name}, {persona.role}
            </div>
            <div className="text-[13px] capitalize text-muted">{s.difficulty}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link
            href="/voice"
            className="press flex min-h-11 items-center gap-2 rounded-xl border border-line bg-surface px-4 text-ink"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="9" y="3" width="6" height="11" rx="3" />
              <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
            </svg>
            Voice mode
          </Link>
          <Link
            href="/report"
            onClick={() => {
              speech.stop();
              s.setReport(null);
            }}
            className="press flex min-h-11 items-center rounded-xl border border-line bg-surface px-4.5 text-ink"
          >
            End session
          </Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[1160px] flex-1 flex-wrap items-start gap-8 px-4 pb-8 pt-6 sm:px-10">
        <section aria-label="Conversation" className="flex min-w-0 flex-[999_1_520px] flex-col gap-6">
          <div role="log" aria-live="polite" className="flex min-h-[420px] flex-col gap-3.5">
            {s.messages.map((m, i) =>
              m.content ? (
                <ChatBubble
                  key={i}
                  role={m.role}
                  initial={persona.name[0]}
                  onPlay={m.role === "assistant" ? () => play(m.content, i) : undefined}
                  playing={playingIdx === i}
                >
                  {m.content}
                </ChatBubble>
              ) : null,
            )}
            {status === "thinking" && (
              <div className="flex items-center gap-2 pl-10 text-[13px] text-muted">
                <span className="dot" />
                <span className="dot" />
                <span className="dot" />
                <span className="ml-1.5">{persona.name} is thinking</span>
              </div>
            )}
            {status === "error" && (
              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-sm">
                <span className="text-danger">
                  Couldn&apos;t reach the local model. Check that Ollama and the backend are running.
                </span>
                <button type="button" onClick={retry} className="press min-h-11 rounded-xl border border-line px-4 text-ink">
                  Try again
                </button>
              </div>
            )}
            <div ref={endRef} />
          </div>

          <div className="flex flex-col gap-2.5">
            {playingIdx !== null && (
              <div role="status" className="bubble-in flex items-center gap-3 rounded-xl border border-line bg-surface py-1.5 pl-4 pr-1.5 text-sm">
                <span className="flex h-5 items-center gap-[3px]" aria-hidden="true">
                  {[0, 120, 240, 360, 480].map((d) => (
                    <span key={d} className="eq-bar" style={{ animationDelay: `${d}ms` }} />
                  ))}
                </span>
                <span className="font-medium">{persona.name} is speaking</span>
                <button
                  type="button"
                  onClick={() => speech.stop()}
                  className="press ml-auto flex min-h-11 items-center gap-2 rounded-xl border border-line bg-bg px-4 text-ink"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <rect x="5" y="5" width="14" height="14" rx="2.5" />
                  </svg>
                  Stop
                </button>
              </div>
            )}
            <div
              className={`flex items-end gap-2.5 rounded-2xl border bg-surface py-2.5 pl-4 pr-2.5 ${
                mic === "recording" ? "border-accent" : "border-line"
              }`}
            >
              <div className="flex min-w-0 flex-1 flex-col">
              {showReview ? (
                <label htmlFor="reply" className="pt-0.5 text-[13px] font-medium text-accent-text">
                  Here&apos;s what I heard. Fix anything that&apos;s off.
                </label>
              ) : (
                <label htmlFor="reply" className="sr-only">
                  Your reply
                </label>
              )}
              <textarea
                id="reply"
                ref={draftRef}
                rows={2}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder={mic === "recording" ? "Listening… press the mic again when you're done" : "Type or speak your answer"}
                className="w-full resize-none border-0 bg-transparent py-1.5 text-base leading-normal text-ink outline-none placeholder:text-muted"
              />
              </div>
              <button
                type="button"
                onClick={toggleMic}
                disabled={mic === "transcribing"}
                aria-pressed={mic === "recording"}
                aria-label={mic === "recording" ? "Stop recording" : showReview ? "Add more by voice" : "Speak your answer"}
                className={`press relative flex h-11 w-11 flex-none items-center justify-center rounded-xl border ${
                  mic === "recording"
                    ? "mic-live border-transparent bg-try-bg text-try-ink"
                    : showReview
                      ? "border-accent bg-transparent text-accent-text"
                      : "border-line bg-bg text-accent-text"
                } disabled:opacity-50`}
              >
                {mic === "recording" ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <rect x="6" y="6" width="12" height="12" rx="2" />
                  </svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="9" y="3" width="6" height="11" rx="3" />
                    <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
                  </svg>
                )}
              </button>
              <button
                type="button"
                onClick={send}
                aria-label="Send"
                className="press cta flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-accent px-4.5 font-medium text-on-accent"
              >
                Send
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </button>
            </div>
            <p className="text-[13px] text-muted">
              {busy ? `${persona.name} is replying…` : "Press Enter to send, Shift + Enter for a new line."}
            </p>
            {mic === "recording" && (
              <div className="flex items-center gap-3 text-[13px] text-muted">
                <span className="dot" style={{ background: "var(--danger-ink)" }} aria-hidden="true" />
                <span className="tabular-nums">
                  Recording {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, "0")}
                </span>
                <div className="h-1.5 w-28 overflow-hidden rounded-full bg-line" aria-hidden="true">
                  <div ref={meterRef} className="h-full origin-left rounded-full bg-accent" style={{ transform: "scaleX(0)" }} />
                </div>
              </div>
            )}
            <div aria-live="polite">
              {mic === "recording" && quiet && (
                <p className="text-[13px] text-try-ink">I can&apos;t hear anything yet. Check your microphone is on and close to you.</p>
              )}
              {mic === "transcribing" && <p className="text-[13px] text-muted">Turning your voice into text…</p>}
              {micNote && <p className="text-[13px] text-muted">{micNote}</p>}
            </div>
            {voiceNote && <p className="text-[13px] text-muted">{voiceNote}</p>}
          </div>
        </section>

        <aside aria-label="Session tools" className="flex min-w-[260px] max-w-[320px] flex-[1_1_280px] flex-col gap-4">
          <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5">
            <h2 className="text-base font-medium">Need a hand?</h2>
            <p className="text-sm text-muted">None of these count against you.</p>
            <button
              type="button"
              onClick={() => askAssist("hint")}
              aria-busy={assistBusy === "hint"}
              className="press flex min-h-11 items-center gap-2.5 rounded-xl border border-line bg-bg px-3.5 text-left text-ink"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-text)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" />
              </svg>
              {assistBusy === "hint" ? "Thinking of a hint…" : "Give me a hint"}
            </button>
            <button
              type="button"
              onClick={() => askAssist("reply")}
              aria-busy={assistBusy === "reply"}
              className="press flex min-h-11 items-center gap-2.5 rounded-xl border border-line bg-bg px-3.5 text-left text-ink"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-text)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 5h16v11H9l-5 4z" />
              </svg>
              {assistBusy === "reply" ? "Writing a draft…" : "Suggest a reply"}
            </button>
            <button
              type="button"
              onClick={rewind}
              disabled={!canRewind}
              className="press flex min-h-11 items-center gap-2.5 rounded-xl border border-line bg-bg px-3.5 text-left text-ink disabled:opacity-50"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-text)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3" />
              </svg>
              Rewind one turn
            </button>
            <div aria-live="polite">
              {assistNote && <p className="text-[13px] text-muted">{assistNote}</p>}
            </div>
          </div>

          {shownAssist && (
            <div className="bubble-in flex flex-col gap-2 rounded-2xl bg-soft px-5 py-4">
              <div className="text-xs font-medium tracking-wide text-accent-text">
                {shownAssist.kind === "hint" ? "Hint" : "A draft you can change"}
              </div>
              <div className="text-sm">{shownAssist.text}</div>
              {shownAssist.kind === "reply" && (
                <>
                  <div className="text-[13px] text-muted">
                    Fill the [brackets] with your real details. Make it sound like you.
                  </div>
                  <div>
                    <button
                      type="button"
                      onClick={() => applySuggestion(shownAssist.text)}
                      className="press min-h-11 rounded-xl border border-line bg-surface px-4 text-sm text-ink"
                    >
                      Use this as a starting point
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface px-5 py-4">
            <label className="flex cursor-pointer items-center justify-between gap-3">
              <span>
                <span className="block text-sm font-medium">Replies spoken aloud</span>
                <span className="block text-[13px] text-muted">{persona.name}&apos;s voice</span>
              </span>
              <input
                type="checkbox"
                role="switch"
                checked={s.speakReplies}
                onChange={(e) => s.setSpeakReplies(e.target.checked)}
                className="h-5 w-5 accent-[var(--accent-text)]"
              />
            </label>
            <VolumeSlider />
          </div>
        </aside>
      </main>
    </div>
  );
}
