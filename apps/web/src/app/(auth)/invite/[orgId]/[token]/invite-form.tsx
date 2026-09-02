"use client";

import { useActionState } from "react";
import { acceptInviteAction } from "../../../auth.actions";
import { Alert, Button, Field } from "@/components/ui";

export function InviteForm({
  orgId,
  token,
  labels,
}: {
  orgId: string;
  token: string;
  labels: { name: string; password: string; submit: string };
}) {
  const [state, action, pending] = useActionState(acceptInviteAction, {});
  return (
    <form action={action} className="space-y-4">
      {state.error ? <Alert>{state.error}</Alert> : null}
      <input type="hidden" name="orgId" value={orgId} />
      <input type="hidden" name="token" value={token} />
      <Field label={labels.name} name="name" autoComplete="name" />
      <Field
        label={labels.password}
        name="password"
        type="password"
        required={false}
        autoComplete="new-password"
      />
      <Button type="submit" disabled={pending} className="w-full">
        {labels.submit}
      </Button>
    </form>
  );
}
