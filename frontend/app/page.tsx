"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { VolumeSlider } from "@/components/VolumeSlider";
import { FALLBACK_PERSONAS, getPersonas, speak, type Difficulty, type Persona } from "@/lib/api";
import { useSession } from "@/lib/store";

const DIFFICULTIES: { id: Difficulty; label: string; blurb: string }[] = [
  { id: "gentle", label: "Gentle", blurb: "Simple questions and plenty of room to think." },
  { id: "realistic", label: "Realistic", blurb: "Follow-up questions, like a real recruiter would ask." },
  { id: "tough", label: "Tough", blurb: "Brisk and sceptical. Expect to be pushed for specifics." },
];

const VOICE_LABELS: Record<string, string> = {
  bf_emma: "Emma, British",
  bm_george: "George, British",
  bf_isabella: "Isabella, British",
};

export default function SetupPage() {
  const [personas, setPersonas] = useState<Persona[]>(FALLBACK_PERSONAS);
  const [preview, setPreview] = useState<"idle" | "loading" | "playing" | "unavailable">("idle");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const s = useSession();

  useEffect(() => {
    getPersonas().then(setPersonas).catch(() => {});
  }, []);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = s.volume;
  }, [s.volume]);

  const persona = personas.find((p) => p.id === s.personaId) ?? personas[0];
  const difficulty = DIFFICULTIES.find((d) => d.id === s.difficulty) ?? DIFFICULTIES[1];

  async function previewVoice() {
    if (preview === "loading") return;
    audioRef.current?.pause();
    setPreview("loading");
    try {
      const blob = await speak(
        `Hi, I'm ${persona.name}. Whenever you're ready, we can get started.`,
        persona.voice,
        persona.speed,
      );
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.volume = useSession.getState().volume;
      audioRef.current = audio;
      audio.onended = () => {
        setPreview("idle");
        URL.revokeObjectURL(url);
      };
      setPreview("playing");
      await audio.play();
    } catch {
      setPreview("unavailable");
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader current="setup" />

      <main className="mx-auto flex w-full max-w-[1160px] flex-wrap items-start gap-10 px-5 pb-14 pt-10 sm:px-10 sm:pt-12">
        <div className="flex min-w-0 flex-[999_1_600px] flex-col gap-9">
          <div className="flex flex-col gap-2">
            <h1 className="text-[28px] font-medium leading-tight sm:text-[32px]">
              What do you want to practise today?
            </h1>
            <p className="max-w-[560px] text-muted">
              Pick who you&apos;ll talk to. Everything stays on this device, and you can stop at any point.
            </p>
          </div>

          <section aria-labelledby="who" className="flex flex-col gap-3.5">
            <h2 id="who" className="text-[13px] font-medium tracking-wide text-muted">
              Who you&apos;ll talk to
            </h2>
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
              {personas.map((p) => {
                const selected = p.id === s.personaId;
                return (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => s.setPersona(p.id)}
                    className={`press flex flex-col gap-3 rounded-2xl bg-surface p-4 text-left ${
                      selected ? "border-2 border-accent-text" : "border border-line"
                    }`}
                    style={selected ? { padding: "15px" } : undefined}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-soft font-medium text-accent-text">
                        {p.name[0]}
                      </div>
                      {selected && (
                        <span className="rounded-full bg-worked-bg px-2.5 py-0.5 text-xs font-medium text-worked-ink">
                          Selected
                        </span>
                      )}
                    </div>
                    <div>
                      <div className="text-base font-medium">{p.name}</div>
                      <div className="text-[13px] text-muted">{p.role}</div>
                    </div>
                    <div className="text-sm text-muted">{p.description}</div>
                  </button>
                );
              })}
            </div>
          </section>

          <section aria-labelledby="diff" className="flex flex-col gap-3.5">
            <h2 id="diff" className="text-[13px] font-medium tracking-wide text-muted">
              How hard should it be
            </h2>
            <div
              role="group"
              aria-label="Difficulty"
              className="inline-flex gap-1 self-start rounded-[14px] border border-line bg-surface p-1"
            >
              {DIFFICULTIES.map((d) => {
                const on = d.id === s.difficulty;
                return (
                  <button
                    key={d.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => s.setDifficulty(d.id)}
                    className={`press min-h-11 rounded-[10px] border-0 px-5 ${
                      on ? "bg-accent font-medium text-on-accent" : "bg-transparent text-muted"
                    }`}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
            <p className="text-sm text-muted">{difficulty.blurb}</p>
          </section>

          <section className="flex flex-col gap-2.5">
            <label htmlFor="jobad" className="text-[13px] font-medium tracking-wide text-muted">
              Job ad <span className="font-normal">(optional)</span>
            </label>
            <textarea
              id="jobad"
              rows={5}
              value={s.jobAd}
              onChange={(e) => s.setJobAd(e.target.value)}
              placeholder={`Paste the job description here and ${persona.name} will tailor the questions to the role.`}
              className="w-full resize-y rounded-[14px] border border-line bg-surface px-4 py-3.5 leading-normal text-ink placeholder:text-muted"
            />
            <p className="text-[13px] text-muted">Stays on this device. Nothing is sent anywhere.</p>
          </section>
        </div>

        <aside className="flex min-w-[300px] max-w-[380px] flex-[1_1_320px] flex-col gap-5 rounded-2xl border border-line bg-surface p-6">
          <h2 className="text-lg font-medium">Your session</h2>
          <dl className="flex flex-col gap-3.5">
            <div className="flex justify-between gap-3">
              <dt className="text-muted">With</dt>
              <dd className="font-medium">
                {persona.name}, {persona.role}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Difficulty</dt>
              <dd className="font-medium">{difficulty.label}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Length</dt>
              <dd className="font-medium">About 10 minutes</dd>
            </div>
          </dl>

          <div className="flex flex-col gap-3 border-t border-line pt-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-medium">{persona.name}&apos;s voice</div>
                <div className="text-[13px] text-muted" aria-live="polite">
                  {preview === "unavailable"
                    ? "Voice isn't available right now"
                    : preview === "loading"
                      ? "Getting a sample…"
                      : (VOICE_LABELS[persona.voice] ?? persona.voice)}
                </div>
              </div>
              <button
                type="button"
                onClick={previewVoice}
                aria-label={`Preview ${persona.name}'s voice`}
                className="press flex h-11 w-11 flex-none items-center justify-center rounded-xl border border-line bg-bg text-accent-text"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M7 5l12 7-12 7z" />
                </svg>
              </button>
            </div>
            <label className="flex cursor-pointer items-center justify-between gap-3">
              <span>Speak replies aloud</span>
              <input
                type="checkbox"
                role="switch"
                checked={s.speakReplies}
                onChange={(e) => s.setSpeakReplies(e.target.checked)}
                className="h-5 w-5 accent-[var(--accent-text)]"
              />
            </label>
            <VolumeSlider />
            <p className="text-[13px] text-muted">Captions are always on. Voice is off until you choose it.</p>
          </div>

          <Link
            href="/voice"
            onClick={() => s.resetSession()}
            className="press cta flex min-h-12 items-center justify-center gap-2 rounded-xl bg-accent text-base font-medium text-on-accent"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="9" y="3" width="6" height="11" rx="3" />
              <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
            </svg>
            Start voice practice
          </Link>
          <Link
            href="/session"
            onClick={() => s.resetSession()}
            className="press flex min-h-12 items-center justify-center rounded-xl border border-line bg-surface text-base text-ink"
          >
            Start with typing instead
          </Link>
          <p className="text-center text-[13px] text-muted">
            Voice mode listens for you to finish, then replies out loud. You can switch to typing, rewind or end any time.
          </p>
        </aside>
      </main>
    </div>
  );
}
