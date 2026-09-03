"use client";

import { useActionState } from "react";
import { updateOrganization, type OrgSettings } from "./organization.actions";
import { Alert, Button, Field, Select } from "@/components/ui";

export function OrganizationForm({
  org,
  labels,
}: {
  org: OrgSettings;
  labels: { name: string; locale: string; save: string; saved: string };
}) {
  const [state, action, pending] = useActionState(updateOrganization, {});
  return (
    <form action={action} className="space-y-4">
      {state.error ? <Alert>{state.error}</Alert> : null}
      {"saved" in state && state.saved ? <Alert tone="success">{labels.saved}</Alert> : null}
      <Field label={labels.name} name="name" defaultValue={org.name} />
      <div>
        <Select label={labels.locale} name="locale" defaultValue={org.locale}>
          <option value="en">English</option>
          <option value="fr">Français</option>
          <option value="ar">العربية</option>
        </Select>
      </div>
      <Button type="submit" disabled={pending}>
        {labels.save}
      </Button>
    </form>
  );
}
