"use client";

import { useActionState } from "react";
import { stepUpAction } from "../auth.actions";
import { Field, SubmitButton } from "@/components/ui";

export function StepUpForm({
  next,
  labels,
}: {
  next: string;
  labels: { password: string; submit: string };
}) {
  const [state, action] = useActionState(stepUpAction, {});
  return (
    <form action={action} className="space-y-4" data-testid="step-up-form">
      <input type="hidden" name="next" value={next} />
      <Field
        label={labels.password}
        name="password"
        type="password"
        autoComplete="current-password"
        error={state.error}
      />
      <SubmitButton fullWidth>{labels.submit}</SubmitButton>
    </form>
  );
}
