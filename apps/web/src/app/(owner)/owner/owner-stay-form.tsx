"use client";

import { useActionState } from "react";
import { Alert, DateInput, Field, Select, SubmitButton } from "@/components/ui";
import { ownerStayAction, type OwnerStayState } from "./portal.actions";

/**
 * Block nights for the owner's own stay (PORT-3; persona: the owner). The owner names the
 * first and the last night, the way they think of a stay; the action ends the block the
 * morning after. A clash with a booking or a date mistake comes back as a sentence above the
 * button, with the dates kept, instead of an error page; a block that worked says so.
 */
export function OwnerStayForm({
  properties,
  min,
  labels,
  withNote = false,
  hint,
}: {
  properties: Array<{ id: string; title: string }>;
  /** The first night that can be blocked (today). */
  min: string;
  labels: Record<
    "property" | "firstNight" | "lastNight" | "note" | "block" | "blocking" | "title",
    string
  >;
  /** The calendar page's long form: always the property picker, and a note. */
  withNote?: boolean;
  hint?: string;
}) {
  const [state, action] = useActionState<OwnerStayState, FormData>(ownerStayAction, {});
  const v = state.values ?? {};
  return (
    <form
      action={action}
      className={withNote ? "grid grid-cols-2 gap-2 text-sm" : "flex flex-col gap-3 text-sm"}
      data-testid={withNote ? "owner-stay-form" : undefined}
    >
      {withNote ? <p className="col-span-2 font-medium">{labels.title}</p> : null}
      {withNote || properties.length > 1 ? (
        <div className={withNote ? "col-span-2" : undefined}>
          <Select label={labels.property} name="propertyId" defaultValue={v.propertyId}>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </Select>
        </div>
      ) : (
        <input type="hidden" name="propertyId" value={properties[0]?.id ?? ""} />
      )}
      <div className={withNote ? "col-span-2 grid grid-cols-2 gap-2" : "grid grid-cols-2 gap-2"}>
        <DateInput
          label={labels.firstNight}
          name="dateFrom"
          required
          min={min}
          defaultValue={v.dateFrom}
        />
        <DateInput
          label={labels.lastNight}
          name="lastNight"
          required
          min={min}
          defaultValue={v.lastNight}
        />
      </div>
      {withNote ? (
        <div className="col-span-2">
          <Field label={labels.note} name="note" required={false} defaultValue={v.note} />
        </div>
      ) : null}
      {state.error ? (
        <div className={withNote ? "col-span-2" : undefined}>
          <Alert>{state.error}</Alert>
        </div>
      ) : state.done ? (
        <div className={withNote ? "col-span-2" : undefined}>
          <Alert tone="success">{state.done}</Alert>
        </div>
      ) : null}
      <div className={withNote ? "col-span-2" : undefined}>
        <SubmitButton
          size={withNote ? "md" : "lg"}
          fullWidth={!withNote}
          testId={withNote ? "block-owner-stay" : undefined}
          pendingLabel={labels.blocking}
        >
          {labels.block}
        </SubmitButton>
      </div>
      {hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </form>
  );
}
