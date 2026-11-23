"use client";

import { useActionState } from "react";
import { importCsvAction } from "../../properties.actions";
import { Alert, Field, Select, SubmitButton, TextareaField } from "@/components/ui";

export interface CsvImportLabels {
  template: string;
  none: string;
  timezone: string;
  timezoneHint: string;
  csv: string;
  csvHint: string;
  submit: string;
  submitting: string;
}

const SAMPLE =
  "title,kind,currency,city,country,base_rate,min_stay\nAlfama Loft,single_unit,EUR,Lisbon,PT,120,2\n";

export function ImportForm({
  templates,
  labels: L,
}: {
  templates: Array<{ id: string; name: string }>;
  labels: CsvImportLabels;
}) {
  const [state, action] = useActionState(importCsvAction, {});
  return (
    <form action={action} className="space-y-4" data-testid="import-form">
      {state.error ? <Alert>{state.error}</Alert> : null}
      {state.created !== undefined ? <Alert tone="success">{state.message}</Alert> : null}
      {state.errors?.length ? (
        <ul className="space-y-1 text-xs text-danger">
          {state.errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      ) : null}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Select label={L.template} name="templateId" defaultValue="">
            <option value="">{L.none}</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </div>
        <Field
          label={L.timezone}
          name="timezone"
          defaultValue="Europe/Lisbon"
          description={L.timezoneHint}
          spellCheck={false}
        />
      </div>
      <TextareaField
        id="csv"
        label={L.csv}
        name="csv"
        rows={12}
        className="font-mono text-xs"
        defaultValue={SAMPLE}
        description={L.csvHint}
      />
      <SubmitButton testId="import-submit" pendingLabel={L.submitting}>
        {L.submit}
      </SubmitButton>
    </form>
  );
}
