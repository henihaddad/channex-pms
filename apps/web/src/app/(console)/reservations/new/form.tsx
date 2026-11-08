"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createStaffBookingAction,
  findReturningGuestsAction,
  quoteStaffBookingAction,
  type ReturningGuest,
  type StaffQuote,
} from "../reservations.actions";
import { loadProperty } from "../../properties/[id]/property.actions";
import {
  Alert,
  Button,
  Card,
  Input,
  Label,
  LinkButton,
  Select,
  Textarea,
  cn,
} from "@/components/ui";
import { controlClasses } from "@/components/ui/controls";
import { day, money, stay } from "@/lib/format";

type L = Record<string, string>;
const fill = (s: string, v: Record<string, string | number>) =>
  s.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ""));
const fold = (x: string) =>
  x
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();

const LANGUAGES = ["en", "pt", "fr", "es", "de", "it", "nl", "ar"] as const;

/**
 * Staff booking (spec 08 §8.11, design canvas November 2026): where and when, the guest, price
 * and payment, with a summary that stays in view. Availability and price come from the same
 * check the create runs; one booking path with the booking engine.
 */
export function StaffBookingForm({
  properties,
  initial = {},
  labels: l,
  locale,
}: {
  properties: Array<{ id: string; title: string }>;
  /** The calendar's "new reservation here" and the palette's "for <guest>" arrive prefilled. */
  initial?: { propertyId?: string; arrivalDate?: string; departureDate?: string; guest?: string };
  labels: L;
  locale: string;
}) {
  const router = useRouter();
  const [propertyId, setPropertyId] = useState(
    properties.find((p) => p.id === initial.propertyId)?.id ?? properties[0]?.id ?? "",
  );
  const [inventory, setInventory] = useState<{
    roomTypes: Array<{ id: string; title: string; maxOccupancy: number }>;
    ratePlans: Array<{ id: string; title: string; roomTypeId: string }>;
  }>({ roomTypes: [], ratePlans: [] });
  const [roomTypeId, setRoomTypeId] = useState("");
  const [ratePlanId, setRatePlanId] = useState("");
  const [arrival, setArrival] = useState(initial.arrivalDate ?? "");
  const [departure, setDeparture] = useState(initial.departureDate ?? "");
  const [adults, setAdults] = useState("2");
  const [children, setChildren] = useState("0");
  const [fullName, setFullName] = useState(initial.guest ?? "");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [language, setLanguage] = useState("");
  const [total, setTotal] = useState("");
  const [quote, setQuote] = useState<StaffQuote | null>(null);
  const [matches, setMatches] = useState<ReturningGuest[]>([]);
  const [picked, setPicked] = useState<ReturningGuest | null>(null);
  const [state, action, pending] = useActionState(createStaffBookingAction, {});
  const lookedUpInitial = useRef(false);

  useEffect(() => {
    if (!propertyId) return;
    void loadProperty(propertyId).then((d) => {
      setInventory({ roomTypes: d.roomTypes, ratePlans: d.ratePlans });
      const rt = d.roomTypes[0]?.id ?? "";
      setRoomTypeId(rt);
      setRatePlanId(d.ratePlans.find((r) => r.roomTypeId === rt)?.id ?? "");
    });
  }, [propertyId]);

  // the price and the availability check, as the create will see them
  useEffect(() => {
    if (!propertyId || !roomTypeId || !ratePlanId || !arrival || !departure) {
      const h = setTimeout(() => setQuote(null), 0);
      return () => clearTimeout(h);
    }
    const cents = total.trim() ? Math.round(Number(total) * 100) : undefined;
    const h = setTimeout(() => {
      void quoteStaffBookingAction({
        propertyId,
        roomTypeId,
        ratePlanId,
        arrivalDate: arrival,
        departureDate: departure,
        ...(cents !== undefined && Number.isFinite(cents) ? { totalMinor: cents } : {}),
      })
        .then(setQuote)
        .catch(() => setQuote(null));
    }, 250);
    return () => clearTimeout(h);
  }, [propertyId, roomTypeId, ratePlanId, arrival, departure, total]);

  // returning guests: needs `booking:read_pii`; without it the box is a plain name field
  useEffect(() => {
    if (picked && fold(`${picked.name} ${picked.surname}`) === fold(fullName)) return;
    if (fold(fullName).length < 2) {
      const h = setTimeout(() => setMatches([]), 0);
      return () => clearTimeout(h);
    }
    const h = setTimeout(() => {
      void findReturningGuestsAction({ q: fullName })
        .then((rows) => {
          setMatches(rows);
          if (!lookedUpInitial.current && initial.guest) {
            lookedUpInitial.current = true;
            const exact = rows.filter(
              (r) => fold(`${r.name} ${r.surname}`) === fold(initial.guest ?? ""),
            );
            if (exact.length === 1) pick(exact[0]!);
          }
        })
        .catch(() => setMatches([]));
    }, 250);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullName]);

  useEffect(() => {
    if (state.bookingId) router.push(`/reservations/${state.bookingId}`);
  }, [state.bookingId, router]);

  function pick(g: ReturningGuest) {
    setPicked(g);
    setMatches([]);
    setFullName(`${g.name} ${g.surname}`);
    setEmail(g.email ?? "");
    setPhone(g.phone ?? "");
    setLanguage(g.language ?? "");
  }

  const property = properties.find((p) => p.id === propertyId);
  const roomType = inventory.roomTypes.find((r) => r.id === roomTypeId);
  const cur = (m: number) => money(m, quote?.currency ?? "EUR", locale);
  const uniform =
    quote && quote.nightly.length > 0
      ? quote.nightly.every((n) => n.amountMinor === quote.nightly[0]!.amountMinor)
      : false;
  const section = "flex flex-col gap-4";
  const grid = "grid grid-cols-1 gap-4 sm:grid-cols-2";
  const dateInput = (name: string, label: string, value: string, set: (v: string) => void) => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`date-${name}`}>{label}</Label>
      <input
        id={`date-${name}`}
        data-testid={`date-${name}`}
        type="date"
        name={name}
        required
        value={value}
        onChange={(e) => set(e.target.value)}
        className={cn(controlClasses, "h-10.5 tabular-nums")}
      />
    </div>
  );
  const numberInput = (name: string, label: string, value: string, set: (v: string) => void) => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`field-${name}`}>{label}</Label>
      <Input
        id={`field-${name}`}
        name={name}
        type="number"
        min={name === "adults" ? 1 : 0}
        value={value}
        onChange={(e) => set(e.target.value)}
      />
    </div>
  );

  return (
    <form
      action={action}
      className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] xl:grid-cols-[minmax(0,1fr)_minmax(0,27rem)]"
      data-testid="staff-booking-form"
    >
      <div className="flex min-w-0 flex-col gap-5">
        {state.error ? (
          <Alert>
            {state.error}
            {state.reasons?.length ? ` · ${state.reasons.join("; ")}` : ""}
          </Alert>
        ) : null}
        <Card title={l.where}>
          <div className={section}>
            <div className={grid}>
              <Select
                label={l.property}
                name="propertyId"
                value={propertyId}
                onChange={(v) => setPropertyId(v)}
              >
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </Select>
              <Select
                label={l.room}
                name="roomTypeId"
                value={roomTypeId}
                onChange={(v) => {
                  setRoomTypeId(v);
                  setRatePlanId(inventory.ratePlans.find((r) => r.roomTypeId === v)?.id ?? "");
                }}
              >
                {inventory.roomTypes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {fill(l.sleeps!, { title: r.title, n: r.maxOccupancy })}
                  </option>
                ))}
              </Select>
              {dateInput("arrivalDate", l.checkIn!, arrival, setArrival)}
              {dateInput("departureDate", l.checkOut!, departure, setDeparture)}
              {numberInput("adults", l.adults!, adults, setAdults)}
              {numberInput("children", l.children!, children, setChildren)}
            </div>
            {quote ? (
              quote.ok ? (
                <p
                  className="rounded-control border border-accent/30 bg-accent-soft/50 px-4 py-3 text-sm text-accent-soft-foreground"
                  data-testid="availability"
                  data-state="available"
                >
                  <strong>{l.available}</strong>{" "}
                  {fill(l.availableDetail!, { nights: quote.nights })}
                  {quote.minStay ? ` · ${fill(l.minStay!, { n: quote.minStay })}` : ""}
                  {" · "}
                  {l.noRestrictions} {l.channelsClose}
                </p>
              ) : (
                <p
                  className="rounded-control border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning-soft-foreground"
                  data-testid="availability"
                  data-state="unavailable"
                >
                  <strong>{l.unavailable}</strong> {quote.reasons.join(" · ")}
                </p>
              )
            ) : null}
          </div>
        </Card>

        <Card title={l.guest}>
          <div className={grid}>
            <div className="relative flex flex-col gap-1.5">
              <Label htmlFor="field-fullName">{l.fullName}</Label>
              <Input
                id="field-fullName"
                name="fullName"
                required
                autoComplete="off"
                placeholder={l.fullNameHint}
                value={fullName}
                onChange={(e) => {
                  setFullName(e.target.value);
                  setPicked(null);
                }}
                aria-autocomplete="list"
                aria-controls="returning-guests"
                onBlur={() => setTimeout(() => setMatches([]), 200)}
              />
              {picked ? (
                <span className="text-xs text-muted" data-testid="returning-guest">
                  {fill(l.returning!, {
                    n: picked.stays === 1 ? l.stay1! : fill(l.stays!, { n: picked.stays }),
                  })}
                </span>
              ) : null}
              {matches.length > 0 ? (
                <ul
                  id="returning-guests"
                  role="listbox"
                  className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-control border border-border bg-surface shadow-float"
                >
                  {matches.map((g) => (
                    <li key={g.guestId} role="option" aria-selected={false}>
                      <button
                        type="button"
                        className="flex w-full flex-col px-3.5 py-2 text-start text-sm hover:bg-default"
                        onClick={() => pick(g)}
                      >
                        <span className="font-semibold">
                          {g.name} {g.surname}
                        </span>
                        <span className="text-xs text-muted">
                          {[
                            g.email,
                            g.country,
                            g.stays === 1 ? l.stay1 : fill(l.stays!, { n: g.stays }),
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="field-email">{l.email}</Label>
              <Input
                id="field-email"
                name="email"
                type="email"
                placeholder="guest@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="field-phone">{l.phone}</Label>
              <Input
                id="field-phone"
                name="phone"
                type="tel"
                placeholder="+351 …"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <Select
              label={l.language}
              name="language"
              value={language}
              onChange={(v) => setLanguage(v)}
            >
              <option value="">{l.languageUnknown}</option>
              {LANGUAGES.map((code) => (
                <option key={code} value={code}>
                  {new Intl.DisplayNames([locale], { type: "language" }).of(code) ?? code}
                </option>
              ))}
            </Select>
          </div>
        </Card>

        <Card title={l.price}>
          <div className={section}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Select
                label={l.ratePlan}
                name="ratePlanId"
                value={ratePlanId}
                onChange={(v) => setRatePlanId(v)}
              >
                {inventory.ratePlans
                  .filter((r) => r.roomTypeId === roomTypeId)
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.title}
                    </option>
                  ))}
              </Select>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="field-total">
                  {fill(l.total!, { currency: quote?.currency ?? "" }).replace(/\s*\(\)/, "")}
                </Label>
                <Input
                  id="field-total"
                  name="total"
                  inputMode="decimal"
                  placeholder={quote?.ok ? (quote.totalMinor / 100).toFixed(2) : ""}
                  value={total}
                  onChange={(e) => setTotal(e.target.value)}
                />
                <span className="text-xs text-muted">{l.totalHint}</span>
              </div>
              <Select label={l.source} name="source" defaultValue="phone">
                <option value="phone">{l.sourcePhone}</option>
                <option value="walk_in">{l.sourceWalkIn}</option>
                <option value="direct">{l.sourceDirect}</option>
                <option value="staff">{l.sourceStaff}</option>
              </Select>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Select label={l.payment} name="payment" defaultValue="later">
                <option value="later">{l.payLater}</option>
                <option value="card">{l.payCard}</option>
                <option value="cash">{l.payCash}</option>
                <option value="bank_transfer">{l.payTransfer}</option>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="field-note">{l.note}</Label>
              <Textarea id="field-note" name="note" rows={2} placeholder={l.noteHint} />
            </div>
          </div>
        </Card>
      </div>

      <Card title={l.summary} className="lg:sticky lg:top-20">
        <div className="flex flex-col gap-4 text-sm">
          <p>
            <strong className="block">
              {property?.title}
              {roomType ? ` · ${roomType.title}` : ""}
            </strong>
            {arrival && departure && arrival < departure ? (
              <span className="text-xs text-muted">
                {stay(arrival, departure, locale)}
                {quote
                  ? ` · ${quote.nights === 1 ? l.night1 : fill(l.nights!, { n: quote.nights })}`
                  : ""}{" "}
                · {adults === "1" ? l.adult1 : fill(l.adultsN!, { n: adults })}
              </span>
            ) : (
              <span className="text-xs text-muted">{l.pickDates}</span>
            )}
          </p>
          {quote?.ok ? (
            <dl className="flex flex-col" data-testid="summary">
              {uniform ? (
                <div className="flex justify-between py-1.5">
                  <dt>{`${quote.nights} × ${cur(quote.nightly[0]!.amountMinor)}`}</dt>
                  <dd className="tabular-nums">{cur(quote.totalMinor)}</dd>
                </div>
              ) : (
                quote.nightly.map((n) => (
                  <div key={n.date} className="flex justify-between py-1.5">
                    <dt>{day(n.date, locale)}</dt>
                    <dd className="tabular-nums">{cur(n.amountMinor)}</dd>
                  </div>
                ))
              )}
              <div className="mt-1 flex justify-between border-t border-border pt-3 font-bold">
                <dt>{l.totalLabel}</dt>
                <dd className="tabular-nums">{cur(quote.totalMinor)}</dd>
              </div>
              {quote.dueNow ? (
                <div className="flex justify-between py-1.5">
                  <dt>{fill(l.dueNow!, { name: quote.dueNow.name })}</dt>
                  <dd className="tabular-nums">{cur(quote.dueNow.amountMinor)}</dd>
                </div>
              ) : null}
            </dl>
          ) : null}
          <Button type="submit" size="lg" fullWidth disabled={pending} data-testid="create-booking">
            {l.create}
          </Button>
          <LinkButton href="/reservations" fullWidth>
            {l.cancel}
          </LinkButton>
          <p className="text-xs text-muted">{l.sideEffects}</p>
        </div>
      </Card>
    </form>
  );
}
