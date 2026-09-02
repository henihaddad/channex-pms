"use client";

import { useActionState } from "react";
import { requestMagicLinkAction } from "../auth.actions";
import { Alert, Button, Field } from "@/components/ui";

export function OwnerLoginForm({ labels }: { labels: { email: string; submit: string } }) {
  const [state, action, pending] = useActionState(requestMagicLinkAction, {});
  return (
    <form action={action} className="space-y-4">
      {state.error ? <Alert>{state.error}</Alert> : null}
      {state.message ? <Alert tone="success">{state.message}</Alert> : null}
      <Field label={labels.email} name="email" type="email" autoComplete="email" />
      <Button type="submit" disabled={pending} className="w-full" data-testid="send-magic-link">
        {labels.submit}
      </Button>
    </form>
  );
}
