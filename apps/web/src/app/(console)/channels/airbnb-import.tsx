"use client";

import { useState, useTransition } from "react";
import {
  importListingsAction,
  importListingsPreview,
  type ListingCandidate,
} from "./channels.actions";
import { Button } from "@/components/ui";

/** CH-5: bulk listing import with per-listing match-or-create. */
export function AirbnbImport({ accountId, label }: { accountId: string; label: string }) {
  const [rows, setRows] = useState<ListingCandidate[] | null>(null);
  const [result, setResult] = useState<string>("");
  const [pending, start] = useTransition();
  return (
    <div className="mt-2">
      <Button
        size="sm"
        variant="secondary"
        disabled={pending}
        onClick={() => start(async () => setRows(await importListingsPreview({ accountId })))}
        data-testid="import-listings"
      >
        {label}
      </Button>
      {rows ? (
        <div className="mt-2 space-y-1 text-xs">
          {rows.map((r) => (
            <p key={r.code}>
              {r.title}{" "}
              <span className="text-muted">
                →{" "}
                {r.match
                  ? `${r.match.title} (${Math.round(r.match.confidence * 100)}%)`
                  : "new single-unit property"}
              </span>
            </p>
          ))}
          <Button
            size="sm"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await importListingsAction({
                  accountId,
                  decisions: rows.map((x) => ({
                    code: x.code,
                    title: x.title,
                    propertyId: x.match?.propertyId ?? null,
                  })),
                });
                setResult(`${r.created} created, ${r.connected} connected`);
                setRows(null);
              })
            }
          >
            Confirm
          </Button>
        </div>
      ) : null}
      {result ? (
        <p className="mt-1 text-xs text-success-soft-foreground" data-testid="import-result">
          {result}
        </p>
      ) : null}
    </div>
  );
}
