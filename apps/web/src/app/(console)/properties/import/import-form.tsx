"use client";

import { useActionState } from "react";
import { importCsvAction } from "../properties.actions";
import { Alert, Button, Field, Label, Select } from "@/components/ui";

export function ImportForm({ templates }: { templates: Array<{ id: string; name: string }> }) {
  const [state, action, pending] = useActionState(importCsvAction, {});
  return (
    <form action={action} className="space-y-4" data-testid="import-form">
      {state.error ? <Alert>{state.error}</Alert> : null}
      {state.created !== undefined ? (
        <Alert tone="success">
          Created {state.created} properties
          {state.errors?.length ? `; ${state.errors.length} rows skipped` : ""}
        </Alert>
      ) : null}
      {state.errors?.map((e) => (
        <p key={e} className="text-xs text-rose-700">
          {e}
        </p>
      ))}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="templateId">Template</Label>
          <Select id="templateId" name="templateId" defaultValue="">
            <option value="">None</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </div>
        <Field label="Default timezone" name="timezone" defaultValue="Europe/Lisbon" />
      </div>
      <div>
        <Label htmlFor="csv">CSV</Label>
        <textarea
          id="csv"
          name="csv"
          rows={12}
          className="w-full rounded-md border border-slate-300 p-2 font-mono text-xs"
          defaultValue={
            "title,kind,currency,city,country,base_rate,min_stay\nAlfama Loft,single_unit,EUR,Lisbon,PT,120,2\n"
          }
        />
      </div>
      <Button type="submit" disabled={pending} data-testid="import-submit">
        Import
      </Button>
    </form>
  );
}
