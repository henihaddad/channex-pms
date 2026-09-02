import { LocalDate } from "../shared/local-date.js";
import { checkSellable } from "../operations/staff-booking.js";
import type {
  Extra,
  GuaranteePolicy,
  Offer,
  PromoCode,
  Quote,
  SearchQuery,
  SearchableRoomType,
  TaxRules,
} from "./types.js";

/**
 * BE-2/BE-4: search reads our own ARI. A room type × rate plan is offered only
 * when every night has a rate, no night is stop-sold, CTA/CTD and min/max stay
 * hold, and every night has at least one room left after bookings, blocks and
 * holds. Occupancy pricing uses the plan's per-occupancy rate when it has one.
 */
export function searchOffers(
  propertyId: string,
  roomTypes: readonly SearchableRoomType[],
  q: SearchQuery,
): Offer[] {
  const party = q.adults + q.children;
  const out: Offer[] = [];
  const arrival = LocalDate.parse(q.arrivalDate);
  const departure = LocalDate.parse(q.departureDate);
  if (!arrival.isBefore(departure)) return out;
  const nights = arrival.daysUntil(departure);
  for (const rt of roomTypes) {
    if (party > rt.maxOccupancy) continue;
    let available = Number.POSITIVE_INFINITY;
    for (let d = arrival; d.isBefore(departure); d = d.plusDays(1))
      available = Math.min(available, rt.availability.get(d.toString()) ?? 0);
    if (!Number.isFinite(available) || available < 1) continue;
    for (const rp of rt.ratePlans) {
      const priced = rp.cells.map((c) => {
        const rate = c.values.rates?.[party] ?? c.values.rates?.[Math.min(party, 2)];
        return rate === undefined ? c : { ...c, values: { ...c.values, rate } };
      });
      const check = checkSellable({
        arrivalDate: q.arrivalDate,
        departureDate: q.departureDate,
        rateCells: priced,
        availability: rt.availability,
      });
      if (!check.ok) continue;
      out.push({
        propertyId,
        roomTypeId: rt.roomTypeId,
        roomTypeTitle: rt.title,
        ratePlanId: rp.ratePlanId,
        ratePlanTitle: rp.title,
        currency: rp.currency,
        nights,
        nightly: check.nightly,
        roomMinor: check.totalMinor,
        available,
        directOnly: rp.directOnly,
        mealPlan: rp.mealPlan,
      });
    }
  }
  return out.sort(
    (a, b) =>
      a.roomMinor - b.roomMinor ||
      a.roomTypeTitle.localeCompare(b.roomTypeTitle) ||
      a.ratePlanTitle.localeCompare(b.ratePlanTitle),
  );
}

/** Spec 10 §10.5 promo codes: percentage or amount within their validity, stay and usage constraints. */
export function promoDiscount(
  promo: PromoCode | null,
  offer: Pick<Offer, "roomMinor" | "nights" | "propertyId">,
  q: Pick<SearchQuery, "arrivalDate" | "departureDate">,
  nowIso: string,
): { discountMinor: number; reason: string | null } {
  if (!promo) return { discountMinor: 0, reason: null };
  const today = nowIso.slice(0, 10);
  if (!promo.active) return { discountMinor: 0, reason: "code is not active" };
  if (promo.propertyId && promo.propertyId !== offer.propertyId)
    return { discountMinor: 0, reason: "code is for another property" };
  if (promo.validFrom && today < promo.validFrom)
    return { discountMinor: 0, reason: "code not valid yet" };
  if (promo.validTo && today > promo.validTo) return { discountMinor: 0, reason: "code expired" };
  if (promo.stayFrom && q.arrivalDate < promo.stayFrom)
    return { discountMinor: 0, reason: "stay too early for this code" };
  if (promo.stayTo && q.departureDate > promo.stayTo)
    return { discountMinor: 0, reason: "stay too late for this code" };
  if (promo.minNights && offer.nights < promo.minNights)
    return { discountMinor: 0, reason: `code needs ${String(promo.minNights)} nights` };
  if (promo.maxUses !== null && promo.uses >= promo.maxUses)
    return { discountMinor: 0, reason: "code fully used" };
  if (promo.singleUse && promo.uses >= 1) return { discountMinor: 0, reason: "code already used" };
  const discount =
    promo.kind === "percent"
      ? Math.round((offer.roomMinor * promo.value) / 100)
      : Math.min(offer.roomMinor, promo.value);
  return { discountMinor: discount, reason: null };
}

/** BE-1: the itemised quote; taxes and fees shown before payment, and what is due now under the guarantee policy. */
export function quote(input: {
  offer: Offer;
  adults: number;
  children: number;
  extras: Array<{ extra: Extra; quantity: number }>;
  promo: PromoCode | null;
  taxes: TaxRules;
  guarantee: GuaranteePolicy;
  nowIso: string;
  arrivalDate: string;
  departureDate: string;
}): Quote {
  const persons = input.adults + input.children;
  const extras = input.extras.map(({ extra, quantity }) => {
    const units = extra.per === "night" ? input.offer.nights : extra.per === "person" ? persons : 1;
    return {
      id: extra.id,
      name: extra.name,
      quantity,
      amountMinor: extra.priceMinor * units * quantity,
    };
  });
  const extrasMinor = extras.reduce((a, e) => a + e.amountMinor, 0);
  const { discountMinor } = promoDiscount(input.promo, input.offer, input, input.nowIso);
  const taxable = input.offer.roomMinor - discountMinor + extrasMinor;
  const vatMinor = Math.round((taxable * input.taxes.vatBps) / 10_000);
  const taxedNights =
    input.taxes.cityTaxMaxNights === null
      ? input.offer.nights
      : Math.min(input.offer.nights, input.taxes.cityTaxMaxNights);
  const cityTaxMinor = input.taxes.cityTaxPerPersonNightMinor * input.adults * taxedNights;
  const totalMinor = taxable + vatMinor + cityTaxMinor;
  const g = input.guarantee;
  const dueNow =
    g.kind === "prepay"
      ? totalMinor
      : g.kind === "deposit_fixed"
        ? Math.min(totalMinor, g.amountMinor)
        : g.kind === "deposit_percent"
          ? Math.round((totalMinor * g.percentBps) / 10_000)
          : 0;
  const label =
    g.kind === "prepay"
      ? "full prepayment"
      : g.kind === "deposit_fixed" || g.kind === "deposit_percent"
        ? "deposit"
        : g.kind === "card_on_file"
          ? "card held as guarantee, nothing charged now"
          : "pay at the property";
  return {
    currency: input.offer.currency,
    nights: input.offer.nights,
    roomMinor: input.offer.roomMinor,
    extrasMinor,
    extras,
    discountMinor,
    promoCode: discountMinor > 0 && input.promo ? input.promo.code : null,
    vatMinor,
    cityTaxMinor,
    totalMinor,
    dueNowMinor: dueNow,
    dueNowLabel: label,
  };
}

/** BE-5: a hold lives 15 minutes by default and counts against availability while it does. */
export function holdExpiry(nowIso: string, minutes = 15): string {
  return new Date(Date.parse(nowIso) + minutes * 60_000).toISOString();
}

export function activeHoldsByDate(
  holds: ReadonlyArray<{
    roomTypeId: string;
    arrivalDate: string;
    departureDate: string;
    rooms: number;
    expiresAt: string;
    state: string;
  }>,
  roomTypeId: string,
  nowIso: string,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const h of holds) {
    if (h.roomTypeId !== roomTypeId || h.state !== "held" || h.expiresAt <= nowIso) continue;
    for (
      let d = LocalDate.parse(h.arrivalDate);
      d.isBefore(LocalDate.parse(h.departureDate));
      d = d.plusDays(1)
    )
      out.set(d.toString(), (out.get(d.toString()) ?? 0) + h.rooms);
  }
  return out;
}

/** BE-7: an iCalendar file for the stay; times are property check-in/out, all-day otherwise. */
export function icsFor(b: {
  uid: string;
  propertyTitle: string;
  address: string;
  arrivalDate: string;
  departureDate: string;
  checkInTime: string;
  checkOutTime: string;
  reference: string;
  portalUrl: string;
}): string {
  const stamp = (d: string, t: string) => `${d.replace(/-/g, "")}T${t.replace(":", "")}00`;
  const esc = (s: string) =>
    s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Channex PMS//Booking//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${b.uid}`,
    `DTSTAMP:${stamp(b.arrivalDate, "00:00")}Z`,
    `DTSTART:${stamp(b.arrivalDate, b.checkInTime)}`,
    `DTEND:${stamp(b.departureDate, b.checkOutTime)}`,
    `SUMMARY:${esc(`Stay at ${b.propertyTitle}`)}`,
    `LOCATION:${esc(b.address)}`,
    `DESCRIPTION:${esc(`Reference ${b.reference}. Manage your stay: ${b.portalUrl}`)}`,
    `URL:${b.portalUrl}`,
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}

/** Access-code reveal window (spec 10 §10.6): the configured hours before arrival, until departure. */
export function accessRevealOpen(
  nowIso: string,
  validFromIso: string | null,
  validToIso: string | null,
  revealHours: number,
): boolean {
  if (!validFromIso) return false;
  const opens = Date.parse(validFromIso) - revealHours * 3_600_000;
  const closes = validToIso ? Date.parse(validToIso) : Number.POSITIVE_INFINITY;
  const now = Date.parse(nowIso);
  return now >= opens && now <= closes;
}
