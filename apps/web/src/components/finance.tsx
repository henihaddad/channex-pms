import type { ReactNode } from "react";
import { money } from "@/lib/format";
import { cn } from "@/components/ui";

/**
 * Small, dependency-free charts and money helpers for the Financials and Reports boards
 * (design canvas, November 2026): stacked month bars, week bars and a channel donut, drawn
 * with CSS so a server component renders them and nothing ships to the browser.
 */

/** The design's channel colours: Airbnb teal, Booking.com cyan, direct mint, the rest grey. */
export const BUCKET_COLOR = {
  airbnb: "#0f766e",
  booking_com: "#22d3ee",
  direct: "#a7e3dc",
  other: "#c4ccc9",
} as const;

/** "€4,812" or "€4,812 · ZAR 3,350": one figure per currency, never added together. */
export function amounts(
  list: ReadonlyArray<{ currency: string; minor: number }>,
  fallbackCurrency: string,
  locale = "en",
): string {
  if (list.length === 0) return money(0, fallbackCurrency, locale);
  return list.map((a) => money(a.minor, a.currency, locale)).join(" · ");
}

export function Legend({ items }: { items: Array<{ label: ReactNode; color: string }> }) {
  return (
    <div className="flex flex-wrap gap-3.5 text-xs text-muted">
      {items.map((i, n) => (
        <span key={n} className="inline-flex items-center gap-1">
          <span className="inline-block size-2.5 rounded-[2px]" style={{ background: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

/** Stacked columns, one per label; the tallest column fills the height. */
export function StackedBars({
  columns,
  height = 160,
  testId,
}: {
  columns: Array<{
    label: string;
    title: string;
    segments: Array<{ value: number; color: string }>;
  }>;
  height?: number;
  testId?: string;
}) {
  const max = Math.max(1, ...columns.map((c) => c.segments.reduce((a, s) => a + s.value, 0)));
  return (
    <div data-testid={testId}>
      <div className="flex items-end gap-2.5" style={{ height }}>
        {columns.map((c) => {
          const total = c.segments.reduce((a, s) => a + s.value, 0);
          return (
            <div
              key={c.label}
              className="flex h-full min-w-0 flex-1 flex-col justify-end gap-0.5"
              title={c.title}
            >
              {total === 0 ? (
                <div className="h-0.5 rounded-sm bg-border" />
              ) : (
                [...c.segments]
                  .reverse()
                  .map((s, i) =>
                    s.value > 0 ? (
                      <div
                        key={i}
                        className="w-full first:rounded-t-[3px]"
                        style={{ height: `${(s.value / max) * 100}%`, background: s.color }}
                      />
                    ) : null,
                  )
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex gap-2.5 text-[11px] text-muted">
        {columns.map((c, i) => (
          <span
            key={c.label}
            className={cn(
              "min-w-0 flex-1",
              i === 0 ? "text-start" : i === columns.length - 1 ? "text-end" : "text-center",
            )}
          >
            {c.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Single columns with their value above, the last one highlighted (the current week). */
export function Columns({
  columns,
  height = 170,
  testId,
}: {
  columns: Array<{ label: string; caption: string; value: number; max: number }>;
  height?: number;
  testId?: string;
}) {
  return (
    <div data-testid={testId}>
      <div className="flex items-end gap-2" style={{ height }}>
        {columns.map((c, i) => (
          <div key={c.label} className="flex h-full min-w-0 flex-1 flex-col justify-end gap-1">
            <span className="text-center text-[11px] text-muted tabular-nums">{c.caption}</span>
            <div
              className="w-full rounded-t-[3px]"
              style={{
                height: `${Math.max(1, (c.value / Math.max(1, c.max)) * 82)}%`,
                background: i === columns.length - 1 ? BUCKET_COLOR.airbnb : BUCKET_COLOR.direct,
              }}
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-2 text-[11px] text-muted">
        {columns.map((c, i) => (
          <span key={c.label} className="min-w-0 flex-1 text-center">
            {i === 0 || i === columns.length - 1 || i === Math.floor(columns.length / 2)
              ? c.label
              : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

/** A ring from shares in basis points, as the Reports board draws revenue by channel. */
export function Donut({
  segments,
  size = 150,
}: {
  segments: Array<{ shareBps: number; color: string }>;
  size?: number;
}) {
  const arcs = segments
    .filter((s) => s.shareBps > 0)
    .reduce<Array<{ color: string; from: number; to: number }>>((acc, s) => {
      const from = acc.at(-1)?.to ?? 0;
      return [...acc, { color: s.color, from, to: from + s.shareBps }];
    }, []);
  const stops = arcs.map((a) => `${a.color} ${a.from / 100}% ${a.to / 100}%`);
  const background = stops.length ? `conic-gradient(${stops.join(", ")})` : "var(--border)";
  return (
    <div
      className="relative shrink-0 rounded-full"
      style={{ width: size, height: size, background }}
      aria-hidden="true"
    >
      <div className="absolute inset-[26%] rounded-full bg-surface" />
    </div>
  );
}
