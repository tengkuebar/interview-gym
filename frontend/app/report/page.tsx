"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { ReportProgress } from "@/components/ReportProgress";
import { ReportView } from "@/components/ReportView";
import { getReport } from "@/lib/api";
import { useSession } from "@/lib/store";

type Phase = "loading" | "error";

const primaryBtn =
  "press cta inline-flex min-h-12 items-center rounded-xl bg-accent px-6 text-base font-medium text-on-accent";

export default function ReportPage() {
  const messages = useSession((s) => s.messages);
  const report = useSession((s) => s.report);
  const resetSession = useSession((s) => s.resetSession);
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const requested = useRef(-1);

  const answers = messages.filter((m) => m.role === "user").length;
  const tooShort = answers < 2;

  useEffect(() => {
    if (tooShort || report || requested.current === attempt) return;
    requested.current = attempt;
    const s = useSession.getState();
    getReport({
      persona_id: s.personaId,
      messages: s.messages.filter((m) => m.content),
      difficulty: s.difficulty,
      context: s.jobAd.trim() || undefined,
    })
      .then((r) => useSession.getState().setReport(r))
      .catch((e: Error) => {
        setError(e.message);
        setPhase("error");
      });
  }, [attempt, report, tooShort]);

  function retry() {
    setPhase("loading");
    setAttempt((a) => a + 1);
  }

  if (tooShort) {
    return (
      <div className="flex min-h-screen flex-col">
        <AppHeader />
        <main className="mx-auto flex w-full max-w-[760px] flex-col gap-4 px-6 py-16">
          <h1 className="text-[28px] font-medium leading-tight">Not quite enough to go on yet</h1>
          <p className="max-w-[560px] text-muted">
            Answer at least two questions and the coach will have something to read back. There&apos;s no
            rush. Your conversation is still here.
          </p>
          <div>
            <Link href="/session" className={primaryBtn}>
              Back to the conversation
            </Link>
          </div>
        </main>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="flex min-h-screen flex-col">
        <AppHeader />
        <main className="mx-auto flex w-full max-w-[760px] flex-col gap-4 px-6 py-16" aria-live="polite">
          {phase === "error" ? (
            <>
              <h1 className="text-[28px] font-medium leading-tight">The coach hit a snag</h1>
              <p className="max-w-[560px] text-danger">{error}</p>
              <div>
                <button type="button" onClick={retry} className={primaryBtn}>
                  Try again
                </button>
              </div>
            </>
          ) : (
            <>
              <h1 className="text-[28px] font-medium leading-tight">Putting your feedback together</h1>
              <p className="text-muted">This usually takes 15 to 25 seconds. No need to do anything.</p>
              <ReportProgress key={attempt} />
            </>
          )}
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader />
      <main className="mx-auto flex w-full max-w-[760px] flex-col gap-8 px-5 pb-16 pt-10 sm:px-6 sm:pt-12">
        <ReportView
          report={report}
          actions={
            <>
              <Link href="/session" onClick={() => resetSession()} className={primaryBtn}>
                Practise again
              </Link>
              <Link href="/" className="press flex min-h-12 items-center rounded-xl border border-line bg-surface px-5 text-ink">
                Try a different person
              </Link>
              {report.session_id && (
                <Link
                  href={`/history/session?id=${report.session_id}`}
                  className="press flex min-h-12 items-center px-3 text-muted"
                >
                  Saved to your history
                </Link>
              )}
            </>
          }
        />
      </main>
    </div>
  );
}
