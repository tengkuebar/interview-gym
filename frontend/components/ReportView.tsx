import type { Report } from "@/lib/api";

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="text-lg font-medium">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Quote({ children }: { children: React.ReactNode }) {
  return (
    <blockquote className="rounded-[10px] bg-bg px-3.5 py-2.5 text-sm text-muted">&ldquo;{children}&rdquo;</blockquote>
  );
}

export function ReportView({ report, actions }: { report: Report; actions?: React.ReactNode }) {
  const { metrics: m, star, focus_area: focus, rewrite } = report;
  const checkItems = report.checks?.length
    ? report.checks.map((c) => ({ label: c.name, ok: c.met }))
    : star
      ? [
          { label: "Situation", ok: star.situation },
          { label: "Task", ok: star.task },
          { label: "Action", ok: star.action },
          { label: "Result", ok: star.result },
        ]
      : [];
  const checksTitle = report.checks?.length ? (report.checks_title ?? "Answer shape") : "Story shape";
  const stats = [
    { value: String(m.filler_words), label: "Filler words" },
    { value: String(m.hedges), label: 'Hedges like "kind of"' },
    { value: String(m.questions_asked_back), label: "Questions you asked" },
    { value: `${Math.round(m.talk_ratio_user * 100)}%`, label: "Of the talking" },
  ];

  return (
    <>
      <div className="flex flex-col gap-2">
        <div className="text-[13px] text-muted">
          {report.persona_role} with {report.persona_name} ·{" "}
          <span className="capitalize">{report.difficulty}</span>
        </div>
        <h1 className="text-[28px] font-medium leading-tight sm:text-[32px]">{report.headline}</h1>
        <p className="max-w-[620px] text-muted">{report.summary}</p>
      </div>

      {report.strengths.length > 0 && (
        <Section id="worked" title="What worked">
          {report.strengths.map((s, i) => (
            <div key={i} className="flex flex-col gap-2.5 rounded-2xl border border-line bg-surface p-5">
              <span className="self-start rounded-full bg-worked-bg px-2.5 py-0.5 text-xs font-medium text-worked-ink">
                Worked
              </span>
              <div className="font-medium">{s.point}</div>
              <Quote>{s.quote}</Quote>
            </div>
          ))}
        </Section>
      )}

      <Section id="try" title="One thing to try next">
        <div className="flex flex-col gap-3.5 rounded-2xl border border-line bg-surface p-5">
          <span className="self-start rounded-full bg-try-bg px-2.5 py-0.5 text-xs font-medium text-try-ink">
            Try next
          </span>
          <div className="font-medium">{focus.point}</div>
          {focus.quote && <Quote>{focus.quote}</Quote>}
          <p>{focus.try_next}</p>
          {report.fill_in && (
            <div className="flex flex-col gap-1.5 rounded-xl bg-soft px-4 py-3.5">
              <div className="text-xs font-medium tracking-wide text-accent-text">A shape you can fill in</div>
              <div>{report.fill_in}</div>
              <div className="text-[13px] text-muted">
                Swap each [bracket] for your own detail, then say it your way.
              </div>
            </div>
          )}
          {!report.fill_in && rewrite && (
            <div className="flex flex-col gap-1.5 rounded-xl bg-soft px-4 py-3.5">
              <div className="text-xs font-medium tracking-wide text-accent-text">One way to say it</div>
              <div>&ldquo;{rewrite.improved}&rdquo;</div>
              {rewrite.improved.includes("[") && (
                <div className="text-[13px] text-muted">Fill the [brackets] with your real details.</div>
              )}
            </div>
          )}
        </div>
      </Section>

      {checkItems.length > 0 && (
      <Section id="checks" title={checksTitle}>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {checkItems.map((it) => (
            <div
              key={it.label}
              className={`flex items-center gap-2.5 rounded-xl px-3.5 py-3 ${
                it.ok ? "border border-line bg-surface" : "bg-try-bg text-try-ink"
              }`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={it.ok ? "var(--accent-text)" : "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d={it.ok ? "M5 12l5 5 9-10" : "M5 12h14"} />
              </svg>
              <span>{it.ok ? it.label : `${it.label}, not yet`}</span>
            </div>
          ))}
        </div>
      </Section>
      )}

      <Section id="nums" title="Numbers to notice">
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {stats.map((st) => (
            <div key={st.label} className="rounded-xl bg-soft px-4 py-3.5">
              <div className="text-2xl font-medium">{st.value}</div>
              <div className="text-[13px] text-muted">{st.label}</div>
            </div>
          ))}
        </div>
        <p className="text-[13px] text-muted">Not scores. Just things to watch.</p>
      </Section>

      {actions && <div className="flex flex-wrap items-center gap-3 border-t border-line pt-6">{actions}</div>}
    </>
  );
}
