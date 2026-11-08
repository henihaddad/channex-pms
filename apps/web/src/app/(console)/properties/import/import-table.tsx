"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { ImportRow, ImportValue } from "@pms/core";
import { Alert, Button, Chip } from "@/components/ui";
import { money } from "@/lib/format";
import { runAirbnbImportAction } from "./airbnb.actions";

export interface ImportTableLabels {
  field: string;
  onAirbnb: string;
  after: string;
  result: string;
  apply: string;
  fields: Record<string, string>;
  notes: Record<string, string>;
  results: Record<ImportRow["result"], string>;
  listed: string;
  nights: string;
  weekends: string;
  pricedNights: string;
  blocked: string;
  onActivation: string;
  submit: string;
  download: string;
  nothingYet: string;
  /** "Now: {value}", under a value the import replaces. */
  now: string;
}

const tone: Record<ImportRow["result"], "default" | "warning" | "info" | "danger"> = {
  same: "default",
  change: "warning",
  add: "info",
  unread: "danger",
  later: "default",
};

function show(v: ImportValue | null, L: ImportTableLabels, side: "airbnb" | "after"): string {
  if (v === null) return "—";
  switch (v.kind) {
    case "text":
      return v.value;
    case "number":
      return String(v.value);
    case "count":
      return L.listed.replace("{count}", String(v.value));
    case "nights":
      return L.nights.replace("{count}", String(v.value));
    case "plan":
      return v.title;
    case "prices":
      return [
        money(v.medianMinor, v.currency),
        v.weekendMinor !== null && v.weekendMinor !== v.medianMinor
          ? L.weekends.replace("{price}", money(v.weekendMinor, v.currency))
          : null,
        L.pricedNights.replace("{count}", String(v.nights)),
      ]
        .filter(Boolean)
        .join(" · ");
    case "onActivation":
      return side === "airbnb"
        ? L.blocked.replace("{count}", String(v.blockedNights))
        : L.onActivation;
  }
}

/**
 * The field-by-field table (design "Import from Airbnb"): tick what to write, untick what to
 * keep. Nothing is written until "Import exactly this"; the table can be downloaded as CSV
 * first, to check it with an owner.
 */
export function ImportTable({
  rows,
  hidden,
  labels: L,
}: {
  rows: readonly ImportRow[];
  hidden: Record<string, string>;
  labels: ImportTableLabels;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(runAirbnbImportAction, {});
  useEffect(() => {
    if (state.propertyId) router.push(`/properties/${state.propertyId}`);
  }, [state.propertyId, router]);
  const csv = () => {
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const lines = [
      [L.field, L.onAirbnb, L.after, L.result].map(esc).join(","),
      ...rows.map((r) =>
        [
          L.fields[r.key] ?? r.key,
          show(r.airbnb, L, "airbnb"),
          show(r.after, L, "after"),
          L.results[r.result],
        ]
          .map(esc)
          .join(","),
      ),
    ];
    const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "airbnb-import-preview.csv";
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <form action={action} className="flex flex-col gap-4" data-testid="import-diff">
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {state.error ? <Alert>{state.error}</Alert> : null}
      <div className="overflow-x-auto rounded-card border border-border">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-surface-secondary text-xs text-muted">
            <tr>
              <th className="w-12 border-b border-border px-4 py-3" />
              <th className="border-b border-border px-4 py-3 text-start font-semibold">
                {L.field}
              </th>
              <th className="border-b border-border px-4 py-3 text-start font-semibold">
                {L.onAirbnb}
              </th>
              <th className="border-b border-border px-4 py-3 text-start font-semibold">
                {L.after}
              </th>
              <th className="border-b border-border px-4 py-3 text-start font-semibold">
                {L.result}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const writable = r.result === "change" || r.result === "add";
              return (
                <tr key={r.key} data-testid="diff-row" data-result={r.result} className="align-top">
                  <td className="border-b border-border/70 px-4 py-3.5">
                    <input
                      type="checkbox"
                      name="fields"
                      value={r.key}
                      defaultChecked={writable || r.result === "same"}
                      disabled={!r.optional || !writable}
                      aria-label={`${L.apply}: ${L.fields[r.key] ?? r.key}`}
                      className="h-4 w-4 accent-[var(--accent)]"
                    />
                  </td>
                  <td className="border-b border-border/70 px-4 py-3.5">
                    <strong>{L.fields[r.key] ?? r.key}</strong>
                    {L.notes[r.key] ? (
                      <span className="block max-w-sm text-xs text-muted">{L.notes[r.key]}</span>
                    ) : null}
                  </td>
                  <td className="border-b border-border/70 px-4 py-3.5">
                    {show(r.airbnb, L, "airbnb")}
                  </td>
                  <td className="border-b border-border/70 px-4 py-3.5">
                    {show(r.after, L, "after")}
                    {r.result === "change" ? (
                      <span className="block text-xs text-muted">
                        {L.now.replace("{value}", show(r.local, L, "after"))}
                      </span>
                    ) : null}
                  </td>
                  <td className="border-b border-border/70 px-4 py-3.5">
                    <Chip color={tone[r.result]}>{L.results[r.result]}</Chip>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={pending} data-testid="import-exactly">
          {pending ? "…" : L.submit}
        </Button>
        <Button type="button" variant="secondary" onClick={csv}>
          {L.download}
        </Button>
        <span className="flex-1" />
        <span className="text-xs text-muted">{L.nothingYet}</span>
      </div>
    </form>
  );
}
