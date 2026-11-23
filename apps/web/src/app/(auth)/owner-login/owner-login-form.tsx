"use client";

import { useActionState } from "react";
import { requestMagicLinkAction } from "../auth.actions";
import { Alert, Field, SubmitButton } from "@/components/ui";

export function OwnerLoginForm({
  labels,
}: {
  labels: { email: string; submit: string; sending: string };
}) {
  const [state, action] = useActionState(requestMagicLinkAction, {});
  return (
    <form action={action} className="space-y-4">
      {state.message ? <Alert tone="success">{state.message}</Alert> : null}
      <Field
        label={labels.email}
        name="email"
        type="email"
        autoComplete="email"
        spellCheck={false}
        defaultValue={state.values?.email}
        error={state.error}
      />
      <SubmitButton fullWidth pendingLabel={labels.sending} testId="send-magic-link">
        {labels.submit}
      </SubmitButton>
    </form>
  );
}
