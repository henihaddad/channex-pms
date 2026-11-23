"use client";

import { useActionState } from "react";
import { inviteMember } from "./members.actions";
import { Alert, Button, Field, Select } from "@/components/ui";

export function InviteForm({
  roles,
  labels,
}: {
  roles: Array<{ value: string; label: string }>;
  labels: { email: string; role: string; submit: string; pending: string };
}) {
  const [state, action, pending] = useActionState(inviteMember, {});
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      {state.error ? <Alert>{state.error}</Alert> : null}
      {state.sent ? <Alert tone="success">{state.sent}</Alert> : null}
      <div className="min-w-64 flex-1">
        <Field
          id="email"
          label={labels.email}
          name="email"
          type="email"
          autoComplete="email"
          spellCheck={false}
          required
        />
      </div>
      <div className="w-56">
        <Select label={labels.role} name="roleKey" defaultValue="property_manager">
          {roles.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </Select>
      </div>
      <Button type="submit" disabled={pending} aria-busy={pending || undefined}>
        {pending ? labels.pending : labels.submit}
      </Button>
    </form>
  );
}
