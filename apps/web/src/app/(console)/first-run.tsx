import Link from "next/link";
import type { OnboardingTrack } from "@/server/console-context";
import { Card, LinkButton } from "@/components/ui";
import { cn } from "@/components/ui/cn";

export interface FirstRunLabels {
  title: string;
  lead: string;
  of: (done: number, total: number) => string;
  orgCreated: string;
  minutes: (n: number) => string;
  start: string;
  done: string;
  locked: string;
  tracks: Record<string, string>;
  steps: Record<string, string>;
  waiting: string;
  call: string;
  guide: string;
  help: string;
  previewTitle: string;
  previewBody: string;
  addProperty: string;
}

/**
 * The first run (design canvas "Today — first run"): one vertical checklist that starts with the
 * step already done, the next step as the only button, later steps locked until they make sense,
 * and a picture of the calendar the host is working towards.
 */
export function FirstRun({
  tracks,
  labels: L,
}: {
  tracks: OnboardingTrack[];
  labels: FirstRunLabels;
}) {
  const total = tracks.reduce((n, t) => n + t.steps.length, 0) + 1;
  const done = tracks.reduce((n, t) => n + t.steps.filter((s) => s.done).length, 0) + 1;
  const next = (() => {
    for (const t of tracks) {
      if (!t.unlocked || t.done) continue;
      const step = t.steps.find((x) => !x.done);
      if (step) return step.key;
    }
    return null;
  })();
  // step numbers run across the tracks: 1 is the organization, already created
  const numbers = new Map<string, number>();
  let counter = 1;
  for (const t of tracks) for (const st of t.steps) numbers.set(st.key, ++counter);
  return (
    <div className="flex flex-col gap-5">
      <Card data-testid="getting-started">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-xl font-bold tracking-tight">{L.title}</h2>
            <p className="mt-1.5 max-w-xl text-sm text-muted">{L.lead}</p>
          </div>
          <span className="shrink-0 text-sm font-semibold text-muted tabular-nums">
            {L.of(done, total)}
          </span>
        </div>
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-default">
          <div
            className="bridge-rail h-full rounded-full"
            style={{ width: `${(done / total) * 100}%` }}
          />
        </div>
        {tracks.map((t, ti) => (
          <section
            key={t.key}
            data-track={t.key}
            data-done={t.done ? "1" : "0"}
            data-unlocked={t.unlocked ? "1" : "0"}
            className="mt-5"
          >
            <h3 className="text-[11px] font-bold tracking-wider text-muted uppercase">
              {L.tracks[t.key] ?? t.key}
            </h3>
            <ul className="mt-1">
              {ti === 0 ? (
                <Row index="✓" title={L.orgCreated} minutes={L.minutes(1)} state="done" L={L} />
              ) : null}
              {t.steps.map((s) => {
                const state = s.done ? "done" : s.key === next ? "next" : "locked";
                return (
                  <Row
                    key={s.key}
                    step={s.key}
                    isDone={s.done}
                    index={s.done ? "✓" : String(numbers.get(s.key) ?? "")}
                    title={L.steps[s.key] ?? s.key}
                    minutes={L.minutes(s.minutes)}
                    state={state}
                    href={s.href}
                    L={L}
                  />
                );
              })}
            </ul>
            {t.key === "connect" &&
            !t.done &&
            t.steps.some((s) => s.key === "live" && !s.done) &&
            t.steps.some((s) => s.key === "property" && s.done) ? (
              <p className="mt-2 text-xs text-muted">{L.waiting}</p>
            ) : null}
          </section>
        ))}
        <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-4">
          <LinkButton href="/settings/support#call" size="sm">
            {L.call}
          </LinkButton>
          <LinkButton
            href="https://github.com/henihaddad/channex-pms/blob/main/docs/operate.md"
            size="sm"
          >
            {L.guide}
          </LinkButton>
          <LinkButton href="/settings/support" size="sm">
            {L.help}
          </LinkButton>
        </div>
      </Card>
      <Card
        className="overflow-hidden p-0"
        contentClassName="grid sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"
      >
        <div className="grid grid-cols-7 gap-1.5 bg-surface-secondary p-5" aria-hidden="true">
          {Array.from({ length: 21 }, (_, i) => (
            <span
              key={i}
              className={cn(
                "h-7 rounded-md",
                [3, 4, 5, 10, 11, 16, 17, 18].includes(i)
                  ? "bg-accent"
                  : [8, 13].includes(i)
                    ? "bg-foreground/80"
                    : "bg-default",
              )}
            />
          ))}
        </div>
        <div className="flex flex-col justify-center gap-2 p-5">
          <h2 className="text-base font-bold">{L.previewTitle}</h2>
          <p className="text-sm text-muted">{L.previewBody}</p>
          <div>
            <LinkButton href="/properties/new" variant="primary" size="sm">
              {L.addProperty}
            </LinkButton>
          </div>
        </div>
      </Card>
    </div>
  );
}

function Row({
  index,
  title,
  minutes,
  state,
  href,
  step,
  isDone,
  L,
}: {
  index: string;
  title: string;
  minutes: string;
  state: "done" | "next" | "locked";
  href?: string;
  step?: string;
  isDone?: boolean;
  L: FirstRunLabels;
}) {
  return (
    <li
      data-step={step}
      data-done={step ? (isDone ? "1" : "0") : undefined}
      className="flex items-center gap-3 border-b border-border/70 py-2.5 last:border-b-0"
    >
      <span
        className={cn(
          "grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold",
          state === "done"
            ? "bg-success-soft text-success-soft-foreground"
            : state === "next"
              ? "bg-accent text-accent-foreground"
              : "bg-default text-muted",
        )}
        aria-hidden="true"
      >
        {index}
      </span>
      <span className={cn("min-w-0 flex-1 text-sm", state === "locked" && "text-muted")}>
        <strong className={cn("font-semibold", state === "locked" && "font-medium")}>
          {title}
        </strong>{" "}
        <span className="text-xs text-muted">{minutes}</span>
      </span>
      {state === "done" ? (
        <span className="text-xs font-semibold text-success">{L.done}</span>
      ) : state === "next" && href ? (
        <LinkButton href={href} variant="primary" size="sm" data-testid="setup-next">
          {L.start}
        </LinkButton>
      ) : href ? (
        <Link
          href={href}
          className="text-muted hover:text-foreground"
          title={L.locked}
          aria-label={`${title} · ${L.locked}`}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <rect x="5" y="11" width="14" height="10" rx="2" />
            <path d="M8 11V8a4 4 0 0 1 8 0v3" />
          </svg>
        </Link>
      ) : null}
    </li>
  );
}
