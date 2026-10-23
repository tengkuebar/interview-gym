"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { deleteSession, getSession, type SessionDetail } from "@/lib/api";
import { formatWhen } from "@/lib/format";
import { ReportView } from "./ReportView";

type Load = { state: "loading" } | { state: "error"; message: string } | { state: "ready"; data: SessionDetail };

export function HistoryDetail({ id }: { id: string }) {
  const router = useRouter();
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getSession(id)
      .then((data) => setLoad({ state: "ready", data }))
      .catch((e: Error) => setLoad({ state: "error", message: e.message }));
  }, [id]);

  async function remove() {
    try {
      await deleteSession(id);
      router.push("/history");
    } catch (e) {
      setError((e as Error).message);
      setConfirming(false);
    }
  }

  if (load.state === "loading") {
    return (
      <div className="flex items-center gap-2 text-sm text-muted" aria-live="polite">
        <span className="dot" />
        <span className="dot" />
        <span className="dot" />
        <span className="ml-1.5">Opening your session</span>
      </div>
    );
  }

  if (load.state === "error") {
    return (
      <div className="flex flex-col items-start gap-3">
        <h1 className="text-[28px] font-medium leading-tight">Couldn&apos;t open that session</h1>
        <p className="text-danger">{load.message}</p>
        <Link href="/history" className="press flex min-h-11 items-center rounded-xl border border-line bg-surface px-4 text-ink">
          Back to history
        </Link>
      </div>
    );
  }

  const { data } = load;

  return (
    <>
      <Link href="/history" className="press -mb-4 flex min-h-11 w-fit items-center gap-1.5 rounded-xl border border-transparent pr-3 text-muted">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M19 12H5M11 6l-6 6 6 6" />
        </svg>
        All sessions
      </Link>

      {data.report ? (
        <ReportView report={data.report} />
      ) : (
        <div className="flex flex-col gap-2">
          <h1 className="text-[28px] font-medium leading-tight">No feedback was saved for this one</h1>
          <p className="text-muted">The conversation is below.</p>
        </div>
      )}

      <section aria-labelledby="convo" className="flex flex-col gap-3">
        <details className="group rounded-2xl border border-line bg-surface">
          <summary className="press flex min-h-12 cursor-pointer list-none items-center justify-between rounded-2xl px-5 py-3 font-medium">
            <span id="convo">The conversation</span>
            <span className="text-[13px] font-normal text-muted">{formatWhen(data.created_at)}</span>
          </summary>
          <div className="flex flex-col gap-3 border-t border-line px-5 py-4">
            {data.messages.map((m, i) => (
              <div key={i} className="flex flex-col gap-0.5">
                <span className="text-xs font-medium tracking-wide text-muted">
                  {m.role === "assistant" ? data.persona_name : "You"}
                </span>
                <span>{m.content}</span>
              </div>
            ))}
          </div>
        </details>
      </section>

      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-6">
        <Link href="/" className="press cta flex min-h-12 items-center rounded-xl bg-accent px-6 text-base font-medium text-on-accent">
          Practise again
        </Link>
        {confirming ? (
          <div className="flex items-center gap-2" role="group" aria-label="Confirm delete">
            <span className="text-sm text-muted">Delete this session?</span>
            <button type="button" onClick={remove} className="press min-h-11 rounded-xl border border-line bg-surface px-4 text-danger">
              Delete
            </button>
            <button type="button" onClick={() => setConfirming(false)} className="press min-h-11 rounded-xl border border-transparent px-3 text-muted">
              Keep
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirming(true)} className="press min-h-11 rounded-xl border border-transparent px-3 text-sm text-muted">
            Delete this session
          </button>
        )}
        {error && <span className="text-sm text-danger">{error}</span>}
      </div>
    </>
  );
}
