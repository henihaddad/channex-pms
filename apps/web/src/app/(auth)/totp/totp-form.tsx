"use client";

import { useActionState } from "react";
import { totpAction } from "../auth.actions";
import { Field, SubmitButton } from "@/components/ui";

export function TotpForm({
  labels,
  next = "",
}: {
  labels: { code: string; submit: string };
  /** The page to return to once the code is accepted. */
  next?: string;
}) {
  const [state, action] = useActionState(totpAction, {});
  return (
    <form action={action} className="space-y-4">
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <Field
        label={labels.code}
        name="code"
        autoComplete="one-time-code"
        inputMode="numeric"
        spellCheck={false}
        placeholder="123456"
        error={state.error}
      />
      <SubmitButton fullWidth>{labels.submit}</SubmitButton>
    </form>
  );
}
