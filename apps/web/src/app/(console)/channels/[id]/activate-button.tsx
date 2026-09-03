"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { activateAction } from "../channels.actions";
import { Alert, Button } from "@/components/ui";

/** CH-4/CH-6: readiness then activation with the full horizon push; the gaps are listed when not ready. */
export function ActivateButton({ connectionId, label }: { connectionId: string; label: string }) {
  const router = useRouter();
  const [issues, setIssues] = useState<string[] | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-2">
      <Button
        disabled={pending}
        data-testid="activate-connection"
        onClick={() =>
          start(async () => {
            const r = await activateAction({ connectionId });
            setIssues(r.activated ? [] : r.issues);
            if (r.activated) router.refresh();
          })
        }
      >
        {label}
      </Button>
      {issues && issues.length > 0 ? <Alert tone="warning">{issues.join("; ")}</Alert> : null}
      {issues && issues.length === 0 ? (
        <Alert tone="success" data-testid="activated">
          Active. A full ARI push for the horizon is on its way.
        </Alert>
      ) : null}
    </div>
  );
}
