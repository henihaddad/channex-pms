"use client";

import { useActionState } from "react";
import { acceptInviteAction } from "../../../auth.actions";
import { Alert, Field, SubmitButton } from "@/components/ui";

export function InviteForm({
  orgId,
  token,
  labels,
}: {
  orgId: string;
  token: string;
  labels: { name: string; password: string; passwordHint: string; submit: string };
}) {
  const [state, action] = useActionState(acceptInviteAction, {});
  // the invitation names the email, so an email problem is about the invitation, not a field here
  const error = state.error ?? state.fieldErrors?.email;
  return (
    <form action={action} className="space-y-4">
      {error ? <Alert>{error}</Alert> : null}
      <input type="hidden" name="orgId" value={orgId} />
      <input type="hidden" name="token" value={token} />
      <Field
        label={labels.name}
        name="name"
        autoComplete="name"
        defaultValue={state.values?.name}
        error={state.fieldErrors?.name}
      />
      <Field
        label={labels.password}
        name="password"
        type="password"
        required={false}
        autoComplete="new-password"
        description={labels.passwordHint}
        error={state.fieldErrors?.password}
      />
      <SubmitButton fullWidth>{labels.submit}</SubmitButton>
    </form>
  );
}
