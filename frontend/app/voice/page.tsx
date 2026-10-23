"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Orb, type OrbPhase } from "@/components/Orb";
import { ThemeToggle } from "@/components/ThemeToggle";
import { FALLBACK_PERSONAS, getPersonas, getProfile, getSttModels, streamChat, transcribe, type Persona, type VoiceProfile } from "@/lib/api";
import { useSession } from "@/lib/store";
import { SpeechQueue, takeSentence } from "@/lib/speech";
import { VoiceListener } from "@/lib/voice";

// How long you can stay quiet before your turn is sent.
const PAUSE_MS = 4000;

export default function VoicePage() {
  const s = useSession();
  const [personas, setPersonas] = useState<Persona[]>(FALLBACK_PERSONAS);
  const [phase, setPhase] = useState<OrbPhase>("idle");
  const [muted, setMuted] = useState(false);
  const [note, setNote] = useState("");
  const [caption, setCaption] = useState<{ who: "you" | "her"; text: string } | null>(null);

  const levelRef = useRef<HTMLSpanElement>(null);
  const mutedRef = useRef(false);
  const mounted = useRef(true);
  const abortRef = useRef<AbortController | null>(null);
  const streamDone = useRef(true); // the reply text has finished arriving
  const [speech] = useState(() => new SpeechQueue());
  const [listener] = useState(() => new VoiceListener(PAUSE_MS));

  const persona = useMemo(
    () => personas.find((p) => p.id === s.personaId) ?? personas[0],
    [personas, s.personaId],
  );
  const personaRef = useRef(persona);
  useEffect(() => {
    personaRef.current = persona;
  }, [persona]);

  // The latest handlers, so long-lived callbacks (microphone, speech) never use stale state.
  const fns = useRef<{ finishReply: () => void; handleEnd: (blob: Blob | null) => void }>({
    finishReply: () => {},
    handleEnd: () => {},
  });

  useEffect(() => {
    getPersonas().then(setPersonas).catch(() => {});
  }, []);

  // First time here: go through voice setup once (it can be skipped).
  const router = useRouter();
  const [hasProfile, setHasProfile] = useState(true);
  const [betterModelMissing, setBetterModelMissing] = useState(false);
  const profileRef = useRef<VoiceProfile | null>(null);
  useEffect(() => {
    getProfile()
      .then((p) => {
        profileRef.current = p;
        setHasProfile(!!p.calibrated_at);
        let skipped = false;
        try {
          skipped = localStorage.getItem("ig-voice-setup-skipped") === "1";
        } catch {}
        if (!p.calibrated_at && !skipped) router.replace("/voice-setup");
      })
      .catch(() => {});
    getSttModels()
      .then((list) => setBetterModelMissing(list.some((m) => m.default && !m.installed)))
      .catch(() => {});
  }, [router]);

  useEffect(() => {
    mounted.current = true;
    listener.configure({
      onLevel: (l) => {
        if (levelRef.current) levelRef.current.style.transform = `scale(${1 + l * 0.16})`;
      },
      onQuiet: (quiet) =>
        setPhase((p) => (quiet ? (p === "listening" ? "pause" : p) : p === "pause" ? "listening" : p)),
      onEnd: (blob) => fns.current.handleEnd(blob),
    });
    speech.configure({
      voice: () => ({ voice: personaRef.current.voice, speed: personaRef.current.speed }),
      volume: () => useSession.getState().volume,
      onActive: (active) => {
        // The voice went quiet and the whole reply has arrived: her turn is over.
        if (!active && streamDone.current && mounted.current) fns.current.finishReply();
      },
      onPlayStart: () => setPhase((p) => (p === "thinking" || p === "speaking" ? "speaking" : p)),
      onError: () => setNote("Voice isn't set up yet. You can still read her replies below."),
    });
    return () => {
      mounted.current = false;
      abortRef.current?.abort();
      streamDone.current = false; // so stopping the voice below doesn't restart the microphone
      speech.stop();
      listener.close();
    };
  }, [listener, speech]);

  useEffect(() => {
    speech.setVolume(s.volume);
  }, [speech, s.volume]);

  function startListening() {
    if (!mounted.current) return;
    if (mutedRef.current) {
      setPhase("muted");
      return;
    }
    setPhase("listening");
    listener.startTurn();
  }

  async function respond() {
    setPhase("thinking");
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    streamDone.current = false;
    speech.stop(); // clears anything left over from an earlier turn
    const st = useSession.getState();
    const history = st.messages.filter((m) => m.content);
    let started = false;
    let heard = "";
    let pending = "";
    try {
      for await (const chunk of streamChat(
        {
          persona_id: st.personaId,
          messages: history,
          difficulty: st.difficulty,
          context: st.jobAd.trim() || undefined,
        },
        ctrl.signal,
      )) {
        if (!started) {
          started = true;
          useSession.getState().addMessage({ role: "assistant", content: "" });
        }
        useSession.getState().appendToLast(chunk);
        heard += chunk;
        setCaption({ who: "her", text: heard });
        // Speak each sentence as soon as it is complete.
        pending += chunk;
        let next = takeSentence(pending);
        while (next) {
          speech.enqueue(next[0]);
          pending = next[1];
          next = takeSentence(pending);
        }
      }
      if (pending.trim()) speech.enqueue(pending.trim());
      streamDone.current = true;
      if (!speech.active) fns.current.finishReply(); // nothing was queued, or it already finished
    } catch {
      if (ctrl.signal.aborted) return;
      speech.stop();
      streamDone.current = true;
      setPhase("error");
    }
  }

  async function handleEnd(blob: Blob | null) {
    if (!blob) {
      startListening(); // you tapped "send now" before saying anything
      return;
    }
    setPhase("transcribing");
    try {
      const text = (await transcribe(blob)).trim();
      if (!mounted.current) return;
      if (!text) {
        setNote("I didn't catch that. Go ahead, I'm listening.");
        startListening();
        return;
      }
      useSession.getState().addMessage({ role: "user", content: text });
      setCaption({ who: "you", text });
      await respond();
    } catch (e) {
      if (!mounted.current) return;
      setNote((e as Error).message);
      startListening();
    }
  }

  useEffect(() => {
    fns.current = { finishReply: startListening, handleEnd };
  });

  function interrupt() {
    abortRef.current?.abort();
    streamDone.current = false; // stopping the voice must not look like "she finished"
    speech.stop();
    streamDone.current = true;
    startListening();
  }

  async function begin() {
    setNote("");
    try {
      listener.setFloorHint(profileRef.current?.mic.noise_floor ?? 0);
      let saved: string | undefined;
      try {
        saved = localStorage.getItem("ig-mic") || undefined;
      } catch {}
      await listener.open(saved);
    } catch {
      setPhase("blocked");
      return;
    }
    if (useSession.getState().messages.length === 0) await respond();
    else startListening();
  }

  function tapOrb() {
    switch (phase) {
      case "idle":
      case "blocked":
        void begin();
        break;
      case "listening":
      case "pause":
        listener.endNow(); // send now
        break;
      case "thinking":
      case "speaking":
        interrupt();
        break;
      case "error":
        void respond();
        break;
      default:
        break;
    }
  }

  function toggleMute() {
    if (mutedRef.current) {
      mutedRef.current = false;
      setMuted(false);
      if (phase === "muted") startListening();
      return;
    }
    mutedRef.current = true;
    setMuted(true);
    if (phase === "listening" || phase === "pause") {
      listener.cancelTurn();
      setPhase("muted");
    }
  }

  const copy: Record<OrbPhase, [string, string]> = {
    idle: ["Tap the orb to begin", `${persona.name} will say hello, then it is your turn.`],
    listening: ["Listening", "Just talk. There is no rush."],
    pause: ["Still listening. Take your time.", "I'll send it after 4 seconds of quiet. Tap the orb to send now."],
    transcribing: ["Writing it down", "One moment."],
    thinking: ["Thinking", `${persona.name} is working out her reply. Tap the orb to skip.`],
    speaking: [`${persona.name} is speaking`, "Tap the orb any time to interrupt her."],
    muted: ["Mic is muted", "Tap Unmute to carry on."],
    blocked: ["Microphone is blocked", "Allow it from the lock icon in the address bar, then tap the orb. Or use Chat view to type."],
    error: ["Couldn't reach the local model", "Check that Ollama and the backend are running, then tap the orb to try again."],
  };
  const [label, sub] = copy[phase];
  const orbLabel =
    phase === "idle" || phase === "blocked"
      ? "Start voice mode"
      : phase === "listening" || phase === "pause"
        ? "Send now"
        : phase === "speaking" || phase === "thinking"
          ? "Interrupt"
          : phase === "error"
            ? "Try again"
            : label;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between gap-3 px-4 py-4 sm:px-10">
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
            <div className="text-[13px] capitalize text-muted">{s.difficulty} · Voice mode</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link
            href="/report"
            onClick={() => s.setReport(null)}
            className="press flex min-h-11 items-center rounded-xl border border-line bg-surface px-4.5 text-ink"
          >
            End session
          </Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[720px] flex-1 flex-col items-center justify-center gap-6 px-5 pb-6">
        <Orb phase={phase} label={orbLabel} onTap={tapOrb} levelRef={levelRef} pauseMs={PAUSE_MS} />

        <div className="flex min-h-[72px] flex-col items-center gap-1.5 text-center" role="status" aria-live="polite">
          <div className="text-[22px] font-medium">{label}</div>
          <div className="max-w-[460px] text-sm text-muted">{sub}</div>
          {note && <div className="text-[13px] text-muted">{note}</div>}
          {phase === "idle" && betterModelMissing && (
            <Link href="/settings" className="mt-1 text-[13px] text-accent-text underline">
              For better accuracy, download the recommended voice model in Settings
            </Link>
          )}
          {phase === "idle" && !hasProfile && (
            <Link href="/voice-setup" className="mt-1 text-[13px] text-accent-text underline">
              Set up your voice for better accuracy (about 2 minutes)
            </Link>
          )}
        </div>

        <div className="min-h-[96px] w-full text-center text-xl leading-normal">
          {caption && (
            <span className={caption.who === "you" ? "text-muted" : "text-ink"}>
              {caption.who === "you" ? `You: ${caption.text}` : caption.text}
            </span>
          )}
        </div>
      </main>

      <div className="flex justify-center gap-10 px-4 pb-9 pt-2">
        <button
          type="button"
          onClick={toggleMute}
          aria-pressed={muted}
          className="press flex min-w-[72px] flex-col items-center gap-2 text-ink"
        >
          <span
            className={`flex h-14 w-14 items-center justify-center rounded-full border ${
              muted ? "border-transparent bg-try-bg text-try-ink" : "border-line bg-surface"
            }`}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="9" y="3" width="6" height="11" rx="3" />
              <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
              {muted && <path d="M4 4l16 16" />}
            </svg>
          </span>
          <span className="text-[13px] text-muted">{muted ? "Unmute" : "Mute"}</span>
        </button>
        <Link href="/session" className="press flex min-w-[72px] flex-col items-center gap-2 text-ink">
          <span className="flex h-14 w-14 items-center justify-center rounded-full border border-line bg-surface">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 5h16v11H9l-5 4z" />
            </svg>
          </span>
          <span className="text-[13px] text-muted">Chat view</span>
        </Link>
      </div>
    </div>
  );
}
