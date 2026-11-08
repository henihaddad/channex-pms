"use client";

import { useRef, useState } from "react";
import {
  quote as buildQuote,
  type Extra,
  type GuaranteePolicy,
  type Offer,
  type PromoCode,
  type TaxRules,
} from "@pms/core";
import { money } from "@/lib/format";
import { money2 } from "../labels";
import { cn } from "@/components/ui";
import { holdAction } from "../book.actions";

export interface PanelOffer {
  offer: Offer;
  /** What this rate costs per night on the channel the property is listed on, if dearer. */
  compare: { minor: number; label: string } | null;
  /** "Free cancellation until 9 Nov", "No refund". */
  terms: string;
}

const control =
  "block h-[42px] w-full min-w-0 rounded-control border border-[#d5d9d7] bg-surface px-3.5 text-sm text-foreground focus:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/30";

/**
 * The booking card beside a property (spec 10 §10.2 steps 1–3): dates and guests (a GET
 * search that reloads the offers), one radio per sellable room × rate, the extras, the
 * itemised price for the choice (BE-1, computed by the same `quote` the hold uses), and
 * the Book button that holds the room (BE-5). Without JavaScript both forms still post.
 */
export function BookingPanel({
  propertyId,
  currency,
  sp,
  offers,
  extras,
  taxes,
  guarantee,
  promo,
  nowIso,
  fromMinor,
  fromCompare,
  error,
  scarce,
  labels,
  guestOptions,
}: {
  propertyId: string;
  currency: string;
  sp: {
    arrival?: string;
    departure?: string;
    adults: number;
    children: number;
    promo?: string;
    embed?: string;
  };
  offers: PanelOffer[] | null;
  extras: Extra[];
  taxes: TaxRules;
  guarantee: GuaranteePolicy;
  promo: PromoCode | null;
  nowIso: string;
  fromMinor: number | null;
  fromCompare: { minor: number; label: string } | null;
  error: string | null;
  /** Rooms of a kind: "2 left" means something. A single unit is always the last one. */
  scarce: boolean;
  labels: Record<string, string>;
  guestOptions: Array<{ value: string; label: string }>;
}) {
  const [picked, setPicked] = useState(0);
  const [chosen, setChosen] = useState<string[]>([]);
  const searchRef = useRef<HTMLFormElement>(null);
  const current = offers?.[picked] ?? null;
  const q = current
    ? buildQuote({
        offer: current.offer,
        adults: sp.adults,
        children: sp.children,
        extras: extras
          .filter((e) => chosen.includes(e.id))
          .map((extra) => ({ extra, quantity: 1 })),
        promo,
        taxes,
        guarantee,
        nowIso,
        arrivalDate: sp.arrival ?? "",
        departureDate: sp.departure ?? "",
      })
    : null;
  const perNight = current ? Math.round(current.offer.roomMinor / current.offer.nights) : fromMinor;
  const compare = current ? current.compare : fromCompare;
  const resubmit = () => {
    const f = searchRef.current;
    if (!f) return;
    const a = (f.elements.namedItem("arrival") as HTMLInputElement | null)?.value;
    const d = (f.elements.namedItem("departure") as HTMLInputElement | null)?.value;
    if (a && d && a < d) f.requestSubmit();
  };
  return (
    <aside
      className="flex flex-col gap-3.5 rounded-2xl border border-border bg-surface p-[22px] shadow-[0_12px_32px_rgba(20,23,22,0.06)] lg:sticky lg:top-5"
      aria-label={labels.bookTitle}
    >
      <div className="flex items-baseline gap-2">
        {perNight === null ? (
          <strong className="font-display text-xl font-bold">{labels.chooseDates}</strong>
        ) : (
          <>
            {current ? null : <span className="text-sm text-muted">{labels.from}</span>}
            <strong className="font-display text-[28px] font-bold">
              {money(perNight, currency)}
            </strong>
            <span className="text-sm text-muted">/ {labels.night}</span>
          </>
        )}
        {compare ? (
          <span className="ms-auto rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap text-accent-soft-foreground">
            {compare.label}
          </span>
        ) : null}
      </div>

      <form
        ref={searchRef}
        action={`/book/${propertyId}`}
        method="get"
        className="flex flex-col gap-3.5"
        data-testid="search"
      >
        {sp.embed ? <input type="hidden" name="embed" value="1" /> : null}
        {sp.promo ? <input type="hidden" name="promo" value={sp.promo} /> : null}
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1.5 text-[13px] font-semibold">
            {labels.checkIn}
            <input
              type="date"
              name="arrival"
              required
              defaultValue={sp.arrival}
              min={nowIso.slice(0, 10)}
              onChange={resubmit}
              data-testid="date-arrival"
              className={control}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-[13px] font-semibold">
            {labels.checkOut}
            <input
              type="date"
              name="departure"
              required
              defaultValue={sp.departure}
              min={nowIso.slice(0, 10)}
              onChange={resubmit}
              data-testid="date-departure"
              className={control}
            />
          </label>
        </div>
        <label className="flex flex-col gap-1.5 text-[13px] font-semibold">
          {labels.guests}
          <select
            name="party"
            defaultValue={`${sp.adults}-${sp.children}`}
            onChange={(e) => {
              const [a, c] = e.target.value.split("-");
              const f = searchRef.current;
              if (!f) return;
              (f.elements.namedItem("adults") as HTMLInputElement).value = a ?? "2";
              (f.elements.namedItem("children") as HTMLInputElement).value = c ?? "0";
              resubmit();
            }}
            className={cn(control, "appearance-none")}
          >
            {guestOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <input type="hidden" name="adults" defaultValue={sp.adults} />
        <input type="hidden" name="children" defaultValue={sp.children} />
        {offers === null ? (
          <button
            type="submit"
            className="inline-flex h-12 items-center justify-center rounded-full bg-accent text-[15px] font-bold text-accent-foreground hover:bg-accent/90"
            data-testid="search-submit"
          >
            {labels.checkPrices}
          </button>
        ) : (
          <noscript>
            <button type="submit" className="text-sm font-semibold text-accent underline">
              {labels.update}
            </button>
          </noscript>
        )}
      </form>

      {error ? (
        <p
          className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger-soft-foreground"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      {offers !== null && offers.length === 0 ? (
        <p className="rounded-xl bg-default px-3 py-3 text-sm text-muted" data-testid="no-offers">
          {labels.noResults}
        </p>
      ) : null}

      {offers && offers.length > 0 && current && q ? (
        <form action={holdAction} className="flex flex-col gap-3.5">
          <input type="hidden" name="propertyId" value={propertyId} />
          <input type="hidden" name="arrival" value={sp.arrival} />
          <input type="hidden" name="departure" value={sp.departure} />
          <input type="hidden" name="adults" value={sp.adults} />
          <input type="hidden" name="children" value={sp.children} />
          <input type="hidden" name="promo" value={sp.promo ?? ""} />
          {sp.embed ? <input type="hidden" name="embed" value="1" /> : null}
          <fieldset className="flex flex-col gap-2" data-testid="offers">
            <legend className="sr-only">{labels.rate}</legend>
            {offers.map((o, i) => (
              <label
                key={`${o.offer.roomTypeId}:${o.offer.ratePlanId}`}
                className={cn(
                  "flex cursor-pointer gap-2.5 rounded-xl px-3 py-2.5 text-[13px]",
                  i === picked ? "border-2 border-accent" : "border border-[#d5d9d7]",
                )}
                data-testid="offer"
              >
                <input
                  type="radio"
                  name="offer"
                  value={`${o.offer.roomTypeId}:${o.offer.ratePlanId}`}
                  checked={i === picked}
                  onChange={() => setPicked(i)}
                  className="mt-0.5 accent-accent"
                />
                <span className="min-w-0">
                  <strong>
                    {offers.some((x) => x.offer.roomTypeId !== o.offer.roomTypeId)
                      ? `${o.offer.roomTypeTitle} · `
                      : ""}
                    {o.offer.ratePlanTitle} ·{" "}
                    <span data-testid="offer-total">{money(o.offer.roomMinor, currency)}</span>
                  </strong>
                  <span className="block text-xs text-muted">
                    {[
                      o.terms,
                      o.offer.directOnly ? labels.directOnly : null,
                      o.offer.mealPlan,
                      scarce && o.offer.available <= 2 ? labels[`left${o.offer.available}`] : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
          {extras.length > 0 ? (
            <fieldset className="flex flex-col gap-1.5">
              <legend className="mb-1 text-[13px] font-semibold">{labels.extras}</legend>
              {extras.map((e) => (
                <label key={e.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="extra"
                    value={e.id}
                    checked={chosen.includes(e.id)}
                    onChange={(ev) =>
                      setChosen((xs) =>
                        ev.target.checked ? [...xs, e.id] : xs.filter((x) => x !== e.id),
                      )
                    }
                    className="accent-accent"
                  />
                  {e.name} ({money(e.priceMinor, currency)}/{labels[`per_${e.per}`] ?? e.per})
                </label>
              ))}
            </fieldset>
          ) : null}
          <dl className="flex flex-col gap-1.5 text-sm" data-testid="panel-quote">
            <Line
              label={fill(labels.nightsTimes!, {
                price: money(Math.round(current.offer.roomMinor / current.offer.nights), currency),
              })}
              value={money2(q.roomMinor, currency)}
            />
            {q.extras.map((e) => (
              <Line key={e.id} label={e.name} value={money2(e.amountMinor, currency)} />
            ))}
            {q.discountMinor > 0 ? (
              <Line label={labels.discount!} value={money2(-q.discountMinor, currency)} />
            ) : null}
            {q.vatMinor > 0 ? (
              <Line label={labels.vat!} value={money2(q.vatMinor, currency)} />
            ) : null}
            {q.cityTaxMinor > 0 ? (
              <Line label={labels.cityTax!} value={money2(q.cityTaxMinor, currency)} />
            ) : null}
            <div className="mt-1 flex justify-between border-t border-border pt-2 font-bold">
              <dt>{labels.total}</dt>
              <dd>{money2(q.totalMinor, currency)}</dd>
            </div>
          </dl>
          <button
            type="submit"
            className="inline-flex h-12 items-center justify-center rounded-full bg-accent text-[15px] font-bold text-accent-foreground hover:bg-accent/90"
            data-testid="book-offer"
          >
            {fill(labels.book!, { total: money(q.totalMinor, currency) })}
          </button>
          <p className="text-center text-xs text-muted">
            {labels.instant} · {dueNowText(guarantee, q.dueNowMinor, currency, labels)} ·{" "}
            {labels.noFee}
          </p>
        </form>
      ) : null}
    </aside>
  );
}

/** "{nights} nights × {price}" with its values put in. */
function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-foreground">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

function dueNowText(
  g: GuaranteePolicy,
  dueMinor: number,
  currency: string,
  labels: Record<string, string>,
): string {
  if (g.kind === "deposit_percent")
    return fill(labels.payPercent!, { percent: Math.round(g.percentBps / 100) });
  if (g.kind === "deposit_fixed" || g.kind === "prepay")
    return fill(labels.payNow!, { amount: money(dueMinor, currency) });
  if (g.kind === "card_on_file") return labels.cardHeld!;
  return labels.payAtProperty!;
}
