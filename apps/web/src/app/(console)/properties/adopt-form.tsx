"use client";

import { useActionState } from "react";
import Link from "next/link";
import { adoptPropertyAction } from "./properties.actions";
import { Alert, Input, SubmitButton } from "@/components/ui";

export interface AdoptLabels {
  submit: string;
  submitting: string;
  idLabel: string;
  done: string;
  open: string;
}

/** Q7: take over a property that already lives on Channex (the one place its name is the point). */
export function AdoptForm({ labels: L }: { labels: AdoptLabels }) {
  const [state, action] = useActionState(adoptPropertyAction, {});
  return (
    <form action={action} className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Input
          name="channexPropertyId"
          placeholder={L.idLabel}
          aria-label={L.idLabel}
          autoComplete="off"
          spellCheck={false}
          className="max-w-sm"
        />
        <SubmitButton variant="secondary" pendingLabel={L.submitting}>
          {L.submit}
        </SubmitButton>
      </div>
      {state.error ? <Alert>{state.error}</Alert> : null}
      {state.createdId ? (
        <Alert tone="success">
          {L.done}{" "}
          <Link href={`/properties/${state.createdId}`} className="font-semibold underline">
            {L.open}
          </Link>
        </Alert>
      ) : null}
    </form>
  );
}
