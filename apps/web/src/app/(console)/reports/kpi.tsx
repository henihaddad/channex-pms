import Link from "next/link";

export const pct = (bps: number | null): string =>
  bps === null ? "—" : `${(bps / 100).toFixed(1)}%`;
export const money = (minor: number | null, currency: string): string =>
  minor === null
    ? "—"
    : `${(minor / 100).toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;

/** A KPI card: the value, its formula as a tooltip (spec 11 §11.1) and the change against the previous period. */
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
    <div title={hint} data-testid={testId}>
      <p className="text-xs text-muted">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
      {change !== null ? (
        <p className={`text-[10px] ${change >= 0 ? "text-mint-deep" : "text-rose"}`}>
          {change >= 0 ? "▲" : "▼"} {Math.abs(change)}% vs previous
        </p>
      ) : null}
    </div>
  );
  return href ? (
    <Link href={href} className="hover:bg-canvas">
      {body}
    </Link>
  ) : (
    body
  );
}
