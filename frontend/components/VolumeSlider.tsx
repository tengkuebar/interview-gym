"use client";

import { useEffect, useId } from "react";
import { useSession } from "@/lib/store";

export function VolumeSlider() {
  const id = useId();
  const volume = useSession((s) => s.volume);
  const setVolume = useSession((s) => s.setVolume);

  // Restore the saved level once. localStorage can be unavailable, so this is best effort.
  useEffect(() => {
    try {
      const saved = localStorage.getItem("ig-volume");
      if (saved !== null && !Number.isNaN(Number(saved))) setVolume(Number(saved));
    } catch {}
  }, [setVolume]);

  const pct = Math.round(volume * 100);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium">
          Voice volume
        </label>
        <span className="text-[13px] tabular-nums text-muted" aria-hidden="true">
          {pct === 0 ? "Muted" : `${pct}%`}
        </span>
      </div>
      <div className="flex items-center gap-2.5">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--ink-muted)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M11 5L6 9H3v6h3l5 4z" />
          {pct === 0 ? <path d="M16 9l5 6M21 9l-5 6" /> : <path d="M15.5 8.5a5 5 0 0 1 0 7" />}
        </svg>
        <input
          id={id}
          type="range"
          min={0}
          max={100}
          step={5}
          value={pct}
          onChange={(e) => setVolume(Number(e.target.value) / 100)}
          aria-valuetext={pct === 0 ? "Muted" : `${pct} percent`}
          className="h-11 w-full cursor-pointer accent-[var(--accent-text)]"
        />
      </div>
    </div>
  );
}
