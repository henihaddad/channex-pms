"use client";

import { useActionState } from "react";
import { adoptPropertyAction } from "./properties.actions";
import { Alert, Button, Input } from "@/components/ui";

export function AdoptForm({ label }: { label: string }) {
  const [state, action, pending] = useActionState(adoptPropertyAction, {});
  return (
    <form action={action} className="flex gap-2">
      <Input name="channexPropertyId" placeholder="Channex property id" className="max-w-sm" />
      <Button type="submit" variant="secondary" disabled={pending}>
        {label}
      </Button>
      {state.error ? <Alert>{state.error}</Alert> : null}
      {state.createdId ? (
        <Alert tone="success">Adopted → {state.createdId.slice(0, 8)}</Alert>
      ) : null}
    </form>
  );
}
