"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  importListingsAction,
  importListingsPreview,
  type ListingCandidate,
} from "./channels.actions";
import { Alert, Button, Select } from "@/components/ui";

export interface ImportLabels {
  load: string;
  hint: string;
  none: string;
  newProperty: string;
  target: string;
  run: string;
  done: string;
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
  const [pending, start] = useTransition();
  const load = () =>
    start(async () => {
      const r = await importListingsPreview({ connectionId });
      setRows(r);
      setChoice(Object.fromEntries(r.map((x) => [x.code, x.match?.propertyId ?? ""])));
      setResult(null);
    });
  const run = () =>
    start(async () => {
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
            {L.run.replace("{n}", String(rows.length))}
          </Button>
        </div>
      )}
      {result ? (
        <Alert tone="success" data-testid="import-done">
          {L.done
            .replace("{created}", String(result.created))
            .replace("{connected}", String(result.connected))}
        </Alert>
      ) : null}
    </div>
  );
}
