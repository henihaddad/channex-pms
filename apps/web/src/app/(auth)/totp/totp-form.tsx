"use client";

import { useActionState } from "react";
import { totpAction } from "../auth.actions";
import { Alert, Button, Field } from "@/components/ui";

export function TotpForm({ labels }: { labels: { code: string; submit: string } }) {
  const [state, action, pending] = useActionState(totpAction, {});
  return (
    <form action={action} className="space-y-4">
      {state.error ? <Alert>{state.error}</Alert> : null}
      <Field label={labels.code} name="code" autoComplete="one-time-code" placeholder="123456" />
      <Button type="submit" disabled={pending} className="w-full">
        {labels.submit}
      </Button>
    </form>
  );
}
