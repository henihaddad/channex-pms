"use client";

import { useActionState } from "react";
import { updateOrganization, type OrgSettings } from "./organization.actions";
import { Alert, Button, Field, Select } from "@/components/ui";

export function OrganizationForm({
  org,
  languages,
  labels,
}: {
  org: OrgSettings;
  /** Every language the console speaks, each named in itself ("Français", "العربية"). */
  languages: Array<{ code: string; name: string }>;
  labels: {
    name: string;
    locale: string;
    localeHint: string;
    save: string;
    saving: string;
    saved: string;
  };
}) {
  const [state, action, pending] = useActionState(updateOrganization, {});
  return (
    <form action={action} className="space-y-4">
      {state.error ? <Alert>{state.error}</Alert> : null}
      {"saved" in state && state.saved ? <Alert tone="success">{labels.saved}</Alert> : null}
      <Field
        label={labels.name}
        name="name"
        defaultValue={org.name}
        maxLength={120}
        error={state.fieldErrors?.name}
      />
      <div>
        <Select
          label={labels.locale}
          name="locale"
          defaultValue={org.locale}
          description={labels.localeHint}
          error={state.fieldErrors?.locale}
        >
          {languages.map((l) => (
            <option key={l.code} value={l.code} lang={l.code}>
              {l.name}
            </option>
          ))}
        </Select>
      </div>
      <Button type="submit" disabled={pending} aria-busy={pending || undefined}>
        {pending ? labels.saving : labels.save}
      </Button>
    </form>
  );
}
