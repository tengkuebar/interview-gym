import Link from "next/link";
import { Logo } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";

export function AppHeader({ current }: { current?: "setup" | "history" | "settings" }) {
  const link = "press flex min-h-11 items-center rounded-[10px] border border-transparent px-3.5";
  return (
    <header className="flex items-center justify-between border-b border-line px-5 py-4 sm:px-10">
      <Link href="/" aria-label="Interview Gym home" className="rounded-lg">
        <Logo />
      </Link>
      <nav aria-label="Main" className="flex items-center gap-1">
        <Link href="/" className={`${link} ${current === "setup" ? "text-ink" : "text-muted"}`} aria-current={current === "setup" ? "page" : undefined}>
          Practice
        </Link>
        <Link href="/history" className={`${link} ${current === "history" ? "text-ink" : "text-muted"}`} aria-current={current === "history" ? "page" : undefined}>
          History
        </Link>
        <Link href="/settings" className={`${link} ${current === "settings" ? "text-ink" : "text-muted"}`} aria-current={current === "settings" ? "page" : undefined}>
          Settings
        </Link>
        <ThemeToggle />
      </nav>
    </header>
  );
}
