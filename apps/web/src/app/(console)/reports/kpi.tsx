import Link from "next/link";

export const pct = (bps: number | null): string =>
  bps === null ? "—" : `${(bps / 100).toFixed(1)}%`;

/** A KPI tile: the value, its formula as a tooltip (spec 11 §11.1) and the change against the previous period. */
export function Kpi({
  label,
  value,
  hint,
  delta,
  current,
  href,
  testId,
  vs,
}: {
  /** "▲ 12% vs previous" in the reader's language, given the change as text. */
  vs: (change: string) => string;
  label: string;
  value: string;
  hint?: string;
  delta?: number | null;
  current?: number | null;
  href?: string;
  testId?: string;
}) {
  const change =
    delta !== undefined &&
    delta !== null &&
    delta !== 0 &&
    current !== undefined &&
    current !== null
      ? Math.round(((current - delta) * 1000) / Math.abs(delta)) / 10
      : null;
  const body = (
    <div
      title={hint}
      data-testid={testId}
      className="flex h-full min-w-0 flex-col gap-0.5 rounded-2xl bg-surface-secondary px-4 py-3"
    >
      <span className="truncate text-xs font-medium text-muted">{label}</span>
      <span className="text-xl font-semibold tracking-tight text-foreground tabular-nums">
        {value}
      </span>
      {change !== null ? (
        <span
          className={`text-xs tabular-nums ${change >= 0 ? "text-success-soft-foreground" : "text-danger"}`}
        >
          <span aria-hidden="true">{change >= 0 ? "▲" : "▼"}</span>{" "}
          {vs(`${change >= 0 ? "+" : "−"}${String(Math.abs(change))}%`)}
        </span>
      ) : null}
    </div>
  );
  return href ? (
    <Link href={href} className="block rounded-2xl transition-opacity hover:opacity-80">
      {body}
    </Link>
  ) : (
    body
  );
}
