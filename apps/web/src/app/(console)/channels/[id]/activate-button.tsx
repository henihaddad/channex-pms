"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { activateAction } from "../channels.actions";
import { Alert, Button } from "@/components/ui";

type Outcome = { activated: true } | { activated: false; issues: string[] };

/** CH-4/CH-6: readiness then activation with the full horizon push; the gaps are listed when not ready. */
export function ActivateButton({ connectionId, label }: { connectionId: string; label: string }) {
  const router = useRouter();
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-2">
      <Button
        disabled={pending}
        data-testid="activate-connection"
        onClick={() =>
          start(async () => {
            const r = await activateAction({ connectionId });
            // "not activated" is never a success, even when the provider names no gap
            setOutcome(
              r.activated
                ? { activated: true }
                : {
                    activated: false,
                    issues:
                      r.issues.length > 0
                        ? r.issues
                        : ["The channel manager reports the channel not ready and gave no reason."],
                  },
            );
            router.refresh();
          })
        }
      >
        {label}
      </Button>
      {outcome && !outcome.activated ? (
        <Alert tone="warning" data-testid="not-activated">
          {outcome.issues.join("; ")}
        </Alert>
      ) : null}
      {outcome?.activated ? (
        <Alert tone="success" data-testid="activated">
          Active. A full ARI push for the horizon is on its way.
        </Alert>
      ) : null}
    </div>
  );
}
