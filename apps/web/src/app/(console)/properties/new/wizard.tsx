"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { createPropertyAction, saveTemplateAction } from "../properties.actions";
import { Alert, Button, Field, Input, Label, Select } from "@/components/ui";

type RoomType = { title: string; countOfRooms: number; occAdults: number; occChildren: number };
type RatePlan = { title: string; roomTypeTitle?: string; price: string; minStay: number };
type Kind = "single_unit" | "multi_unit" | "hotel";

export interface WizardLabels {
  step1: string;
  step2: string;
  step3: string;
  kinds: Record<Kind, { title: string; hint: string }>;
  title: string;
  titlePlaceholder: string;
  city: string;
  country: string;
  currency: string;
  timezone: string;
  optional: string;
  roomTypes: string;
  roomName: string;
  rooms: string;
  adults: string;
  children: string;
  addRoomType: string;
  ratePlans: string;
  ratePlansHint: string;
  planName: string;
  roomType: string;
  nightlyPrice: string;
  minNights: string;
  addRatePlan: string;
  advanced: string;
  template: string;
  none: string;
  groups: string;
  templateName: string;
  saveTemplate: string;
  create: string;
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

const toMinor = (price: string) => Math.round((Number(price.replace(",", ".")) || 0) * 100);

/**
 * Property wizard (spec 03 §3.2) as three numbered sections on one page: what you
 * list, where it is, what it costs. Prices are typed in the property's currency,
 * not in cents. Templates and groups sit behind "Advanced".
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
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([
    { title: "Double Room", countOfRooms: 2, occAdults: 2, occChildren: 0 },
  ]);
  const [ratePlans, setRatePlans] = useState<RatePlan[]>([
    { title: "Standard", price: "100", minStay: 1 },
  ]);
  const [state, action, pending] = useActionState(createPropertyAction, {});
  if (state.createdId) router.push(`/properties/${state.createdId}`);
  const rtJson = JSON.stringify(kind === "single_unit" ? [] : roomTypes);
  const rpJson = JSON.stringify(
    ratePlans.map((r) => ({
      title: r.title,
      minStay: r.minStay,
      baseRateMinor: toMinor(r.price),
      roomTypeTitle: kind === "single_unit" ? undefined : (r.roomTypeTitle ?? roomTypes[0]?.title),
    })),
  );
  const editRoom = (i: number, patch: Partial<RoomType>) =>
    setRoomTypes(roomTypes.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const editPlan = (i: number, patch: Partial<RatePlan>) =>
    setRatePlans(ratePlans.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const step = (n: number, title: string) => (
    <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
      <span className="grid h-6 w-6 place-items-center rounded-full bg-accent-soft text-xs text-accent">
        {n}
      </span>
      {title}
    </h2>
  );
  return (
    <form action={action} className="space-y-8" data-testid="property-wizard">
      {state.error ? <Alert>{state.error}</Alert> : null}

      <section className="space-y-3">
        {step(1, L.step1)}
        <fieldset className="grid gap-3 sm:grid-cols-3">
          {(["single_unit", "multi_unit", "hotel"] as const).map((k) => (
            <Label
              key={k}
              className={`cursor-pointer rounded-xl border p-4 text-sm transition-colors ${kind === k ? "border-accent bg-accent-soft/40" : "border-border hover:border-muted"}`}
            >
              <span className="flex items-center gap-2">
                <input
                  type="radio"
                  name="kind"
                  value={k}
                  checked={kind === k}
                  onChange={() => setKind(k)}
                />
                <span className="font-medium">{L.kinds[k].title}</span>
              </span>
              <p className="mt-1.5 ps-6 text-xs text-muted">{L.kinds[k].hint}</p>
            </Label>
          ))}
        </fieldset>
      </section>

      <section className="space-y-3">
        {step(2, L.step2)}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={L.title} name="title" placeholder={L.titlePlaceholder} />
          <Field label={`${L.city} ${L.optional}`} name="city" required={false} />
          <Select label={L.country} name="country" defaultValue={defaults.country}>
            {COUNTRIES.map(([code, name]) => (
              <option key={code} value={code}>
                {name}
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
          <Select label={L.currency} name="currency" value={currency} onChange={setCurrency}>
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </div>
      </section>

      <section className="space-y-4">
        {step(3, L.step3)}
        {kind !== "single_unit" ? (
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">{L.roomTypes}</p>
            <div className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-2 text-xs text-muted">
              <span>{L.roomName}</span>
              <span>{L.rooms}</span>
              <span>{L.adults}</span>
              <span>{L.children}</span>
            </div>
            {roomTypes.map((rt, i) => (
              <div key={i} className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-2">
                <Input
                  value={rt.title}
                  aria-label={L.roomName}
                  onChange={(e) => editRoom(i, { title: e.target.value })}
                />
                <Input
                  type="number"
                  min={1}
                  aria-label={L.rooms}
                  value={rt.countOfRooms}
                  onChange={(e) => editRoom(i, { countOfRooms: Number(e.target.value) })}
                />
                <Input
                  type="number"
                  min={1}
                  aria-label={L.adults}
                  value={rt.occAdults}
                  onChange={(e) => editRoom(i, { occAdults: Number(e.target.value) })}
                />
                <Input
                  type="number"
                  min={0}
                  aria-label={L.children}
                  value={rt.occChildren}
                  onChange={(e) => editRoom(i, { occChildren: Number(e.target.value) })}
                />
              </div>
            ))}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() =>
                setRoomTypes([
                  ...roomTypes,
                  {
                    title: `Room type ${String(roomTypes.length + 1)}`,
                    countOfRooms: 1,
                    occAdults: 2,
                    occChildren: 0,
                  },
                ])
              }
            >
              + {L.addRoomType}
            </Button>
          </div>
        ) : null}
        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground">{L.ratePlans}</p>
          <p className="text-xs text-muted">{L.ratePlansHint}</p>
          <div
            className={`grid gap-2 text-xs text-muted ${kind !== "single_unit" ? "grid-cols-[2fr_1.5fr_1fr_1fr]" : "grid-cols-[2fr_1fr_1fr]"}`}
          >
            <span>{L.planName}</span>
            {kind !== "single_unit" ? <span>{L.roomType}</span> : null}
            <span>{L.nightlyPrice}</span>
            <span>{L.minNights}</span>
          </div>
          {ratePlans.map((rp, i) => (
            <div
              key={i}
              className={`grid gap-2 ${kind !== "single_unit" ? "grid-cols-[2fr_1.5fr_1fr_1fr]" : "grid-cols-[2fr_1fr_1fr]"}`}
            >
              <Input
                value={rp.title}
                aria-label={L.planName}
                onChange={(e) => editPlan(i, { title: e.target.value })}
              />
              {kind !== "single_unit" ? (
                <Select
                  aria-label={L.roomType}
                  value={rp.roomTypeTitle ?? roomTypes[0]?.title}
                  onChange={(v) => editPlan(i, { roomTypeTitle: v })}
                >
                  {roomTypes.map((rt) => (
                    <option key={rt.title} value={rt.title}>
                      {rt.title}
                    </option>
                  ))}
                </Select>
              ) : null}
              <div className="relative">
                <Input
                  type="text"
                  inputMode="decimal"
                  aria-label={L.nightlyPrice}
                  value={rp.price}
                  data-testid={`price-${String(i)}`}
                  onChange={(e) => editPlan(i, { price: e.target.value })}
                  className="pe-12"
                />
                <span className="pointer-events-none absolute inset-y-0 end-3 flex items-center text-xs text-muted">
                  {currency}
                </span>
              </div>
              <Input
                type="number"
                min={1}
                aria-label={L.minNights}
                value={rp.minStay}
                onChange={(e) => editPlan(i, { minStay: Number(e.target.value) })}
              />
            </div>
          ))}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() =>
              setRatePlans([
                ...ratePlans,
                { title: `Plan ${String(ratePlans.length + 1)}`, price: "100", minStay: 1 },
              ])
            }
          >
            + {L.addRatePlan}
          </Button>
        </div>
      </section>

      <details className="rounded-xl border border-border p-4" data-testid="wizard-advanced">
        <summary className="cursor-pointer text-sm font-medium text-foreground">
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
      <div className="flex items-center gap-3 border-t border-border pt-5">
        <Button type="submit" disabled={pending} data-testid="create-property">
          {pending ? "…" : L.create}
        </Button>
        <span className="text-xs text-muted">{L.afterCreate}</span>
      </div>
    </form>
  );
}
