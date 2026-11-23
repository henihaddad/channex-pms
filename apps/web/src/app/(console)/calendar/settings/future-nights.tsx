"use client";

import { useState } from "react";
import { useLocale } from "next-intl";
import { parsePrice } from "@/components/calendar-price";
import { plural } from "@/components/calendar-shared";

type Weekday = "mo" | "tu" | "we" | "th" | "fr" | "sa" | "su";
type Op =
  | { op: "set_rate"; rateMinor: number }
  | { op: "set_min_stay"; minStay: number | null }
  | { op: "set_max_stay"; maxStay: number | null }
  | { op: "set_cta"; closed: boolean };

export interface FutureField {
  name: string;
  label: string;
  hint?: string;
  /** What the field shows first: the value most future nights have today. */
  value: string;
  kind: "money" | "nights";
  /** The nights of the week this field writes; all of them when absent. */
  days?: Weekday[];
}
export interface FutureLabels {
  preview: string;
  apply: string;
  cancel: string;
  undo: string;
  wouldChange: string;
  applied: string;
  undone: string;
  nothing: string;
  invalid: string;
  failed: string;
}

/**
 * A default for every future night (base price, weekend price, stay limits, check-in days),
 * applied through the ordinary bulk path: a dry run says how many nights would change, Apply
 * writes them as one reversible operation per field, and Undo puts every night back (BULK-1/2).
 */
export function FutureNights({
  propertyId,
  ratePlanId,
  from,
  to,
  fields,
  symbol,
  currency,
  labels: L,
  testId,
}: {
  propertyId: string;
  ratePlanId: string;
  from: string;
  to: string;
  fields: FutureField[];
  symbol: string;
  /** "€118", "118", "118,50" become minor units with this currency's exponent. */
  currency: string;
  /** Raw messages: `wouldChange`, `apply` and `applied` are ICU plurals. */
  labels: FutureLabels;
  testId?: string;
}) {
  const locale = useLocale();
  const [values, setValues] = useState(Object.fromEntries(fields.map((f) => [f.name, f.value])));
  const [preview, setPreview] = useState<{ n: number; blocked: string[] } | null>(null);
  const [message, setMessage] = useState("");
  const [undoIds, setUndoIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const opsFor = (f: FutureField): Op[] | null | "invalid" => {
    const raw = values[f.name] ?? "";
    if (raw.trim() === f.value.trim()) return null;
    if (f.kind === "money") {
      const v = parsePrice(raw, currency);
      return v === null ? "invalid" : [{ op: "set_rate", rateMinor: v }];
    }
    const n = raw.trim() === "" || raw.trim() === "—" ? null : Number(raw);
    if (n !== null && (!Number.isInteger(n) || n < 1)) return "invalid";
    return [
      f.name === "maxStay"
        ? { op: "set_max_stay", maxStay: n }
        : { op: "set_min_stay", minStay: n ?? 1 },
    ];
  };

  const run = async (dryRun: boolean) => {
    setBusy(true);
    setMessage("");
    let n = 0;
    const blocked: string[] = [];
    const ids: string[] = [];
    for (const f of fields) {
      const ops = opsFor(f);
      if (ops === null) continue;
      if (ops === "invalid") {
        setMessage(L.invalid);
        setBusy(false);
        return;
      }
      const res = await fetch("/api/v1/ari/bulk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          propertyId,
          dateFrom: from,
          dateTo: to,
          ...(f.days ? { days: f.days } : {}),
          ratePlanIds: [ratePlanId],
          ops,
          horizonEnd: to,
          dryRun,
        }),
      });
      const r = (await res.json().catch(() => ({}))) as {
        cellCount?: number;
        blocked?: string[];
        id?: string | null;
        detail?: string;
      };
      if (!res.ok && !r.blocked) {
        setMessage(L.failed);
        setBusy(false);
        return;
      }
      n += r.cellCount ?? 0;
      blocked.push(...(r.blocked ?? []));
      if (r.id) ids.push(r.id);
    }
    setBusy(false);
    if (dryRun) {
      setPreview({ n, blocked });
      if (n === 0 && blocked.length === 0) setMessage(L.nothing);
    } else {
      setPreview(null);
      setUndoIds(ids);
      setMessage(plural(L.applied, { n }, locale));
    }
  };
  const undo = async () => {
    for (const id of [...undoIds].reverse())
      await fetch(`/api/v1/ari/bulk/${id}/undo?propertyId=${encodeURIComponent(propertyId)}`, {
        method: "POST",
      });
    setUndoIds([]);
    setMessage(L.undone);
  };

  return (
    <div className="flex flex-col" data-testid={testId}>
      {fields.map((f) => (
        <div
          key={f.name}
          className="grid items-center gap-2 border-b border-default py-3 sm:grid-cols-[236px_minmax(0,1fr)]"
        >
          <label htmlFor={`fn-${f.name}`} className="text-sm font-semibold">
            {f.label}
            {f.hint ? <span className="block text-xs font-normal text-muted">{f.hint}</span> : null}
          </label>
          <span className="flex h-[42px] w-[120px] items-center overflow-hidden rounded-xl border border-border bg-surface focus-within:ring-2 focus-within:ring-accent">
            {f.kind === "money" ? <span className="ps-3.5 text-muted">{symbol}</span> : null}
            <input
              id={`fn-${f.name}`}
              inputMode={f.kind === "money" ? "decimal" : "numeric"}
              className="h-full w-full min-w-0 bg-transparent px-2 text-sm outline-none"
              value={values[f.name] ?? ""}
              placeholder="—"
              onChange={(e) => {
                setPreview(null);
                setValues((v) => ({ ...v, [f.name]: e.target.value }));
              }}
            />
          </span>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2 pt-3 text-sm">
        {preview && preview.n > 0 && preview.blocked.length === 0 ? (
          <>
            <span className="text-muted">{plural(L.wouldChange, { n: preview.n }, locale)}</span>
            <button
              type="button"
              disabled={busy}
              className="h-8 rounded-full bg-accent px-3 text-[13px] font-bold text-accent-foreground"
              onClick={() => void run(false)}
            >
              {plural(L.apply, { n: preview.n }, locale)}
            </button>
            <button
              type="button"
              className="h-8 rounded-full border border-border px-3 text-[13px] font-semibold"
              onClick={() => setPreview(null)}
            >
              {L.cancel}
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={busy}
            className="h-8 rounded-full border border-border bg-surface px-3 text-[13px] font-semibold"
            onClick={() => void run(true)}
          >
            {L.preview}
          </button>
        )}
        {preview?.blocked.map((b) => (
          <span key={b} className="text-danger">
            {b}
          </span>
        ))}
        {/* always mounted, so each new message is announced */}
        <span role="status" className="text-muted empty:hidden">
          {message}
        </span>
        {undoIds.length > 0 ? (
          <button type="button" className="font-semibold text-accent" onClick={() => void undo()}>
            {L.undo}
          </button>
        ) : null}
      </div>
    </div>
  );
}
