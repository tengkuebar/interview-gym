"use client";

import { useEffect, useState } from "react";

// The coach is a single non-streaming call, so there is no real percentage.
// The bar (see .progress-fill) reaches 90% at 20s and holds; these stages are
// spread across the same 20 seconds. Both are a timing estimate, not live progress.
const STEPS = [
  { label: "Reading back through your answers", at: 0 },
  { label: "Spotting what worked", at: 5 },
  { label: "Choosing one thing to try next", at: 10 },
  { label: "Checking every quote is really yours", at: 15 },
];
const SLOW_AFTER = 28;

export function ReportProgress() {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);

  let current = 0;
  STEPS.forEach((s, i) => {
    if (seconds >= s.at) current = i;
  });

  return (
    <div className="flex max-w-[520px] flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="h-2 overflow-hidden rounded-full bg-line" aria-hidden="true">
          <div className="progress-fill h-full origin-left rounded-full bg-accent" />
        </div>
        <div role="status" aria-live="polite" className="text-sm text-muted">
          {seconds >= SLOW_AFTER
            ? "Taking a little longer than usual. Still working."
            : `${STEPS[current].label}…`}
        </div>
      </div>

      <ol className="flex flex-col gap-2.5" aria-label="Progress">
        {STEPS.map((s, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <li key={s.label} className={`flex items-center gap-3 text-sm ${done || active ? "text-ink" : "text-muted"}`}>
              <span
                className={`flex h-5 w-5 flex-none items-center justify-center rounded-full ${
                  done ? "bg-worked-bg text-worked-ink" : active ? "bg-soft" : "border border-line"
                }`}
                aria-hidden="true"
              >
                {done ? (
                  <svg className="step-in" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12l5 5 9-10" />
                  </svg>
                ) : active ? (
                  <span className="dot" style={{ width: 8, height: 8, background: "var(--accent-text)" }} />
                ) : null}
              </span>
              <span>{s.label}</span>
              <span className="sr-only">{done ? "done" : active ? "in progress" : "waiting"}</span>
            </li>
          );
        })}
      </ol>
      <p className="text-[13px] text-muted">Your answers stay on this device while the coach reads them.</p>
    </div>
  );
}
