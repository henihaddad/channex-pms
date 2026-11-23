"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  importListingsAction,
  importListingsPreview,
  type ListingCandidate,
} from "./channels.actions";
import { Alert, Button, Select } from "@/components/ui";
import { fill } from "./fill";

export interface ImportLabels {
  load: string;
  hint: string;
  none: string;
  newProperty: string;
  target: string;
  /** Raw, with `{n}`. */
  run: string;
  /** Raw, with `{created}` and `{connected}`. */
  done: string;
  failed: string;
}

/**
 * CH-5: the host's listings not yet in OTAbridge, each imported as a new property
 * (content and prices from Airbnb) or attached to an existing one.
 */
export function AirbnbImport({
  connectionId,
  properties,
  labels: L,
}: {
  connectionId: string;
  properties: Array<{ id: string; title: string }>;
  labels: ImportLabels;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<ListingCandidate[] | null>(null);
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ created: number; connected: number } | null>(null);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const guarded = (fn: () => Promise<void>) =>
    start(async () => {
      setError("");
      try {
        await fn();
      } catch (e) {
        setError(e instanceof Error && e.message ? e.message : L.failed);
      }
    });
  const load = () =>
    guarded(async () => {
      const r = await importListingsPreview({ connectionId });
      setRows(r);
      setChoice(Object.fromEntries(r.map((x) => [x.code, x.match?.propertyId ?? ""])));
      setResult(null);
    });
  const run = () =>
    guarded(async () => {
      const r = await importListingsAction({
        connectionId,
        decisions: (rows ?? []).map((x) => ({
          code: x.code,
          title: x.title,
          propertyId: choice[x.code] || null,
        })),
      });
      setResult(r);
      setRows(null);
      router.refresh();
    });
  return (
    <div className="space-y-3" data-testid="airbnb-import">
      <p className="text-sm text-muted">{L.hint}</p>
      {error ? <Alert>{error}</Alert> : null}
      {rows === null ? (
        <Button variant="secondary" disabled={pending} onClick={load} data-testid="import-listings">
          {L.load}
        </Button>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted">{L.none}</p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div
              key={r.code}
              className="grid items-center gap-2 rounded-xl border border-border p-3 text-sm sm:grid-cols-[1fr_auto]"
              data-testid="import-row"
            >
              <div>
                <p className="font-medium">{r.title}</p>
                <p className="text-xs text-muted">
                  {r.city ? `${r.city} · ` : ""}#{r.code}
                </p>
              </div>
              <Select
                aria-label={L.target}
                value={choice[r.code] ?? ""}
                onChange={(v) => setChoice({ ...choice, [r.code]: v })}
                className="w-64"
              >
                <option value="">{L.newProperty}</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </Select>
            </div>
          ))}
          <Button disabled={pending} onClick={run} data-testid="import-run">
            {fill(L.run, { n: rows.length })}
          </Button>
        </div>
      )}
      {result ? (
        <Alert tone="success" data-testid="import-done">
          {fill(L.done, result)}
        </Alert>
      ) : null}
    </div>
  );
}
