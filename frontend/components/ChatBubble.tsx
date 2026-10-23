type Props = {
  role: "user" | "assistant";
  initial?: string;
  children: React.ReactNode;
  onPlay?: () => void;
  playing?: boolean;
};

export function ChatBubble({ role, initial, children, onPlay, playing }: Props) {
  if (role === "user") {
    return (
      <div className="bubble-in max-w-[85%] self-end rounded-2xl rounded-br-[6px] bg-accent px-4 py-3 text-base text-on-accent sm:max-w-[80%]">
        {children}
      </div>
    );
  }
  return (
    <div className="bubble-in flex max-w-[92%] items-end gap-2.5 sm:max-w-[80%]">
      <div
        className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-soft text-[13px] font-medium text-accent-text"
        aria-hidden="true"
      >
        {initial}
      </div>
      <div className="rounded-2xl rounded-bl-[6px] border border-line bg-surface px-4 py-3 text-base">
        {children}
      </div>
      {onPlay && (
        <button
          type="button"
          onClick={onPlay}
          aria-label={playing ? "Playing reply" : "Play this reply"}
          className="press flex h-11 w-11 flex-none items-center justify-center rounded-[10px] border border-transparent text-muted sm:h-9 sm:w-9"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M11 5L6 9H3v6h3l5 4zM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />
          </svg>
        </button>
      )}
    </div>
  );
}
