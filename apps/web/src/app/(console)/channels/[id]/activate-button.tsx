"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { activateAction } from "../channels.actions";
import { fill } from "../fill";
import { Alert, Button } from "@/components/ui";

type Outcome = { activated: true } | { activated: false; issues: string[] };

export interface ActivateLabels {
  label: string;
  pending: string;
  /** Raw, with `{channel}`. */
  live: string;
  /** Raw, with `{channel}`. */
  notReadyNoReason: string;
  failed: string;
}

/** CH-4/CH-6: readiness then activation with the full horizon push; the gaps are listed when not ready. */
export function ActivateButton({
  connectionId,
  channel,
  labels: L,
}: {
  connectionId: string;
  channel: string;
  labels: ActivateLabels;
}) {
  const router = useRouter();
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-2">
      <Button
        disabled={pending}
        aria-busy={pending || undefined}
        data-testid="activate-connection"
        className="w-fit"
        onClick={() =>
          start(async () => {
            const r = await activateAction({ connectionId }).catch((e: unknown) => ({
              activated: false as const,
              issues: [e instanceof Error && e.message ? e.message : L.failed],
            }));
            // "not activated" is never a success, even when the provider names no gap
            setOutcome(
              r.activated
                ? { activated: true }
                : {
                    activated: false,
                    issues:
                      r.issues.length > 0 ? r.issues : [fill(L.notReadyNoReason, { channel })],
                  },
            );
            router.refresh();
          })
        }
      >
        {pending ? L.pending : L.label}
      </Button>
      {outcome && !outcome.activated ? (
        <Alert tone="warning" data-testid="not-activated">
          {outcome.issues.join("; ")}
        </Alert>
      ) : null}
      {outcome?.activated ? (
        <Alert tone="success" data-testid="activated">
          {fill(L.live, { channel })}
        </Alert>
      ) : null}
    </div>
  );
}
