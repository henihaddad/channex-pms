"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import type { OnboardingTrack } from "@/server/console-context";
import { Card } from "@/components/ui";

export interface StartLabels {
  title: string;
  lead: string;
  progress: string;
  minutes: string;
  locked: string;
  done: string;
  waiting: string;
  tracks: Record<string, string>;
  steps: Record<string, string>;
  hide: string;
  show: string;
}

const fill = (s: string, vars: Record<string, string | number>) =>
  Object.entries(vars).reduce((acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)), s);

/** The step to do next: the first unfinished step of the first unlocked, unfinished track. */
export function nextStep(tracks: OnboardingTrack[]) {
  for (const t of tracks) {
    if (!t.unlocked || t.done) continue;
    const step = t.steps.find((x) => !x.done);
    if (step) return { track: t, step };
  }
  return null;
}

const KEY = "pms.start.hidden";
const EVENT = "pms:start";
const read = () => {
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
};
const subscribe = (cb: () => void) => {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
};
function setHidden(v: boolean) {
  try {
    window.localStorage.setItem(KEY, v ? "1" : "0");
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(EVENT));
}

/** Whether the follow-me widget is dismissed for this browser. */
export function useStartHidden(): boolean {
  return useSyncExternalStore(subscribe, read, () => false);
}

/**
 * The full programme on the dashboard: three tracks in the order they happen, each
 * step with the minutes it takes, later tracks locked until the one before is done.
 */
export function GettingStarted({
  tracks,
  labels: L,
}: {
  tracks: OnboardingTrack[];
  labels: StartLabels;
}) {
  const next = nextStep(tracks);
  const total = tracks.reduce((n, t) => n + t.steps.length, 0);
  const done = tracks.reduce((n, t) => n + t.steps.filter((s) => s.done).length, 0);
  return (
    <Card
      title={L.title}
      description={L.lead}
      data-testid="getting-started"
      actions={
        <span className="flex items-center gap-2 text-sm text-muted">
          <span className="tabular-nums">{fill(L.progress, { done, total })}</span>
          <span className="flex h-1.5 w-24 overflow-hidden rounded-full bg-default">
            <span
              className="bridge-rail h-full rounded-full"
              style={{ width: `${(done / total) * 100}%` }}
            />
          </span>
          <button
            type="button"
            onClick={() => setHidden(true)}
            className="underline-offset-2 hover:underline"
          >
            {L.hide}
          </button>
        </span>
      }
    >
      <ol className="grid gap-4 lg:grid-cols-3">
        {tracks.map((t, i) => (
          <li
            key={t.key}
            data-track={t.key}
            data-done={t.done ? "1" : "0"}
            data-unlocked={t.unlocked ? "1" : "0"}
            className={`rounded-2xl border p-4 ${
              t.done
                ? "border-success/40 bg-success-soft/30"
                : t.unlocked
                  ? "border-accent/50"
                  : "border-border opacity-60"
            }`}
          >
            <p className="flex items-center gap-2 text-sm font-semibold">
              <span
                className={`grid h-6 w-6 place-items-center rounded-full text-xs ${
                  t.done
                    ? "bg-success-soft text-success-soft-foreground"
                    : t.unlocked
                      ? "bg-accent text-white"
                      : "bg-default text-muted"
                }`}
              >
                {t.done ? "✓" : i + 1}
              </span>
              {L.tracks[t.key] ?? t.key}
              {!t.unlocked ? (
                <span className="ms-auto text-xs font-normal text-muted">{L.locked}</span>
              ) : null}
            </p>
            <ul className="mt-3 space-y-1.5 text-sm">
              {t.steps.map((s) => {
                const current = t.unlocked && s.key === next?.step.key;
                const label = L.steps[s.key] ?? s.key;
                return (
                  <li
                    key={s.key}
                    data-step={s.key}
                    data-done={s.done ? "1" : "0"}
                    className="flex items-baseline gap-2"
                  >
                    <span aria-hidden="true" className={s.done ? "text-success" : "text-muted"}>
                      {s.done ? "✓" : "○"}
                    </span>
                    {s.done ? (
                      <span className="text-muted line-through decoration-success/50">{label}</span>
                    ) : t.unlocked ? (
                      <Link
                        href={s.href}
                        data-testid={current ? "setup-next" : undefined}
                        className={
                          current
                            ? "font-medium text-accent underline-offset-4 hover:underline"
                            : "text-foreground underline-offset-4 hover:underline"
                        }
                      >
                        {label}
                      </Link>
                    ) : (
                      <span className="text-muted">{label}</span>
                    )}
                    <span className="ms-auto shrink-0 text-xs text-muted">
                      {fill(L.minutes, { n: s.minutes })}
                    </span>
                  </li>
                );
              })}
            </ul>
            {t.key === "connect" && !t.done && t.steps.find((s) => s.key === "live" && !s.done) ? (
              <p className="mt-3 text-xs text-muted">{L.waiting}</p>
            ) : null}
          </li>
        ))}
      </ol>
    </Card>
  );
}

/** The same programme, condensed: one line in the header of every console page. */
export function StartWidget({
  tracks,
  labels: L,
}: {
  tracks: OnboardingTrack[];
  labels: StartLabels;
}) {
  const hidden = useStartHidden();
  const next = nextStep(tracks);
  if (hidden || !next) return null;
  const total = tracks.reduce((n, t) => n + t.steps.length, 0);
  const done = tracks.reduce((n, t) => n + t.steps.filter((s) => s.done).length, 0);
  return (
    <span className="flex shrink-0 items-center gap-2 text-sm" data-testid="onboarding-checklist">
      <span className="text-muted tabular-nums">{fill(L.progress, { done, total })}</span>
      <span className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-default sm:flex">
        <span
          className="bridge-rail h-full rounded-full"
          style={{ width: `${(done / total) * 100}%` }}
        />
      </span>
      <Link
        href={next.step.href}
        className="font-medium text-accent underline-offset-4 hover:underline"
        data-step={next.step.key}
        data-done="0"
      >
        {L.steps[next.step.key] ?? next.step.key} →
      </Link>
    </span>
  );
}
