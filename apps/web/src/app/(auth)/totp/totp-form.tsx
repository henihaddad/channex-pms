"use client";

import { useActionState } from "react";
import { totpAction } from "../auth.actions";
import { Alert, Button, Field } from "@/components/ui";

export function TotpForm({
  labels,
  next = "",
}: {
  labels: { code: string; submit: string };
  /** The page to return to once the code is accepted. */
  next?: string;
}) {
  const [state, action, pending] = useActionState(totpAction, {});
  return (
    <form action={action} className="space-y-4">
      {state.error ? <Alert>{state.error}</Alert> : null}
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <Field label={labels.code} name="code" autoComplete="one-time-code" placeholder="123456" />
      <Button type="submit" disabled={pending} className="w-full">
        {labels.submit}
      </Button>
    </form>
  );
}
