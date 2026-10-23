"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { deleteAllSessions, deleteSession, listSessions, type SessionSummary } from "@/lib/api";
import { formatWhen } from "@/lib/format";

type Load = { state: "loading" } | { state: "error"; message: string } | { state: "ready"; items: SessionSummary[] };

export default function HistoryPage() {
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [confirming, setConfirming] = useState<string | "all" | null>(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    listSessions()
      .then((items) => setLoad({ state: "ready", items }))
      .catch((e: Error) => setLoad({ state: "error", message: e.message }));
  }, []);

  async function remove(id: string) {
    try {
      await deleteSession(id);
      setLoad((l) => (l.state === "ready" ? { state: "ready", items: l.items.filter((i) => i.id !== id) } : l));
      setNote("Session deleted.");
    } catch (e) {
      setNote((e as Error).message);
    }
    setConfirming(null);
  }

  async function removeAll() {
    try {
      await deleteAllSessions();
      setLoad({ state: "ready", items: [] });
      setNote("Your history has been cleared.");
    } catch (e) {
      setNote((e as Error).message);
    }
    setConfirming(null);
  }

  const items = load.state === "ready" ? load.items : [];

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader current="history" />
      <main className="mx-auto flex w-full max-w-[760px] flex-col gap-6 px-5 pb-16 pt-10 sm:px-6 sm:pt-12">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-1.5">
            <h1 className="text-[28px] font-medium leading-tight sm:text-[32px]">Your practice history</h1>
            <p className="text-muted">Saved on this device only. Delete anything, any time.</p>
          </div>
          {items.length > 1 &&
            (confirming === "all" ? (
              <div className="flex items-center gap-2" role="group" aria-label="Confirm clearing history">
                <span className="text-sm text-muted">Delete all {items.length} sessions?</span>
                <button type="button" onClick={removeAll} className="press min-h-11 rounded-xl border border-line bg-surface px-4 text-danger">
                  Delete all
                </button>
                <button type="button" onClick={() => setConfirming(null)} className="press min-h-11 rounded-xl border border-transparent px-3 text-muted">
                  Keep
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => setConfirming("all")} className="press min-h-11 rounded-xl border border-transparent px-3 text-sm text-muted">
                Clear all history
              </button>
            ))}
        </div>

        <p role="status" aria-live="polite" className="min-h-5 text-[13px] text-muted">
          {note}
        </p>

        {load.state === "loading" && (
          <div className="flex items-center gap-2 text-sm text-muted" aria-live="polite">
            <span className="dot" />
            <span className="dot" />
            <span className="dot" />
            <span className="ml-1.5">Loading your sessions</span>
          </div>
        )}

        {load.state === "error" && (
          <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5">
            <p className="text-danger">{load.message}. Check that the backend is running.</p>
            <div>
              <button
                type="button"
                onClick={() => {
                  setLoad({ state: "loading" });
                  listSessions()
                    .then((i) => setLoad({ state: "ready", items: i }))
                    .catch((e: Error) => setLoad({ state: "error", message: e.message }));
                }}
                className="press min-h-11 rounded-xl border border-line px-4 text-ink"
              >
                Try again
              </button>
            </div>
          </div>
        )}

        {load.state === "ready" && items.length === 0 && (
          <div className="flex flex-col items-start gap-3 rounded-2xl border border-line bg-surface p-6">
            <h2 className="text-lg font-medium">Start your first practice</h2>
            <p className="max-w-[460px] text-muted">
              Finished sessions show up here with their feedback, so you can see how you&apos;re changing over time.
            </p>
            <Link href="/" className="press cta flex min-h-12 items-center rounded-xl bg-accent px-6 font-medium text-on-accent">
              Practise now
            </Link>
          </div>
        )}

        {items.length > 0 && (
          <ul className="flex flex-col gap-3">
            {items.map((s) => (
              <li key={s.id} className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
                  <span>{formatWhen(s.created_at)}</span>
                  <span aria-hidden="true">·</span>
                  <span>
                    {s.persona_role} with {s.persona_name}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="capitalize">{s.difficulty}</span>
                  <span aria-hidden="true">·</span>
                  <span>{s.answers} answers</span>
                </div>
                <div className="text-base font-medium">{s.headline || "Practice session"}</div>
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/history/session?id=${s.id}`}
                    className="press flex min-h-11 items-center rounded-xl border border-line bg-bg px-4 text-ink"
                  >
                    Open feedback
                  </Link>
                  {confirming === s.id ? (
                    <div className="flex items-center gap-2" role="group" aria-label="Confirm delete">
                      <span className="text-sm text-muted">Delete this session?</span>
                      <button type="button" onClick={() => remove(s.id)} className="press min-h-11 rounded-xl border border-line bg-surface px-4 text-danger">
                        Delete
                      </button>
                      <button type="button" onClick={() => setConfirming(null)} className="press min-h-11 rounded-xl border border-transparent px-3 text-muted">
                        Keep
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirming(s.id)}
                      className="press min-h-11 rounded-xl border border-transparent px-3 text-sm text-muted"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
