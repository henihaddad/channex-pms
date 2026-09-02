"use client";

import { useActionState } from "react";
import { loginAction } from "../auth.actions";
import { Alert, Button, Field } from "@/components/ui";

export function LoginForm({
  labels,
}: {
  labels: { email: string; password: string; submit: string };
}) {
  const [state, action, pending] = useActionState(loginAction, {});
  return (
    <form action={action} className="space-y-4">
      {state.error ? <Alert>{state.error}</Alert> : null}
      <Field label={labels.email} name="email" type="email" autoComplete="email" />
      <Field
        label={labels.password}
        name="password"
        type="password"
        autoComplete="current-password"
      />
      <Button type="submit" disabled={pending} className="w-full">
        {labels.submit}
      </Button>
    </form>
  );
}
