import Link from "next/link";

export const pct = (bps: number | null): string =>
  bps === null ? "—" : `${(bps / 100).toFixed(1)}%`;
export const money = (minor: number | null, currency: string): string =>
  minor === null
    ? "—"
    : `${(minor / 100).toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;

/** A KPI tile: the value, its formula as a tooltip (spec 11 §11.1) and the change against the previous period. */
export function Kpi({
  label,
  value,
  hint,
  delta,
  current,
  href,
  testId,
}: {
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
          {change >= 0 ? "▲" : "▼"} {Math.abs(change)}% vs previous
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
