"use client";

import { useActionState, useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createTranslator } from "next-intl";
import { Money } from "@pms/core";
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
  Card,
  FieldError,
  Input,
  Label,
  LinkButton,
  Select,
  SubmitButton,
  Textarea,
  cn,
} from "@/components/ui";
import { controlClasses } from "@/components/ui/controls";
import { day, money, stay } from "@/lib/format";

type Tr = (key: string, values?: Record<string, string | number>) => string;
export interface Inventory {
  roomTypes: Array<{ id: string; title: string; maxOccupancy: number }>;
  ratePlans: Array<{ id: string; title: string; roomTypeId: string }>;
}

const fold = (x: string) =>
  x
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
const nextDay = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};
/** "375", "375.5", "375,50" → minor units in the currency's own decimals; undefined if not an amount. */
const toMinor = (text: string, currency: string): number | undefined => {
  const clean = text.trim().replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(clean)) return undefined;
  try {
    return Money.parse(clean, currency).minor;
  } catch {
    return undefined;
  }
};
/** Minor units → "375.00" for the total box's placeholder, without a float. */
const toMajor = (minor: number, currency: string): string => {
  const exp = Money.exponent(currency);
  if (exp === 0) return String(minor);
  const s = String(Math.abs(minor)).padStart(exp + 1, "0");
  return `${s.slice(0, -exp)}.${s.slice(-exp)}`;
};

const LANGUAGES = ["en", "pt", "fr", "es", "de", "it", "nl", "ar"] as const;

/**
 * Staff booking (spec 08 §8.11, design canvas November 2026): where and when, the guest, price
 * and payment, with a summary that stays in view. Availability and price come from the same
 * check the create runs; one booking path with the booking engine.
 */
export function StaffBookingForm({
  properties,
  initial = {},
  initialInventory,
  messages,
  locale,
}: {
  properties: Array<{ id: string; title: string }>;
  /** The calendar's "new reservation here" and the palette's "for <guest>" arrive prefilled. */
  initial?: { propertyId?: string; arrivalDate?: string; departureDate?: string; guest?: string };
  /** The first property's rooms and rate plans, already loaded by the page. */
  initialInventory: Inventory;
  /** The `reservations.new` messages, ICU as written: plurals are formatted here. */
  messages: Record<string, string>;
  locale: string;
}) {
  const router = useRouter();
  const tr = useMemo(
    () =>
      createTranslator({
        locale,
        messages: { form: messages },
        namespace: "form",
      }) as unknown as Tr,
    [locale, messages],
  );
  const firstProperty =
    properties.find((p) => p.id === initial.propertyId)?.id ?? properties[0]?.id ?? "";
  const firstRoom = initialInventory.roomTypes[0]?.id ?? "";
  const [propertyId, setPropertyId] = useState(firstProperty);
  const [inventory, setInventory] = useState<Inventory>(initialInventory);
  const [roomTypeId, setRoomTypeId] = useState(firstRoom);
  const [ratePlanId, setRatePlanId] = useState(
    initialInventory.ratePlans.find((r) => r.roomTypeId === firstRoom)?.id ?? "",
  );
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
  const [active, setActive] = useState(-1);
  const [picked, setPicked] = useState<ReturningGuest | null>(null);
  const [state, action, pending] = useActionState(createStaffBookingAction, {});
  const lookedUpInitial = useRef(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const optionId = (i: number) => `${listId}-opt-${i}`;

  // a different property: load its rooms (the first property's came with the page)
  const loadedFor = useRef(firstProperty);
  useEffect(() => {
    if (!propertyId || loadedFor.current === propertyId) return;
    loadedFor.current = propertyId;
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
    const typed = total.trim() ? toMinor(total, quote?.currency ?? "EUR") : undefined;
    const h = setTimeout(() => {
      void quoteStaffBookingAction({
        propertyId,
        roomTypeId,
        ratePlanId,
        arrivalDate: arrival,
        departureDate: departure,
        ...(typed !== undefined ? { totalMinor: typed } : {}),
      })
        .then(setQuote)
        .catch(() => setQuote(null));
    }, 250);
    return () => clearTimeout(h);
    // the currency only changes with the property, which re-quotes anyway
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
          setActive(-1);
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
  // a failed create: the message sits next to the button and takes focus, so it is read
  useEffect(() => {
    if (state.error) errorRef.current?.focus();
  }, [state]);

  function pick(g: ReturningGuest) {
    setPicked(g);
    setMatches([]);
    setActive(-1);
    setFullName(`${g.name} ${g.surname}`);
    setEmail(g.email ?? "");
    setPhone(g.phone ?? "");
    setLanguage(g.language ?? "");
  }

  const property = properties.find((p) => p.id === propertyId);
  const roomType = inventory.roomTypes.find((r) => r.id === roomTypeId);
  const currency = quote?.currency ?? "EUR";
  const cur = (m: number) => money(m, currency, locale);
  const uniform =
    quote && quote.nightly.length > 0
      ? quote.nightly.every((n) => n.amountMinor === quote.nightly[0]!.amountMinor)
      : false;
  const open = matches.length > 0;
  const unavailable = quote !== null && !quote.ok;
  const fieldError = (name: string) => state.fieldErrors?.[name];
  const section = "flex flex-col gap-4";
  const grid = "grid grid-cols-1 gap-4 sm:grid-cols-2";
  const dateInput = (
    name: string,
    label: string,
    value: string,
    set: (v: string) => void,
    min?: string,
  ) => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`date-${name}`}>{label}</Label>
      <input
        id={`date-${name}`}
        data-testid={`date-${name}`}
        type="date"
        name={name}
        required
        value={value}
        min={min}
        onChange={(e) => set(e.target.value)}
        aria-invalid={fieldError(name) ? true : undefined}
        aria-describedby={fieldError(name) ? `date-${name}-err` : undefined}
        className={cn(controlClasses, "h-10.5 tabular-nums")}
      />
      {fieldError(name) ? (
        <FieldError id={`date-${name}-err`}>{fieldError(name)}</FieldError>
      ) : null}
    </div>
  );
  const numberInput = (name: string, label: string, value: string, set: (v: string) => void) => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`field-${name}`}>{label}</Label>
      <Input
        id={`field-${name}`}
        name={name}
        type="number"
        inputMode="numeric"
        min={name === "adults" ? 1 : 0}
        value={value}
        onChange={(e) => set(e.target.value)}
        aria-invalid={fieldError(name) ? true : undefined}
      />
      {fieldError(name) ? <FieldError>{fieldError(name)}</FieldError> : null}
    </div>
  );

  return (
    <form
      action={action}
      className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] xl:grid-cols-[minmax(0,1fr)_minmax(0,27rem)]"
      data-testid="staff-booking-form"
    >
      <div className="flex min-w-0 flex-col gap-5">
        <Card title={tr("where")}>
          <div className={section}>
            <div className={grid}>
              <Select
                label={tr("property")}
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
                label={tr("room")}
                name="roomTypeId"
                value={roomTypeId}
                onChange={(v) => {
                  setRoomTypeId(v);
                  setRatePlanId(inventory.ratePlans.find((r) => r.roomTypeId === v)?.id ?? "");
                }}
              >
                {inventory.roomTypes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {tr("sleeps", { title: r.title, n: r.maxOccupancy })}
                  </option>
                ))}
              </Select>
              {dateInput("arrivalDate", tr("checkIn"), arrival, setArrival)}
              {dateInput(
                "departureDate",
                tr("checkOut"),
                departure,
                setDeparture,
                arrival ? nextDay(arrival) : undefined,
              )}
              {numberInput("adults", tr("adults"), adults, setAdults)}
              {numberInput("children", tr("children"), children, setChildren)}
            </div>
            {/* the availability answer is announced as it changes (WCAG 4.1.3) */}
            <div aria-live="polite" aria-atomic="true">
              {quote ? (
                quote.ok ? (
                  <p
                    className="rounded-control border border-accent/30 bg-accent-soft/50 px-4 py-3 text-sm text-accent-soft-foreground"
                    data-testid="availability"
                    data-state="available"
                  >
                    <strong>{tr("available")}</strong>{" "}
                    {tr("availableDetail", { nights: quote.nights })}
                    {quote.minStay ? ` · ${tr("minStay", { n: quote.minStay })}` : ""}
                    {" · "}
                    {tr("noRestrictions")} {tr("channelsClose")}
                  </p>
                ) : (
                  <div
                    className="rounded-control border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning-soft-foreground"
                    data-testid="availability"
                    data-state="unavailable"
                  >
                    <strong>{tr("unavailable")}</strong>
                    {quote.reasons.length ? (
                      <ul className="mt-1 list-disc ps-4">
                        {quote.reasons.map((r) => (
                          <li key={r}>{r}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                )
              ) : null}
            </div>
          </div>
        </Card>

        <Card title={tr("guest")}>
          <div className={grid}>
            <div className="relative flex flex-col gap-1.5">
              <Label htmlFor="field-fullName">{tr("fullName")}</Label>
              {/* the ARIA 1.2 combobox: the list is owned by the input, Up/Down move, Enter picks, Esc closes */}
              <Input
                id="field-fullName"
                name="fullName"
                required
                autoComplete="off"
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={open}
                aria-controls={listId}
                aria-activedescendant={open && active >= 0 ? optionId(active) : undefined}
                aria-describedby="field-fullName-hint"
                aria-invalid={fieldError("fullName") ? true : undefined}
                placeholder={tr("fullNameHint")}
                value={fullName}
                onChange={(e) => {
                  setFullName(e.target.value);
                  setPicked(null);
                }}
                onKeyDown={(e) => {
                  if (!open) return;
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setActive((i) => (i + 1) % matches.length);
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setActive((i) => (i <= 0 ? matches.length - 1 : i - 1));
                  } else if (e.key === "Enter" && active >= 0) {
                    e.preventDefault();
                    pick(matches[active]!);
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    setMatches([]);
                    setActive(-1);
                  }
                }}
                onBlur={() => {
                  setMatches([]);
                  setActive(-1);
                }}
              />
              <span id="field-fullName-hint" className="sr-only">
                {tr("fullNameHint")}
              </span>
              {fieldError("fullName") ? <FieldError>{fieldError("fullName")}</FieldError> : null}
              {picked ? (
                <span className="text-xs text-muted" data-testid="returning-guest">
                  {tr("returning", { n: tr("stays", { n: picked.stays }) })}
                </span>
              ) : null}
              <ul
                id={listId}
                role="listbox"
                aria-label={tr("returningList")}
                hidden={!open}
                className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-control border border-border bg-surface shadow-float"
              >
                {matches.map((g, i) => (
                  <li
                    key={g.guestId}
                    id={optionId(i)}
                    role="option"
                    aria-selected={i === active}
                    // keep focus in the input: the pick happens before the blur closes the list
                    onMouseDown={(e) => {
                      e.preventDefault();
                      pick(g);
                    }}
                    onMouseEnter={() => setActive(i)}
                    className={cn(
                      "flex cursor-pointer flex-col px-3.5 py-2 text-start text-sm",
                      i === active ? "bg-selected" : "hover:bg-default",
                    )}
                  >
                    <span className="font-semibold">
                      {g.name} {g.surname}
                    </span>
                    <span className="text-xs text-muted">
                      {[g.email, g.country, tr("stays", { n: g.stays })]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="field-email">{tr("email")}</Label>
              <Input
                id="field-email"
                name="email"
                type="email"
                autoComplete="off"
                spellCheck={false}
                placeholder="guest@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="field-phone">{tr("phone")}</Label>
              <Input
                id="field-phone"
                name="phone"
                type="tel"
                autoComplete="off"
                placeholder="+351 …"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <Select
              label={tr("language")}
              name="language"
              value={language}
              onChange={(v) => setLanguage(v)}
            >
              <option value="">{tr("languageUnknown")}</option>
              {LANGUAGES.map((code) => (
                <option key={code} value={code}>
                  {new Intl.DisplayNames([locale], { type: "language" }).of(code) ?? code}
                </option>
              ))}
            </Select>
          </div>
        </Card>

        <Card title={tr("price")}>
          <div className={section}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Select
                label={tr("ratePlan")}
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
                  {quote?.currency ? tr("total", { currency: quote.currency }) : tr("totalLabel")}
                </Label>
                <Input
                  id="field-total"
                  name="total"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder={quote?.ok ? toMajor(quote.totalMinor, quote.currency) : ""}
                  value={total}
                  onChange={(e) => setTotal(e.target.value)}
                  aria-describedby="field-total-hint"
                  aria-invalid={fieldError("total") ? true : undefined}
                />
                <span id="field-total-hint" className="text-xs text-muted">
                  {tr("totalHint")}
                </span>
                {fieldError("total") ? <FieldError>{fieldError("total")}</FieldError> : null}
              </div>
              <Select label={tr("source")} name="source" defaultValue="phone">
                <option value="phone">{tr("sourcePhone")}</option>
                <option value="walk_in">{tr("sourceWalkIn")}</option>
                <option value="direct">{tr("sourceDirect")}</option>
                <option value="staff">{tr("sourceStaff")}</option>
              </Select>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Select label={tr("payment")} name="payment" defaultValue="later">
                <option value="later">{tr("payLater")}</option>
                <option value="card">{tr("payCard")}</option>
                <option value="cash">{tr("payCash")}</option>
                <option value="bank_transfer">{tr("payTransfer")}</option>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="field-note">{tr("note")}</Label>
              <Textarea id="field-note" name="note" rows={2} placeholder={tr("noteHint")} />
            </div>
          </div>
        </Card>
      </div>

      <Card title={tr("summary")} className="lg:sticky lg:top-20">
        <div className="flex flex-col gap-4 text-sm">
          <p>
            <strong className="block">
              {property?.title}
              {roomType ? ` · ${roomType.title}` : ""}
            </strong>
            {arrival && departure && arrival < departure ? (
              <span className="text-xs text-muted">
                {stay(arrival, departure, locale)}
                {quote ? ` · ${tr("nights", { n: quote.nights })}` : ""} ·{" "}
                {tr("adultsN", { n: Number(adults) || 0 })}
              </span>
            ) : (
              <span className="text-xs text-muted">{tr("pickDates")}</span>
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
                <dt>{tr("totalLabel")}</dt>
                <dd className="tabular-nums">{cur(quote.totalMinor)}</dd>
              </div>
              {quote.dueNow ? (
                <div className="flex justify-between py-1.5">
                  <dt>{tr("dueNow", { name: quote.dueNow.name })}</dt>
                  <dd className="tabular-nums">{cur(quote.dueNow.amountMinor)}</dd>
                </div>
              ) : null}
            </dl>
          ) : null}
          {state.error ? (
            <Alert ref={errorRef} tabIndex={-1} data-testid="create-error">
              {state.error}
              {state.reasons?.length ? (
                <ul className="mt-1 list-disc ps-4">
                  {state.reasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              ) : null}
            </Alert>
          ) : null}
          <SubmitButton
            size="lg"
            fullWidth
            disabled={pending || unavailable}
            pendingLabel={tr("creating")}
            testId="create-booking"
          >
            {tr("create")}
          </SubmitButton>
          {unavailable ? <p className="-mt-2 text-xs text-muted">{tr("pickOtherDates")}</p> : null}
          <LinkButton href="/reservations" fullWidth>
            {tr("cancel")}
          </LinkButton>
          <p className="text-xs text-muted">{tr("sideEffects")}</p>
        </div>
      </Card>
    </form>
  );
}
