import type { Ref } from "react";

export type OrbPhase =
  | "idle"
  | "listening"
  | "pause" // you stopped talking; the 4 second countdown is running
  | "transcribing"
  | "thinking"
  | "speaking"
  | "muted"
  | "blocked"
  | "error";

type Props = {
  phase: OrbPhase;
  label: string; // accessible name of the orb button
  onTap: () => void;
  levelRef: Ref<HTMLSpanElement>; // the page sets its transform from the microphone level
  pauseMs: number;
};

const CIRCUMFERENCE = 779; // 2 * pi * 124

export function Orb({ phase, label, onTap, levelRef, pauseMs }: Props) {
  const visual = phase === "pause" ? "listening" : phase === "transcribing" ? "thinking" : phase;
  // The ring starts after 0.8 s of quiet (see lib/voice.ts), so it begins already 0.8 s in.
  const countStyle = { animationDuration: `${pauseMs}ms`, animationDelay: "-800ms" };

  return (
    <div className="relative flex h-[280px] w-[280px] items-center justify-center">
      {phase === "pause" && (
        <svg width="280" height="280" viewBox="0 0 280 280" aria-hidden="true" className="absolute inset-0 -rotate-90">
          <circle cx="140" cy="140" r="124" fill="none" stroke="var(--line)" strokeWidth="3" />
          <circle
            className="orb-count"
            cx="140"
            cy="140"
            r="124"
            fill="none"
            stroke="var(--accent-text)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            style={countStyle}
          />
        </svg>
      )}
      {(phase === "thinking" || phase === "transcribing") && (
        <div className="orb-spin absolute inset-0" aria-hidden="true">
          <span className="absolute left-1/2 top-[6px] -ml-[5px] h-[10px] w-[10px] rounded-full bg-accent-text" />
        </div>
      )}
      <button
        type="button"
        onClick={onTap}
        aria-label={label}
        className="press relative h-[216px] w-[216px] rounded-full border-0 p-0"
        data-phase={visual}
      >
        {phase === "listening" && (
          <>
            <span className="orb-ring" />
            <span className="orb-ring" style={{ animationDelay: "0.8s" }} />
            <span className="orb-ring" style={{ animationDelay: "1.6s" }} />
          </>
        )}
        <span ref={levelRef} className="orb-level">
          <span className="orb-core">
            <span className="orb-blob" />
            <span className="orb-blob b2" />
            <span className="orb-blob b3" />
          </span>
        </span>
        {phase === "muted" && (
          <span className="absolute inset-0 flex items-center justify-center text-muted" aria-hidden="true">
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="3" width="6" height="11" rx="3" />
              <path d="M5 11a7 7 0 0 0 14 0M12 18v3M4 4l16 16" />
            </svg>
          </span>
        )}
      </button>
    </div>
  );
}
