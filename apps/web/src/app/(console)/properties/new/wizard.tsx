"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { createPropertyAction, saveTemplateAction } from "../properties.actions";
import { Alert, Button, Card, Field, Input, Label, LinkButton, Select } from "@/components/ui";

type Kind = "single_unit" | "multi_unit" | "hotel";
type Room = { title: string; units: number; sleeps: number; price: string; minStay: number };

export interface WizardLabels {
  basics: string;
  firstRoom: string;
  firstRoomHint: string;
  title: string;
  titlePlaceholder: string;
  kind: string;
  kindHint: string;
  kinds: Record<Kind, string>;
  country: string;
  city: string;
  street: string;
  postcode: string;
  currency: string;
  timezone: string;
  roomName: string;
  units: string;
  sleeps: string;
  baseRate: string;
  baseRateHint: string;
  minStay: string;
  addRoomType: string;
  remove: string;
  advanced: string;
  template: string;
  none: string;
  groups: string;
  templateName: string;
  saveTemplate: string;
  create: string;
  cancel: string;
  afterCreate: string;
}

const CURRENCIES = [
  "EUR",
  "USD",
  "GBP",
  "CHF",
  "MAD",
  "TND",
  "AED",
  "SAR",
  "TRY",
  "SEK",
  "NOK",
  "DKK",
  "PLN",
  "CZK",
  "CAD",
  "AUD",
  "BRL",
  "MXN",
  "ZAR",
  "INR",
  "JPY",
];
const SYMBOLS: Record<string, string> = { EUR: "€", USD: "$", GBP: "£", JPY: "¥", INR: "₹" };
const COUNTRIES: Array<[string, string]> = [
  ["DE", "Germany"],
  ["FR", "France"],
  ["ES", "Spain"],
  ["PT", "Portugal"],
  ["IT", "Italy"],
  ["NL", "Netherlands"],
  ["BE", "Belgium"],
  ["AT", "Austria"],
  ["CH", "Switzerland"],
  ["GB", "United Kingdom"],
  ["IE", "Ireland"],
  ["GR", "Greece"],
  ["HR", "Croatia"],
  ["PL", "Poland"],
  ["CZ", "Czechia"],
  ["SE", "Sweden"],
  ["NO", "Norway"],
  ["DK", "Denmark"],
  ["FI", "Finland"],
  ["TR", "Türkiye"],
  ["MA", "Morocco"],
  ["TN", "Tunisia"],
  ["EG", "Egypt"],
  ["AE", "United Arab Emirates"],
  ["SA", "Saudi Arabia"],
  ["US", "United States"],
  ["CA", "Canada"],
  ["MX", "Mexico"],
  ["BR", "Brazil"],
  ["AR", "Argentina"],
  ["AU", "Australia"],
  ["NZ", "New Zealand"],
  ["JP", "Japan"],
  ["TH", "Thailand"],
  ["ID", "Indonesia"],
  ["IN", "India"],
  ["ZA", "South Africa"],
];
const TIMEZONES = [
  "Europe/Berlin",
  "Europe/Paris",
  "Europe/Madrid",
  "Europe/Lisbon",
  "Europe/Rome",
  "Europe/Amsterdam",
  "Europe/Vienna",
  "Europe/Zurich",
  "Europe/London",
  "Europe/Dublin",
  "Europe/Athens",
  "Europe/Warsaw",
  "Europe/Stockholm",
  "Europe/Istanbul",
  "Africa/Casablanca",
  "Africa/Tunis",
  "Africa/Cairo",
  "Asia/Dubai",
  "Asia/Riyadh",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "America/Mexico_City",
  "America/Sao_Paulo",
  "Australia/Sydney",
  "Pacific/Auckland",
  "Asia/Tokyo",
  "Asia/Bangkok",
  "Asia/Jakarta",
  "Asia/Kolkata",
  "Africa/Johannesburg",
];

/** A price typed in the property's currency ("110", "110.50", "110,50") as integer minor units. */
const toMinor = (price: string) => Math.round((Number(price.replace(",", ".")) || 0) * 100);

/**
 * "Add a property" (spec 03 §3.2, design "Add a property"): the basics, then the first room
 * or unit with its base rate. The property type carries MODEL-1's choice — one rental, several
 * units, or a guest house — and decides whether rooms are managed for the manager. Templates
 * and groups sit behind "Advanced". Photos and channels come after, on the property's page.
 */
export function PropertyWizard({
  templates,
  groups,
  labels: L,
  defaults,
}: {
  templates: Array<{ id: string; name: string }>;
  groups: Array<{ id: string; name: string }>;
  labels: WizardLabels;
  defaults: { country: string; currency: string; timezone: string };
}) {
  const router = useRouter();
  const [kind, setKind] = useState<Kind>("single_unit");
  const [currency, setCurrency] = useState(defaults.currency);
  const [rooms, setRooms] = useState<Room[]>([
    { title: "Entire apartment", units: 1, sleeps: 2, price: "100", minStay: 1 },
  ]);
  const [state, action, pending] = useActionState(createPropertyAction, {});
  if (state.createdId) router.push(`/properties/${state.createdId}`);
  const single = kind === "single_unit";
  const shown = single ? rooms.slice(0, 1) : rooms;
  const rtJson = JSON.stringify(
    single
      ? []
      : rooms.map((r) => ({
          title: r.title,
          countOfRooms: r.units,
          occAdults: r.sleeps,
          occChildren: 0,
        })),
  );
  const rpJson = JSON.stringify(
    shown.map((r) => ({
      title: "Standard",
      minStay: r.minStay,
      baseRateMinor: toMinor(r.price),
      roomTypeTitle: single ? undefined : r.title,
    })),
  );
  const edit = (i: number, patch: Partial<Room>) =>
    setRooms(rooms.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const sym = SYMBOLS[currency] ?? currency;
  return (
    <form action={action} className="flex flex-col gap-5" data-testid="property-wizard">
      {state.error ? <Alert>{state.error}</Alert> : null}

      <Card id="basics" title={L.basics} className="grid gap-4 sm:grid-cols-2">
        <Field label={L.title} name="title" placeholder={L.titlePlaceholder} />
        <Select
          label={L.kind}
          name="kind"
          value={kind}
          onChange={(v) => setKind(v as Kind)}
          description={L.kindHint}
        >
          {(["single_unit", "multi_unit", "hotel"] as const).map((k) => (
            <option key={k} value={k}>
              {L.kinds[k]}
            </option>
          ))}
        </Select>
        <Select label={L.country} name="country" defaultValue={defaults.country}>
          {COUNTRIES.map(([code, name]) => (
            <option key={code} value={code}>
              {name}
            </option>
          ))}
        </Select>
        <Field label={L.city} name="city" required={false} placeholder="Lisbon" />
        <Field label={L.street} name="street" required={false} placeholder="Rua dos Remédios 24" />
        <Field label={L.postcode} name="postcode" required={false} placeholder="1100-446" />
        <Select label={L.currency} name="currency" value={currency} onChange={setCurrency}>
          {CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {SYMBOLS[c] ? `${c} ${SYMBOLS[c]}` : c}
            </option>
          ))}
        </Select>
        <Select label={L.timezone} name="timezone" defaultValue={defaults.timezone}>
          {TIMEZONES.map((z) => (
            <option key={z} value={z}>
              {z.replace(/_/g, " ")}
            </option>
          ))}
        </Select>
      </Card>

      <Card id="rooms" title={L.firstRoom} description={L.firstRoomHint}>
        <div className="flex flex-col gap-5">
          {shown.map((r, i) => (
            <div
              key={i}
              className={`grid gap-4 sm:grid-cols-3 ${i > 0 ? "border-t border-border pt-5" : ""}`}
              data-testid="room-row"
            >
              {single ? null : (
                <>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={`room-${String(i)}`}>{L.roomName}</Label>
                    <Input
                      id={`room-${String(i)}`}
                      value={r.title}
                      onChange={(e) => edit(i, { title: e.target.value })}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={`units-${String(i)}`}>{L.units}</Label>
                    <Input
                      id={`units-${String(i)}`}
                      type="number"
                      min={1}
                      value={r.units}
                      onChange={(e) => edit(i, { units: Number(e.target.value) })}
                    />
                  </div>
                </>
              )}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`sleeps-${String(i)}`}>{L.sleeps}</Label>
                <Input
                  id={`sleeps-${String(i)}`}
                  name={single ? "sleeps" : undefined}
                  type="number"
                  min={1}
                  max={50}
                  value={r.sleeps}
                  onChange={(e) => edit(i, { sleeps: Number(e.target.value) })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`price-${String(i)}`}>{L.baseRate}</Label>
                <div className="relative">
                  <Input
                    id={`price-${String(i)}`}
                    type="text"
                    inputMode="decimal"
                    value={r.price}
                    data-testid={`price-${String(i)}`}
                    onChange={(e) => edit(i, { price: e.target.value })}
                    className="pe-12"
                  />
                  <span className="pointer-events-none absolute inset-y-0 end-3 flex items-center text-xs text-muted">
                    {sym}
                  </span>
                </div>
                {i === 0 ? <p className="text-xs text-muted">{L.baseRateHint}</p> : null}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`minstay-${String(i)}`}>{L.minStay}</Label>
                <Input
                  id={`minstay-${String(i)}`}
                  type="number"
                  min={1}
                  value={r.minStay}
                  onChange={(e) => edit(i, { minStay: Number(e.target.value) })}
                />
              </div>
              {!single && i > 0 ? (
                <div className="flex items-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setRooms(rooms.filter((_, j) => j !== i))}
                  >
                    {L.remove}
                  </Button>
                </div>
              ) : null}
            </div>
          ))}
          {single ? null : (
            <div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() =>
                  setRooms([
                    ...rooms,
                    {
                      title: `Room type ${String(rooms.length + 1)}`,
                      units: 1,
                      sleeps: 2,
                      price: rooms[0]?.price ?? "100",
                      minStay: rooms[0]?.minStay ?? 1,
                    },
                  ])
                }
              >
                + {L.addRoomType}
              </Button>
            </div>
          )}
        </div>
      </Card>

      <details
        className="rounded-card border border-border bg-surface p-5"
        data-testid="wizard-advanced"
      >
        <summary className="cursor-pointer text-sm font-semibold text-foreground">
          {L.advanced}
        </summary>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Select label={L.template} name="templateId" defaultValue="">
            <option value="">{L.none}</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
          {groups.length > 0 ? (
            <div>
              <Label>{L.groups}</Label>
              <div className="flex flex-wrap gap-3 text-sm">
                {groups.map((g) => (
                  <Label key={g.id}>
                    <input type="checkbox" name="groupIds" value={g.id} className="me-1" />
                    {g.name}
                  </Label>
                ))}
              </div>
            </div>
          ) : null}
          <div className="flex items-end gap-2 sm:col-span-2">
            <div className="max-w-xs flex-1">
              <Label htmlFor="templateName">{L.templateName}</Label>
              <Input
                id="templateName"
                name="templateName"
                defaultValue={`Template ${new Date().toISOString().slice(0, 10)}`}
              />
            </div>
            <Button type="submit" variant="secondary" formAction={saveTemplateAction}>
              {L.saveTemplate}
            </Button>
          </div>
        </div>
      </details>

      <input type="hidden" name="roomTypes" value={rtJson} />
      <input type="hidden" name="ratePlans" value={rpJson} />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending} data-testid="create-property">
          {pending ? "…" : L.create}
        </Button>
        <LinkButton href="/properties" variant="secondary">
          {L.cancel}
        </LinkButton>
        <span className="flex-1" />
        <span className="text-xs text-muted">{L.afterCreate}</span>
      </div>
    </form>
  );
}
