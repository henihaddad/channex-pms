"use client";

import { useActionState } from "react";
import { stepUpAction } from "../auth.actions";
import { Alert, Button, Field } from "@/components/ui";

export function StepUpForm({
  next,
  labels,
}: {
  next: string;
  labels: { password: string; submit: string };
}) {
  const [state, action, pending] = useActionState(stepUpAction, {});
  return (
    <form action={action} className="space-y-4" data-testid="step-up-form">
      {state.error ? <Alert>{state.error}</Alert> : null}
      <input type="hidden" name="next" value={next} />
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
