"use client";

import { useSyncExternalStore } from "react";
import { AppHeader } from "@/components/AppHeader";
import { HistoryDetail } from "@/components/HistoryDetail";

const subscribe = (cb: () => void) => {
  window.addEventListener("popstate", cb);
  return () => window.removeEventListener("popstate", cb);
};

export default function HistorySessionPage() {
  // null on the server and during hydration, then the id from ?id=
  const id = useSyncExternalStore(
    subscribe,
    () => new URLSearchParams(window.location.search).get("id") ?? "",
    () => null,
  );

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader current="history" />
      <main className="mx-auto flex w-full max-w-[760px] flex-col gap-8 px-5 pb-16 pt-8 sm:px-6 sm:pt-10">
        {id === null ? (
          <p className="text-sm text-muted">Opening your session…</p>
        ) : id === "" ? (
          <p className="text-muted">No session selected. Pick one from your history.</p>
        ) : (
          <HistoryDetail id={id} />
        )}
      </main>
    </div>
  );
}
