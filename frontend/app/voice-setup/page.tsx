"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  deleteProfile,
  downloadSttModel,
  getSttModels,
  saveProfile,
  testTranscribe,
  type SttModel,
} from "@/lib/api";
import { VoiceListener } from "@/lib/voice";
import { align } from "@/lib/wer";

// Sentences the person reads aloud. Plain work talk with names, numbers and a contraction,
// so the test covers what the app will really hear.
const SENTENCES = [
  "I led a small project at my last job and we shipped it two weeks early.",
  "The weekly report took our team a whole day to build.",
  "I wrote a script that pulled the data automatically.",
  "My manager asked me to improve the onboarding process.",
  "We reduced the average response time from three hours to forty minutes.",
  "I'd say my biggest strength is staying calm under pressure.",
  "Thanks for your time, I'm really keen on this role.",
  "Could you tell me more about how the team works day to day?",
];

type Step = "mic" | "read" | "test" | "words" | "done";
const STEPS: { id: Step; label: string }[] = [
  { id: "mic", label: "Microphone" },
  { id: "read", label: "Read aloud" },
  { id: "test", label: "Accuracy" },
  { id: "words", label: "Your words" },
];

type Row = { name: string; accuracy: number; seconds: number; transcripts: string[] };
type MicVerdict = { kind: "good" | "quiet" | "noisy"; floor: number; text: string };

const p90 = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length * 0.9)] : 0);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function VoiceSetupPage() {
  const [step, setStep] = useState<Step>("mic");

  // Microphone
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [micReady, setMicReady] = useState(false);
  const [measuring, setMeasuring] = useState<"" | "quiet" | "speak">("");
  const [verdict, setVerdict] = useState<MicVerdict | null>(null);
  const [micError, setMicError] = useState("");

  // Read aloud
  const [idx, setIdx] = useState(0);
  const [clips, setClips] = useState<(Blob | null)[]>(() => SENTENCES.map(() => null));
  const [recording, setRecording] = useState(false);
  const [readNote, setReadNote] = useState("");

  // Accuracy test
  const [models, setModels] = useState<SttModel[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [progress, setProgress] = useState("");
  const [testError, setTestError] = useState("");
  const [chosen, setChosen] = useState<string | null>(null);

  // Words
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [vocab, setVocab] = useState("");

  // Save
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");

  const meterRef = useRef<HTMLDivElement>(null);
  const samples = useRef<number[] | null>(null);
  const idxRef = useRef(0);
  const mounted = useRef(true);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);
  const clipEnd = useRef<(blob: Blob | null) => void>(() => {});
  const [listener] = useState(() => new VoiceListener(1500));

  useEffect(() => {
    idxRef.current = idx;
    clipEnd.current = (blob) => {
      if (!mounted.current) return;
      setRecording(false);
      if (!blob) {
        setReadNote("I didn't hear anything. Try again, a little closer to the microphone.");
        return;
      }
      setReadNote("");
      setClips((prev) => prev.map((c, i) => (i === idxRef.current ? blob : c)));
    };
  });

  useEffect(() => {
    mounted.current = true;
    listener.configure({
      onLevel: (level, rms) => {
        if (meterRef.current) meterRef.current.style.transform = `scaleX(${level})`;
        samples.current?.push(rms);
      },
      onQuiet: () => {},
      onEnd: (blob) => clipEnd.current(blob),
    });
    return () => {
      mounted.current = false;
      if (poll.current) clearInterval(poll.current);
      listener.close();
    };
  }, [listener]);

  // ---------- Step 1: microphone ----------
  async function openMic(id?: string) {
    setMicError("");
    listener.close();
    try {
      await listener.open(id || undefined);
    } catch {
      setMicReady(false);
      setMicError("The microphone is blocked. Allow it from the lock icon in the address bar, then try again.");
      return;
    }
    const all = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "audioinput");
    setDevices(all);
    setMicReady(true);
    setVerdict(null);
  }

  async function collect(kind: "quiet" | "speak", ms: number) {
    samples.current = [];
    setMeasuring(kind);
    await sleep(ms);
    const out = samples.current ?? [];
    samples.current = null;
    setMeasuring("");
    return out;
  }

  async function checkMic() {
    const quiet = await collect("quiet", 2500);
    const talk = await collect("speak", 3500);
    const floor = p90(quiet);
    const voice = p90(talk);
    let result: MicVerdict;
    if (voice < 0.04) {
      result = { kind: "quiet", floor, text: "Your voice is coming through quietly. Move closer, or raise the microphone volume in Windows sound settings." };
    } else if (floor > 0.02 || voice / Math.max(floor, 0.001) < 5) {
      result = { kind: "noisy", floor, text: "There's some background noise. A quieter room or a headset will help it hear you." };
    } else {
      result = { kind: "good", floor, text: "Clear and quiet. That's a good setup." };
    }
    if (mounted.current) setVerdict(result);
  }

  // ---------- Step 2: read aloud ----------
  function record() {
    setReadNote("");
    setRecording(true);
    listener.startTurn();
  }

  function stopRecording() {
    listener.endNow();
  }

  // ---------- Step 3: accuracy test ----------
  async function runModel(name: string) {
    const transcripts: string[] = [];
    let wer = 0;
    const times: number[] = [];
    for (let i = 0; i < SENTENCES.length; i++) {
      const clip = clips[i];
      if (!clip) continue;
      setProgress(`Testing ${name}: sentence ${i + 1} of ${SENTENCES.length}…`);
      const res = await testTranscribe(clip, name);
      transcripts[i] = res.text;
      wer += align(SENTENCES[i], res.text).wer;
      times.push(res.seconds);
    }
    const done = clips.filter(Boolean).length || 1;
    // The first clip includes loading the model, so leave it out of the speed figure.
    const timed = times.length > 2 ? times.slice(1) : times;
    const row: Row = {
      name,
      accuracy: Math.max(0, 1 - wer / done),
      seconds: timed.reduce((a, b) => a + b, 0) / Math.max(timed.length, 1),
      transcripts,
    };
    if (mounted.current) setRows((prev) => [...prev.filter((r) => r.name !== name), row]);
  }

  async function startTest() {
    setStep("test");
    setTestError("");
    setRows([]);
    setChosen(null);
    try {
      const list = await getSttModels();
      setModels(list);
      for (const m of list.filter((x) => x.installed)) await runModel(m.name);
    } catch (e) {
      setTestError((e as Error).message);
    }
    setProgress("");
  }

  function downloadAndTest(name: string) {
    setTestError("");
    downloadSttModel(name)
      .then(() => {
        poll.current = setInterval(async () => {
          try {
            const list = await getSttModels();
            if (!mounted.current) return;
            setModels(list);
            const m = list.find((x) => x.name === name);
            if (m && (m.installed || m.error)) {
              if (poll.current) clearInterval(poll.current);
              if (m.error) setTestError(m.error);
              else {
                try {
                  await runModel(name);
                } catch (e) {
                  setTestError((e as Error).message);
                }
                setProgress("");
              }
            }
          } catch {
            /* keep polling */
          }
        }, 2500);
      })
      .catch((e) => setTestError((e as Error).message));
  }

  // The most accurate model that answers quickly enough for a conversation.
  const quickEnough = rows.filter((r) => r.seconds <= 8);
  const pool = quickEnough.length ? quickEnough : rows;
  const recommended = pool.length
    ? [...pool].sort((a, b) => b.accuracy - a.accuracy || a.seconds - b.seconds)[0].name
    : null;
  const useModel = chosen ?? recommended;
  const busy = progress !== "" || models.some((m) => m.downloading);

  // ---------- Step 4: words ----------
  const useRow = rows.find((r) => r.name === useModel);
  const suggestions: { heard: string; meant: string }[] = [];
  if (useRow) {
    SENTENCES.forEach((sentence, i) => {
      if (!useRow.transcripts[i]) return;
      for (const s of align(sentence, useRow.transcripts[i]).swaps) {
        const ok = /^[a-z]{3,}$/.test(s.heard) && /^[a-z]{3,}$/.test(s.meant);
        if (ok && !suggestions.some((x) => x.heard === s.heard)) suggestions.push(s);
      }
    });
  }

  async function save() {
    setSaving(true);
    setSaveError("");
    try {
      const corrections: Record<string, string> = {};
      suggestions.filter((s) => picked[s.heard]).forEach((s) => (corrections[s.heard] = s.meant));
      await saveProfile({
        calibrated_at: new Date().toISOString(),
        mic: { label: devices.find((d) => d.deviceId === deviceId)?.label || "Default microphone", noise_floor: verdict?.floor ?? 0 },
        stt_model: useModel,
        vocabulary: vocab.split(/[,\n]/).map((w) => w.trim()).filter(Boolean),
        corrections,
        results: rows.map((r) => ({ model: r.name, accuracy: Math.round(r.accuracy * 1000) / 1000, seconds_per_clip: Math.round(r.seconds * 10) / 10 })),
      });
      try {
        localStorage.setItem("ig-mic", deviceId);
        localStorage.removeItem("ig-voice-setup-skipped");
      } catch {}
      setSaved(true);
      setStep("done");
    } catch (e) {
      setSaveError((e as Error).message);
    }
    setSaving(false);
  }

  async function forget() {
    try {
      await deleteProfile();
      localStorage.removeItem("ig-mic");
    } catch {}
    setSaved(false);
    setStep("mic");
  }

  function skip() {
    try {
      localStorage.setItem("ig-voice-setup-skipped", "1");
    } catch {}
  }

  const clipsDone = clips.filter(Boolean).length;
  const stepIndex = STEPS.findIndex((s) => s.id === step);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-4 sm:px-10">
        <Link href="/" className="press flex min-h-11 items-center gap-2 rounded-xl border border-transparent px-2 text-muted">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M19 12H5M11 6l-6 6 6 6" />
          </svg>
          Back
        </Link>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link href="/voice" onClick={skip} className="press flex min-h-11 items-center rounded-xl border border-line bg-surface px-4 text-ink">
            Skip for now
          </Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[680px] flex-1 flex-col gap-6 px-5 pb-14 pt-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-[28px] font-medium leading-tight">Set up your voice</h1>
          <p className="text-muted">
            About two minutes. We check your microphone, test how well it hears you, and save what we learn on this computer.
            Your recordings are not saved.
          </p>
        </div>

        {step !== "done" && (
          <ol className="flex flex-wrap gap-2" aria-label="Steps">
            {STEPS.map((s, i) => (
              <li
                key={s.id}
                aria-current={s.id === step ? "step" : undefined}
                className={`rounded-full px-3.5 py-1.5 text-[13px] ${
                  i < stepIndex ? "bg-worked-bg text-worked-ink" : s.id === step ? "bg-accent text-on-accent" : "border border-line text-muted"
                }`}
              >
                {i + 1}. {s.label}
              </li>
            ))}
          </ol>
        )}

        {step === "mic" && (
          <section className="flex flex-col gap-5 rounded-2xl border border-line bg-surface p-6" aria-label="Microphone check">
            <h2 className="text-lg font-medium">Check your microphone</h2>
            {!micReady ? (
              <>
                <p className="text-sm text-muted">Your browser will ask to use the microphone. The sound stays on this computer.</p>
                <div>
                  <button type="button" onClick={() => openMic(localStorage.getItem("ig-mic") || undefined)} className="press cta min-h-12 rounded-xl bg-accent px-6 font-medium text-on-accent">
                    Allow microphone
                  </button>
                </div>
              </>
            ) : (
              <>
                {devices.length > 1 && (
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="mic" className="text-sm font-medium">
                      Microphone
                    </label>
                    <select
                      id="mic"
                      value={deviceId}
                      onChange={(e) => {
                        setDeviceId(e.target.value);
                        void openMic(e.target.value);
                      }}
                      className="min-h-11 rounded-xl border border-line bg-bg px-3 text-ink"
                    >
                      <option value="">Default</option>
                      {devices.map((d) => (
                        <option key={d.deviceId} value={d.deviceId}>
                          {d.label || "Microphone"}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="flex flex-col gap-2" aria-hidden="true">
                  <div className="h-2 overflow-hidden rounded-full bg-line">
                    <div ref={meterRef} className="h-full origin-left rounded-full bg-accent" style={{ transform: "scaleX(0)" }} />
                  </div>
                </div>
                <div role="status" aria-live="polite" className="min-h-[48px] text-sm">
                  {measuring === "quiet" && <p className="font-medium">Stay quiet for a moment…</p>}
                  {measuring === "speak" && <p className="font-medium">Now say: &ldquo;Hello, this is my interview voice.&rdquo;</p>}
                  {!measuring && verdict && (
                    <p className={verdict.kind === "good" ? "font-medium text-accent-text" : "text-try-ink"}>{verdict.text}</p>
                  )}
                  {!measuring && !verdict && <p className="text-muted">Move around if you like. The bar should react to your voice.</p>}
                </div>
                <div className="flex flex-wrap gap-3">
                  <button type="button" onClick={checkMic} disabled={!!measuring} className="press min-h-12 rounded-xl border border-line px-5 text-ink disabled:opacity-50">
                    {verdict ? "Check again" : "Run the check"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setStep("read")}
                    disabled={!verdict || !!measuring}
                    className="press cta min-h-12 rounded-xl bg-accent px-6 font-medium text-on-accent disabled:opacity-50"
                  >
                    Next: read aloud
                  </button>
                </div>
              </>
            )}
            {micError && <p className="text-sm text-danger">{micError}</p>}
          </section>
        )}

        {step === "read" && (
          <section className="flex flex-col gap-5 rounded-2xl border border-line bg-surface p-6" aria-label="Read aloud">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-medium">
                Sentence {idx + 1} of {SENTENCES.length}
              </h2>
              <span className="text-[13px] text-muted">{clipsDone} recorded</span>
            </div>
            <p className="rounded-xl bg-bg px-4 py-4 text-xl leading-snug">{SENTENCES[idx]}</p>
            <div aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-line">
              <div ref={meterRef} className="h-full origin-left rounded-full bg-accent" style={{ transform: "scaleX(0)" }} />
            </div>
            <div role="status" aria-live="polite" className="min-h-[24px] text-sm text-muted">
              {recording ? "Listening… read the sentence, then pause." : clips[idx] ? "Got it." : readNote || "Press Record, then read the sentence out loud."}
            </div>
            <div className="flex flex-wrap gap-3">
              {recording ? (
                <button type="button" onClick={stopRecording} className="press min-h-12 rounded-xl bg-try-bg px-6 font-medium text-try-ink">
                  Done speaking
                </button>
              ) : (
                <button type="button" onClick={record} className="press cta min-h-12 rounded-xl bg-accent px-6 font-medium text-on-accent">
                  {clips[idx] ? "Record again" : "Record"}
                </button>
              )}
              {idx > 0 && (
                <button type="button" disabled={recording} onClick={() => setIdx(idx - 1)} className="press min-h-12 rounded-xl border border-line px-5 text-ink disabled:opacity-50">
                  Back
                </button>
              )}
              {idx < SENTENCES.length - 1 ? (
                <button type="button" disabled={!clips[idx] || recording} onClick={() => setIdx(idx + 1)} className="press min-h-12 rounded-xl border border-line px-5 text-ink disabled:opacity-50">
                  Next sentence
                </button>
              ) : (
                <button type="button" disabled={clipsDone < 3 || recording} onClick={startTest} className="press cta min-h-12 rounded-xl bg-accent px-6 font-medium text-on-accent disabled:opacity-50">
                  Test accuracy
                </button>
              )}
            </div>
            {clipsDone >= 3 && idx < SENTENCES.length - 1 && (
              <p className="text-[13px] text-muted">
                You can{" "}
                <button type="button" onClick={startTest} className="underline">
                  stop here and test
                </button>{" "}
                with what you&apos;ve recorded. More sentences give a fairer result.
              </p>
            )}
          </section>
        )}

        {step === "test" && (
          <section className="flex flex-col gap-5 rounded-2xl border border-line bg-surface p-6" aria-label="Accuracy test">
            <h2 className="text-lg font-medium">How well does it hear you?</h2>
            <div role="status" aria-live="polite" className="text-sm text-muted">
              {progress || (models.some((m) => m.downloading) ? "Downloading… this can take a few minutes." : rows.length ? "Done. Choose the one you want to use." : "")}
            </div>

            <div className="flex flex-col gap-3">
              {models.map((m) => {
                const row = rows.find((r) => r.name === m.name);
                return (
                  <div key={m.name} className={`flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border px-4 py-3 ${useModel === m.name && row ? "border-accent" : "border-line"}`}>
                    <div className="min-w-[140px] flex-1">
                      <div className="font-medium">
                        {m.label} <span className="text-[13px] font-normal text-muted">({m.name})</span>
                      </div>
                      {row ? (
                        <div className="text-sm text-muted">
                          {Math.round(row.accuracy * 100)}% of words right · about {row.seconds.toFixed(1)}s per sentence
                        </div>
                      ) : m.installed ? (
                        <div className="text-sm text-muted">{progress ? "Waiting…" : "Not tested yet"}</div>
                      ) : (
                        <div className="text-sm text-muted">Not installed · {m.size}</div>
                      )}
                    </div>
                    {row && recommended === m.name && (
                      <span className="rounded-full bg-worked-bg px-2.5 py-0.5 text-xs font-medium text-worked-ink">Recommended</span>
                    )}
                    {row && (
                      <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
                        <input
                          type="radio"
                          name="model"
                          checked={useModel === m.name}
                          onChange={() => setChosen(m.name)}
                          className="h-4 w-4 accent-[var(--accent-text)]"
                        />
                        Use this
                      </label>
                    )}
                    {!m.installed && (
                      <button
                        type="button"
                        onClick={() => downloadAndTest(m.name)}
                        disabled={busy || rows.length === 0}
                        className="press min-h-11 rounded-xl border border-line px-4 text-sm text-ink disabled:opacity-50"
                      >
                        {m.downloading ? "Downloading…" : `Download and test`}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="text-[13px] text-muted">
              Bigger models are usually more accurate but slower to answer. Anything much over a few seconds per sentence will feel slow in a conversation.
            </p>
            {testError && <p className="text-sm text-danger">{testError}</p>}
            <div className="flex flex-wrap gap-3">
              <button type="button" onClick={() => setStep("read")} disabled={busy} className="press min-h-12 rounded-xl border border-line px-5 text-ink disabled:opacity-50">
                Record more
              </button>
              <button type="button" onClick={() => setStep("words")} disabled={busy || !useModel} className="press cta min-h-12 rounded-xl bg-accent px-6 font-medium text-on-accent disabled:opacity-50">
                Next: your words
              </button>
            </div>
          </section>
        )}

        {step === "words" && (
          <section className="flex flex-col gap-6 rounded-2xl border border-line bg-surface p-6" aria-label="Your words">
            <div className="flex flex-col gap-2">
              <h2 className="text-lg font-medium">Words it should know</h2>
              <p className="text-sm text-muted">
                Names, tools and terms you use. They are listened for in every answer. Separate them with commas.
              </p>
              <label htmlFor="vocab" className="sr-only">
                Names, tools and terms
              </label>
              <textarea
                id="vocab"
                rows={3}
                value={vocab}
                onChange={(e) => setVocab(e.target.value)}
                placeholder="For example: your name, Kubernetes, Salesforce, Priya"
                className="resize-none rounded-xl border border-line bg-bg px-3.5 py-3 text-ink outline-none placeholder:text-muted"
              />
            </div>

            <div className="flex flex-col gap-2">
              <h2 className="text-lg font-medium">Mistakes in the test</h2>
              {suggestions.length === 0 ? (
                <p className="text-sm text-muted">It got every word it was checked on. Nothing to fix.</p>
              ) : (
                <>
                  <p className="text-sm text-muted">
                    Tick any you want fixed automatically. A fix applies everywhere, so leave it unticked if the word it heard is also a real word you might say.
                  </p>
                  <ul className="flex flex-col gap-2">
                    {suggestions.map((s) => (
                      <li key={s.heard}>
                        <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-line px-4">
                          <input
                            type="checkbox"
                            checked={!!picked[s.heard]}
                            onChange={(e) => setPicked({ ...picked, [s.heard]: e.target.checked })}
                            className="h-4 w-4 accent-[var(--accent-text)]"
                          />
                          <span>
                            Heard <b className="font-medium">&ldquo;{s.heard}&rdquo;</b>, you said <b className="font-medium">&ldquo;{s.meant}&rdquo;</b>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
            {saveError && <p className="text-sm text-danger">{saveError}</p>}
            <div className="flex flex-wrap gap-3">
              <button type="button" onClick={() => setStep("test")} className="press min-h-12 rounded-xl border border-line px-5 text-ink">
                Back
              </button>
              <button type="button" onClick={save} disabled={saving} className="press cta min-h-12 rounded-xl bg-accent px-6 font-medium text-on-accent disabled:opacity-50">
                {saving ? "Saving…" : "Save my voice setup"}
              </button>
            </div>
          </section>
        )}

        {step === "done" && saved && (
          <section className="flex flex-col gap-5 rounded-2xl border border-line bg-surface p-6" aria-label="Done">
            <h2 className="text-lg font-medium">Your voice setup is saved</h2>
            <ul className="flex flex-col gap-1.5 text-sm text-muted">
              <li>Model: {useModel}</li>
              <li>Words it listens for: {vocab.split(/[,\n]/).filter((w) => w.trim()).length}</li>
              <li>Fixes applied: {suggestions.filter((s) => picked[s.heard]).length}</li>
            </ul>
            <p className="text-sm text-muted">
              It&apos;s kept in one file on this computer. You can delete it any time below, and run this setup again whenever you change microphone.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/voice" className="press cta flex min-h-12 items-center rounded-xl bg-accent px-6 font-medium text-on-accent">
                Start voice practice
              </Link>
              <button type="button" onClick={forget} className="press min-h-12 rounded-xl border border-line px-5 text-danger">
                Delete my voice profile
              </button>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
