"use client";

import { useActionState } from "react";
import { inviteMember } from "./members.actions";
import { Alert, Button, Input, Label, Select } from "@/components/ui";

export function InviteForm({
  roles,
  labels,
}: {
  roles: string[];
  labels: { role: string; submit: string };
}) {
  const [state, action, pending] = useActionState(inviteMember, {});
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      {state.error ? <Alert>{state.error}</Alert> : null}
      {state.sent ? <Alert tone="success">{state.sent}</Alert> : null}
      <div className="min-w-64 flex-1">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required />
      </div>
      <div className="w-56">
        <Select label={labels.role} name="roleKey" defaultValue="property_manager">
          {roles.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </Select>
      </div>
      <Button type="submit" disabled={pending}>
        {labels.submit}
      </Button>
    </form>
  );
}
