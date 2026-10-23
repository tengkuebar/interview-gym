"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import {
  deleteProfile,
  downloadSttModel,
  getProfile,
  getSttModels,
  saveProfile,
  type SttModel,
  type VoiceProfile,
} from "@/lib/api";

export default function SettingsPage() {
  const [models, setModels] = useState<SttModel[] | null>(null);
  const [profile, setProfile] = useState<VoiceProfile | null>(null);
  const [vocab, setVocab] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);

  async function refresh() {
    const [m, p] = await Promise.all([getSttModels(), getProfile()]);
    setModels(m);
    setProfile(p);
    return m;
  }

  useEffect(() => {
    Promise.all([getSttModels(), getProfile()])
      .then(([m, p]) => {
        setModels(m);
        setProfile(p);
        setVocab(p.vocabulary.join(", "));
      })
      .catch(() => setError("Couldn't reach the app's backend. Make sure it's running."));
    return () => {
      if (poll.current) clearInterval(poll.current);
    };
  }, []);

  async function choose(name: string | null) {
    setError("");
    try {
      setProfile(await saveProfile({ stt_model: name }));
      await refresh();
      setNote(name ? "Saved. Your next recording uses it." : "Back to the default.");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function download(name: string) {
    setError("");
    setNote("");
    downloadSttModel(name)
      .then(() => {
        void refresh();
        if (poll.current) clearInterval(poll.current);
        poll.current = setInterval(async () => {
          try {
            const m = await refresh();
            const one = m.find((x) => x.name === name);
            if (one && (one.installed || one.error)) {
              if (poll.current) clearInterval(poll.current);
              if (one.error) setError(one.error);
              else setNote(`${one.label} (${one.name}) is ready.`);
            }
          } catch {
            /* keep polling */
          }
        }, 2500);
      })
      .catch((e) => setError((e as Error).message));
  }

  async function saveVocab() {
    setError("");
    try {
      const words = vocab.split(/[,\n]/).map((w) => w.trim()).filter(Boolean);
      const p = await saveProfile({ vocabulary: words });
      setProfile(p);
      setVocab(p.vocabulary.join(", "));
      setNote("Your words are saved.");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function removeFix(heard: string) {
    if (!profile) return;
    const next = { ...profile.corrections };
    delete next[heard];
    try {
      setProfile(await saveProfile({ corrections: next }));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function forget() {
    try {
      await deleteProfile();
      try {
        localStorage.removeItem("ig-mic");
      } catch {}
      setConfirming(false);
      setVocab("");
      await refresh();
      setNote("Your voice profile is deleted.");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const active = models?.find((m) => m.active);
  const wantedDefault = models?.find((m) => m.default);
  const fallingBack = wantedDefault && !wantedDefault.installed && profile?.stt_model == null;
  const corrections = Object.entries(profile?.corrections ?? {});

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader current="settings" />
      <main className="mx-auto flex w-full max-w-[720px] flex-1 flex-col gap-8 px-5 pb-14 pt-10">
        <div className="flex flex-col gap-2">
          <h1 className="text-[28px] font-medium leading-tight">Settings</h1>
          <p className="text-muted">Everything here is saved on this computer.</p>
        </div>

        <div role="status" aria-live="polite" className="min-h-[22px] text-sm">
          {error ? <span className="text-danger">{error}</span> : note ? <span className="text-accent-text">{note}</span> : null}
        </div>

        <section aria-labelledby="stt" className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-6">
          <div>
            <h2 id="stt" className="text-lg font-medium">
              Speech recognition
            </h2>
            <p className="mt-1 text-sm text-muted">
              How the app turns your voice into words. Bigger models hear more accurately but take longer to answer.
            </p>
          </div>

          {fallingBack && (
            <p className="rounded-xl bg-try-bg px-4 py-3 text-sm text-try-ink">
              The recommended model ({wantedDefault.name}) isn&apos;t downloaded yet, so {active?.name} is being used for now. Download it below
              for better accuracy.
            </p>
          )}

          {!models ? (
            <p className="text-sm text-muted">{error ? "" : "Loading…"}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {models.map((m) => {
                const chosen = m.active;
                return (
                  <li
                    key={m.name}
                    className={`flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border px-4 py-3 ${chosen ? "border-accent" : "border-line"}`}
                  >
                    <div className="min-w-[160px] flex-1">
                      <div className="flex flex-wrap items-center gap-2 font-medium">
                        {m.label} <span className="text-[13px] font-normal text-muted">({m.name})</span>
                        {m.default && <span className="rounded-full bg-soft px-2 py-0.5 text-xs font-medium text-accent-text">Default</span>}
                        {chosen && <span className="rounded-full bg-worked-bg px-2 py-0.5 text-xs font-medium text-worked-ink">In use</span>}
                      </div>
                      <div className="text-sm text-muted">
                        {m.installed ? "Installed" : m.downloading ? "Downloading… this can take a few minutes" : `Not installed · ${m.size}`}
                      </div>
                    </div>
                    {m.installed && !chosen && (
                      <button type="button" onClick={() => choose(m.name)} className="press min-h-11 rounded-xl border border-line px-4 text-sm text-ink">
                        Use this
                      </button>
                    )}
                    {!m.installed && (
                      <button
                        type="button"
                        onClick={() => download(m.name)}
                        disabled={m.downloading}
                        className="press min-h-11 rounded-xl border border-line px-4 text-sm text-ink disabled:opacity-50"
                      >
                        {m.downloading ? "Downloading…" : `Download (${m.size.replace("about ", "")})`}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          <div className="flex flex-wrap items-center gap-3 text-sm">
            {profile?.stt_model != null && (
              <button type="button" onClick={() => choose(null)} className="press min-h-11 rounded-xl border border-transparent px-2 text-muted underline">
                Go back to the default
              </button>
            )}
            <Link href="/voice-setup" className="press flex min-h-11 items-center rounded-xl border border-transparent px-2 text-accent-text underline">
              Test which model suits your voice
            </Link>
          </div>
        </section>

        <section aria-labelledby="profile" className="flex flex-col gap-5 rounded-2xl border border-line bg-surface p-6">
          <div>
            <h2 id="profile" className="text-lg font-medium">
              Your voice profile
            </h2>
            <p className="mt-1 text-sm text-muted">
              {profile?.calibrated_at
                ? `Set up on ${new Date(profile.calibrated_at).toLocaleDateString()}${profile.mic.label ? ` with ${profile.mic.label}` : ""}.`
                : "Not set up yet. It takes about two minutes and helps it hear you more accurately."}
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="vocab" className="text-sm font-medium">
              Names, tools and terms it should listen for
            </label>
            <textarea
              id="vocab"
              rows={3}
              value={vocab}
              onChange={(e) => setVocab(e.target.value)}
              placeholder="For example: your name, Kubernetes, Salesforce"
              className="resize-none rounded-xl border border-line bg-bg px-3.5 py-3 text-ink outline-none placeholder:text-muted"
            />
            <div>
              <button type="button" onClick={saveVocab} className="press min-h-11 rounded-xl border border-line px-4 text-sm text-ink">
                Save words
              </button>
            </div>
          </div>

          {corrections.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="text-sm font-medium">Automatic fixes</div>
              <ul className="flex flex-col gap-2">
                {corrections.map(([heard, meant]) => (
                  <li key={heard} className="flex items-center justify-between gap-3 rounded-xl border border-line px-4 py-2 text-sm">
                    <span>
                      &ldquo;{heard}&rdquo; becomes &ldquo;{meant}&rdquo;
                    </span>
                    <button type="button" onClick={() => removeFix(heard)} className="press min-h-11 rounded-xl px-3 text-muted underline">
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Link href="/voice-setup" className="press flex min-h-11 items-center rounded-xl border border-line px-4 text-sm text-ink">
              {profile?.calibrated_at ? "Run voice setup again" : "Run voice setup"}
            </Link>
            {profile?.calibrated_at &&
              (confirming ? (
                <span className="flex items-center gap-2 text-sm">
                  Delete your voice profile?
                  <button type="button" onClick={forget} className="press min-h-11 rounded-xl border border-line px-4 text-danger">
                    Yes, delete
                  </button>
                  <button type="button" onClick={() => setConfirming(false)} className="press min-h-11 rounded-xl px-3 text-muted">
                    Keep it
                  </button>
                </span>
              ) : (
                <button type="button" onClick={() => setConfirming(true)} className="press min-h-11 rounded-xl border border-transparent px-3 text-sm text-muted underline">
                  Delete my voice profile
                </button>
              ))}
          </div>
        </section>
      </main>
    </div>
  );
}
