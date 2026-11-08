"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import type { CalendarLabels } from "@/components/calendar-labels";
import { addSeasonAction } from "./calendar.actions";

const COLOURS = ["#94a3b8", "#5eead4", "#f59e0b", "#ef4444", "#3b82f6", "#a855f7"];

/** The listing the year view shows; changing it reloads the year. */
export function PropertySelect({
  properties,
  value,
  label,
}: {
  properties: Array<{ id: string; title: string }>;
  value: string;
  label: string;
}) {
  const router = useRouter();
  return (
    <select
      aria-label={label}
      className="h-[34px] rounded-full border border-border bg-surface px-3 text-[13px] font-semibold"
      value={value}
      onChange={(e) => router.push(`/calendar?view=year&propertyId=${e.target.value}`)}
    >
      {properties.map((p) => (
        <option key={p.id} value={p.id}>
          {p.title}
        </option>
      ))}
    </select>
  );
}

/** "+ Add a season": a name, a range of nights and a colour; problems come back in words. */
export function AddSeasonForm({
  propertyId,
  labels: L,
  from,
}: {
  propertyId: string;
  labels: CalendarLabels;
  from: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(
    async (_: { errors: string[] } | null, fd: FormData) => {
      const r = await addSeasonAction(fd);
      if (r.errors.length === 0) setOpen(false);
      return r;
    },
    null,
  );
  if (!open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-8 items-center rounded-full border border-border bg-surface px-3 text-[13px] font-semibold"
        data-testid="add-season"
      >
        + {L.addSeason}
      </button>
    );
  return (
    <form
      action={action}
      className="flex flex-wrap items-end gap-2 text-xs"
      data-testid="season-form"
    >
      <input type="hidden" name="propertyId" value={propertyId} />
      <label className="flex flex-col gap-1 font-semibold">
        {L.season}
        <input
          name="name"
          required
          maxLength={60}
          className="h-8 w-28 rounded-lg border border-border bg-surface px-2"
        />
      </label>
      <label className="flex flex-col gap-1 font-semibold">
        {L.firstNight}
        <input
          name="from"
          type="date"
          required
          defaultValue={from}
          className="h-8 rounded-lg border border-border bg-surface px-2"
        />
      </label>
      <label className="flex flex-col gap-1 font-semibold">
        {L.lastNight}
        <input
          name="to"
          type="date"
          required
          className="h-8 rounded-lg border border-border bg-surface px-2"
        />
      </label>
      <label className="flex flex-col gap-1 font-semibold">
        {L.colour}
        <select name="colour" className="h-8 rounded-lg border border-border bg-surface px-2">
          {COLOURS.map((c) => (
            <option key={c} value={c} style={{ color: c }}>
              ● {c}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        disabled={pending}
        className="h-8 rounded-full bg-accent px-3 font-bold text-accent-foreground"
      >
        {L.save}
      </button>
      <button type="button" onClick={() => setOpen(false)} className="h-8 px-2 text-muted">
        {L.cancel}
      </button>
      {state && state.errors.length > 0 ? (
        <p className="basis-full text-danger" role="alert">
          {state.errors.join(" ")}
        </p>
      ) : null}
    </form>
  );
}
