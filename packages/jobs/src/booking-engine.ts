import {
  accessRevealOpen,
  cancellationFee,
  diffProjection,
  directBookingChange,
  directBookingRevision,
  holdExpiry,
  icsFor,
  Id,
  LocalDate,
  projectRevision,
  quote as buildQuote,
  searchOffers,
  type BookingRevisionPayload,
  type CancellationPolicy,
  type Clock,
  type Crypto,
  type Extra,
  type Id as IdT,
  type LockProvider,
  type Mailer,
  type Offer,
  type PaymentIntent,
  type PaymentProvider,
  type PromoCode,
  type Quote,
  type SearchQuery,
  planPayments,
} from "@pms/core";
import {
  asSystem,
  DrizzleAuditWriter,
  DrizzleBillingRepository,
  DrizzleBookingEngineRepository,
  DrizzleBookingRepository,
  DrizzleChannelRepository,
  DrizzleMessagingRepository,
  DrizzleOperationsRepository,
  DrizzleReservationRepository,
  rawRows,
  sql,
  withoutTenant,
  type Db,
  type EngineSettings,
  type HoldRow,
  type StorefrontProperty,
  type Tx,
  DrizzlePaymentRuleRepository,
} from "@pms/db";
import type { Logger } from "@pms/runtime";
import { queueAriPush } from "./ari-events.js";
import { recomputeAvailability } from "./availability.js";
import type { TxRunner } from "./channels.js";
import { issueCredential } from "./operations.js";

export interface EngineDeps {
  db: Db;
  clock: Clock;
  crypto: Crypto;
  log: Logger;
  mailer: Mailer;
  payments: PaymentProvider;
  lock: LockProvider;
  /** Public base URL for portal links in mails. */
  appUrl?: string;
}

/** Errors the funnel shows the guest verbatim (recoverable, spec 10 §10.4); everything else is a 500. */
export class EngineError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const repoFor = (deps: { crypto: Crypto }, tx: Tx, orgId: string) =>
  new DrizzleBookingEngineRepository(tx, orgId, deps.crypto);
const lastNight = (departureDate: string): string =>
  LocalDate.parse(departureDate).plusDays(-1).toString();
const money = (minor: number, currency: string): string =>
  `${(minor / 100).toFixed(2)} ${currency}`;

// ---- the direct channel (spec 10 §10.1) --------------------------------------------------------------

/**
 * The direct channel is a ChannelConnection with adapter_code "direct": rates and
 * availability flow through the same pipeline, channel mix reports it without a special case.
 */
export async function enableDirectChannel(
  deps: { crypto: Crypto },
  tx: Tx,
  orgId: string,
  propertyId: string,
  enabled: boolean,
): Promise<string> {
  const repo = repoFor(deps, tx, orgId);
  const settings = await repo.settings(propertyId);
  let connectionId = settings.connectionId;
  const channels = new DrizzleChannelRepository(tx, orgId);
  if (!connectionId) {
    connectionId = Id.next();
    await channels.insertConnection({
      id: connectionId,
      propertyId,
      adapterCode: "direct",
      settings: { kind: "booking_engine" },
    });
  }
  await channels.updateConnection(connectionId, {
    state: enabled ? "active" : "paused",
    isActive: enabled,
  });
  await repo.saveSettings(propertyId, { enabled, connectionId });
  return connectionId;
}

// ---- search (BE-1, BE-2, BE-4) ------------------------------------------------------------------------

export interface PropertySearch {
  offers: Offer[];
  promo: PromoCode | null;
  promoProblem: string | null;
}

/** Local search over our own ARI: no provider round trip, every restriction honoured. */
export async function searchProperty(
  deps: { crypto: Crypto },
  tx: Tx,
  orgId: string,
  propertyId: string,
  q: SearchQuery,
): Promise<PropertySearch> {
  const repo = repoFor(deps, tx, orgId);
  const roomTypes = await repo.searchable(propertyId, q.arrivalDate, q.departureDate);
  const offers = searchOffers(propertyId, roomTypes, q);
  const { promo, promoProblem } = await resolvePromo(repo, q, propertyId);
  return { offers, promo, promoProblem };
}

async function resolvePromo(
  repo: DrizzleBookingEngineRepository,
  q: SearchQuery,
  propertyId: string,
): Promise<{ promo: PromoCode | null; promoProblem: string | null }> {
  const code = q.promoCode?.trim();
  if (!code) return { promo: null, promoProblem: null };
  const promo = await repo.promo(code);
  if (!promo || !promo.active) return { promo: null, promoProblem: "unknown promo code" };
  if (promo.propertyId && promo.propertyId !== propertyId)
    return { promo: null, promoProblem: "promo code is for another property" };
  return { promo, promoProblem: null };
}

export interface StorefrontResult {
  property: StorefrontProperty;
  /** Cheapest offer for the query, or null when nothing is sellable for these dates. */
  from: Offer | null;
}

/** Portfolio-first storefront (spec 10 §10.3): every enabled property with its best price for the dates. */
export async function searchPortfolio(
  deps: { crypto: Crypto },
  tx: Tx,
  orgId: string,
  q: SearchQuery | null,
  filter: { attributes?: string[] } = {},
): Promise<StorefrontResult[]> {
  const repo = repoFor(deps, tx, orgId);
  const properties = await repo.storefront(filter);
  const out: StorefrontResult[] = [];
  for (const property of properties) {
    let from: Offer | null = null;
    if (q) {
      const roomTypes = await repo.searchable(property.id, q.arrivalDate, q.departureDate);
      const offers = searchOffers(property.id, roomTypes, q);
      from = offers.reduce<Offer | null>(
        (best, o) => (best === null || o.roomMinor < best.roomMinor ? o : best),
        null,
      );
      if (!from) continue;
    }
    out.push({ property, from });
  }
  return out;
}

// ---- holds (BE-5) -----------------------------------------------------------------------------------

export interface HoldInput {
  propertyId: string;
  roomTypeId: string;
  ratePlanId: string;
  arrivalDate: string;
  departureDate: string;
  adults: number;
  children: number;
  childAges: number[];
  extras: Array<{ id: string; quantity: number }>;
  promoCode: string | null;
  locale: string;
}

export interface HoldResult {
  holdId: string;
  offer: Offer;
  quote: Quote;
  expiresAt: string;
  settings: EngineSettings;
}

async function priceHold(
  repo: DrizzleBookingEngineRepository,
  input: HoldInput,
  nowIso: string,
): Promise<{ offer: Offer; quote: Quote; settings: EngineSettings; promo: PromoCode | null }> {
  const q: SearchQuery = {
    arrivalDate: input.arrivalDate,
    departureDate: input.departureDate,
    adults: input.adults,
    children: input.children,
    childAges: input.childAges,
    promoCode: input.promoCode,
  };
  const roomTypes = await repo.searchable(input.propertyId, q.arrivalDate, q.departureDate);
  const offer = searchOffers(input.propertyId, roomTypes, q).find(
    (o) => o.roomTypeId === input.roomTypeId && o.ratePlanId === input.ratePlanId,
  );
  if (!offer)
    throw new EngineError("not_available", "These dates are no longer available for that room");
  const settings = await repo.settings(input.propertyId);
  const catalogue = await repo.extras(input.propertyId);
  const extras: Array<{ extra: Extra; quantity: number }> = [];
  for (const e of input.extras) {
    const found = catalogue.find((c) => c.id === e.id && c.active);
    if (found && e.quantity > 0) extras.push({ extra: found, quantity: e.quantity });
  }
  const { promo, promoProblem } = await resolvePromo(repo, q, input.propertyId);
  if (promoProblem) throw new EngineError("promo_invalid", promoProblem);
  const quote = buildQuote({
    offer,
    adults: input.adults,
    children: input.children,
    extras,
    promo,
    taxes: settings.taxes,
    guarantee: settings.guarantee,
    nowIso,
    arrivalDate: input.arrivalDate,
    departureDate: input.departureDate,
  });
  return { offer, quote, settings, promo };
}

/** BE-5: a hold takes the rooms out of availability (OTAs included) for 15 minutes. */
export async function createHold(
  deps: { crypto: Crypto; clock: Clock },
  tx: Tx,
  orgId: string,
  input: HoldInput,
): Promise<HoldResult> {
  const repo = repoFor(deps, tx, orgId);
  const nowIso = deps.clock.now().toString();
  const { offer, quote, settings } = await priceHold(repo, input, nowIso);
  if (offer.available < 1) throw new EngineError("not_available", "The last room was just taken");
  const expiresAt = holdExpiry(nowIso);
  const holdId = await repo.createHold({
    propertyId: input.propertyId,
    roomTypeId: input.roomTypeId,
    ratePlanId: input.ratePlanId,
    arrivalDate: input.arrivalDate,
    departureDate: input.departureDate,
    adults: input.adults,
    children: input.children,
    childAges: input.childAges,
    quote,
    promoCode: quote.promoCode,
    extras: input.extras,
    locale: input.locale,
    expiresAt,
  });
  await recomputeAvailability(
    tx,
    orgId,
    input.propertyId,
    input.roomTypeId,
    input.arrivalDate,
    lastNight(input.departureDate),
    Date.parse(nowIso),
    "direct_hold",
  );
  await audit(
    deps,
    tx,
    orgId,
    holdId,
    "booking_engine:hold",
    { kind: "hold", id: holdId },
    {
      propertyId: input.propertyId,
      roomTypeId: input.roomTypeId,
      arrivalDate: input.arrivalDate,
      departureDate: input.departureDate,
      totalMinor: quote.totalMinor,
    },
  );
  return { holdId, offer, quote, expiresAt, settings };
}

/** The guest-details step; the hold keeps the sealed details for the confirm step and, with consent, recovery. */
export async function saveHoldGuest(
  deps: { crypto: Crypto },
  tx: Tx,
  orgId: string,
  holdId: string,
  guest: NonNullable<HoldRow["guest"]>,
  consentMarketing: boolean,
): Promise<void> {
  const repo = repoFor(deps, tx, orgId);
  const hold = await repo.hold(holdId);
  if (!hold || hold.state !== "held") throw new EngineError("hold_gone", "Your hold has expired");
  await repo.updateHold(holdId, { guest, consentMarketing });
}

/** Expired holds give the rooms back; scheduled every minute (BE-5). */
export async function expireHolds(deps: EngineDeps, orgId?: string): Promise<number> {
  const nowIso = deps.clock.now().toString();
  const orgs = orgId
    ? [orgId]
    : (
        await withoutTenant(deps.db, (tx) =>
          rawRows<{ org_id: string }>(
            tx,
            sql`select distinct org_id from booking_hold where state = 'held' and expires_at <= ${nowIso}`,
          ),
        )
      ).map((r) => r.org_id);
  let released = 0;
  for (const org of orgs) {
    released += await asSystem(deps.db, org, async (tx) => {
      const repo = repoFor(deps, tx, org);
      let n = 0;
      for (const h of await repo.expiredHolds(nowIso)) {
        await repo.releaseHold(h.id, "expired");
        await recomputeAvailability(
          tx,
          org,
          h.propertyId,
          h.roomTypeId,
          h.arrivalDate,
          lastNight(h.departureDate),
          Date.parse(nowIso),
          "direct_hold_expired",
        );
        n++;
      }
      return n;
    });
  }
  return released;
}

/** Spec 10 §10.5 abandonment recovery: off by default, consent required, exactly one mail per checkout. */
export async function sendAbandonmentMails(deps: EngineDeps, orgId: string): Promise<number> {
  const since = new Date(Date.parse(deps.clock.now().toString()) - 48 * 3_600_000).toISOString();
  const candidates = await asSystem(deps.db, orgId, async (tx) => {
    const repo = repoFor(deps, tx, orgId);
    const out = [];
    for (const h of await repo.abandoned(since)) {
      const settings = await repo.settings(h.propertyId);
      if (!settings.abandonmentEmails) continue;
      const [p] = await rawRows<{ title: string }>(
        tx,
        sql`select title from property where id = ${h.propertyId}`,
      );
      out.push({ ...h, propertyTitle: p?.title ?? "" });
    }
    return out;
  });
  let sent = 0;
  for (const h of candidates) {
    await deps.mailer.send({
      to: h.guest.email,
      template: "booking_abandoned",
      locale: h.locale,
      params: {
        name: h.guest.name,
        property: h.propertyTitle,
        arrival: h.arrivalDate,
        url: `${deps.appUrl ?? ""}/book/${h.propertyId}?arrival=${h.arrivalDate}`,
      },
    });
    await asSystem(deps.db, orgId, (tx) => repoFor(deps, tx, orgId).markRecoveryMailed(h.id));
    sent++;
  }
  return sent;
}

// ---- confirm (BE-6, BE-7, BE-8) ---------------------------------------------------------------------

export interface ConfirmInput {
  holdId: string;
  /** From the confirm button; a retry with the same key returns the same booking. */
  idempotencyKey: string;
  /** A provider token from hosted fields; never a PAN. */
  paymentMethodToken: string | null;
}

export type ConfirmResult =
  | { state: "confirmed"; bookingId: string; reference: string; portalToken: string | null }
  | { state: "requires_action"; holdId: string; nextAction: string }
  | { state: "declined"; holdId: string; reason: string };

/**
 * The confirm step in three phases so the card call never runs inside a tenant
 * transaction: claim the hold, talk to the payment provider, then make the booking.
 */
export async function confirmBooking(
  deps: EngineDeps,
  orgId: string,
  input: ConfirmInput,
  run: TxRunner,
): Promise<ConfirmResult> {
  const nowIso = deps.clock.now().toString();
  const claim = await run(async (tx) => {
    const repo = repoFor(deps, tx, orgId);
    const hold = await repo.hold(input.holdId);
    if (!hold) throw new EngineError("hold_gone", "Your hold has expired");
    const c = await repo.claimHold(input.holdId, input.idempotencyKey);
    return { hold, ...c };
  });
  if (!claim.claimed) {
    if (claim.state === "converted" && claim.bookingId) {
      const b = await run((tx) => bookingRef(tx, claim.bookingId!));
      return { state: "confirmed", bookingId: claim.bookingId, reference: b, portalToken: null };
    }
    throw new EngineError("hold_gone", "Your hold has expired; please search again");
  }
  const hold = claim.hold;
  if (!hold.guest) throw new EngineError("guest_required", "Guest details are missing");

  // phase 2: the payment, outside any transaction
  const dueNow = hold.quote.dueNowMinor;
  let intent: PaymentIntent | null = null;
  if (dueNow > 0) {
    if (hold.paymentIntentId) intent = await deps.payments.confirmIntent(hold.paymentIntentId);
    else {
      if (!input.paymentMethodToken)
        throw new EngineError("payment_required", "A payment method is required");
      intent = await deps.payments.createIntent({
        amountMinor: dueNow,
        currency: hold.quote.currency,
        paymentMethodToken: input.paymentMethodToken,
        capture: "automatic",
        description: `Stay ${hold.arrivalDate} → ${hold.departureDate}`,
        // one intent per confirm attempt: a retry after a decline is a new attempt, a double click is not
        idempotencyKey: `hold:${hold.id}:${input.idempotencyKey}`,
        metadata: { hold_id: hold.id, property_id: hold.propertyId },
      });
    }
    if (intent.status === "requires_action") {
      const next = intent.nextAction ?? "";
      await run((tx) =>
        repoFor(deps, tx, orgId).updateHold(hold.id, { paymentIntentId: intent!.intentId }),
      );
      return { state: "requires_action", holdId: hold.id, nextAction: next };
    }
    if (intent.status === "failed") {
      await run((tx) => repoFor(deps, tx, orgId).updateHold(hold.id, { paymentIntentId: null }));
      return {
        state: "declined",
        holdId: hold.id,
        reason: intent.failureReason ?? "Payment was not accepted",
      };
    }
  }

  // phase 3: the booking, on the one booking path (spec 08 §8.11)
  return run(async (tx) => finalize(deps, tx, orgId, hold, intent, nowIso));
}

async function bookingRef(tx: Tx, bookingId: string): Promise<string> {
  const [r] = await rawRows<{ code: string | null }>(
    tx,
    sql`select ota_reservation_code as code from booking where id = ${bookingId}`,
  );
  return r?.code ?? bookingId.slice(0, 8).toUpperCase();
}

async function finalize(
  deps: EngineDeps,
  tx: Tx,
  orgId: string,
  hold: HoldRow,
  intent: PaymentIntent | null,
  nowIso: string,
): Promise<ConfirmResult> {
  const repo = repoFor(deps, tx, orgId);
  const guest = hold.guest!;
  const priced = await priceHold(
    repo,
    {
      propertyId: hold.propertyId,
      roomTypeId: hold.roomTypeId,
      ratePlanId: hold.ratePlanId,
      arrivalDate: hold.arrivalDate,
      departureDate: hold.departureDate,
      adults: hold.adults,
      children: hold.children,
      childAges: hold.childAges,
      extras: hold.extras,
      promoCode: hold.promoCode,
      locale: hold.locale,
    },
    nowIso,
  ).catch((e: unknown) => {
    // the hold itself keeps the room; an expired hold that is still sellable converts, one that is not does not
    if (e instanceof EngineError && hold.expiresAt > nowIso) return null;
    throw e;
  });
  // BE-1: the price shown is the price charged. The quote on the hold is what the guest saw.
  const quoteNow = hold.quote;
  const offer = priced?.offer ?? null;
  const nightly = offer ? offer.nightly : nightlyFrom(hold);
  const discounted = applyDiscount(nightly, quoteNow.discountMinor);
  const [prop] = await rawRows<{
    title: string;
    currency: string;
    timezone: string;
    address: Record<string, string>;
    check_in: string | null;
    check_out: string | null;
  }>(
    tx,
    sql`select p.title, p.currency, p.timezone, p.address, pol.check_in_time as check_in, pol.check_out_time as check_out
        from property p left join policy pol on pol.property_id = p.id where p.id = ${hold.propertyId} limit 1`,
  );
  const rev = directBookingRevision(
    {
      bookingId: Id.next(),
      propertyId: hold.propertyId,
      roomTypeId: hold.roomTypeId,
      ratePlanId: hold.ratePlanId,
      arrivalDate: hold.arrivalDate,
      departureDate: hold.departureDate,
      currency: quoteNow.currency || prop?.currency || "EUR",
      occupancy: {
        adults: hold.adults,
        children: hold.children,
        infants: 0,
        ...(hold.childAges.length ? { ages: hold.childAges } : {}),
      },
      customer: {
        name: guest.name,
        surname: guest.surname,
        email: guest.email,
        ...(guest.phone ? { phone: guest.phone } : {}),
        language: guest.language,
      },
      source: "direct",
      nowIso,
    },
    {
      ok: true,
      reasons: [],
      totalMinor: Object.values(discounted).reduce((a, b) => a + b, 0),
      nightly: discounted,
    },
  );
  if (!rev.ok) throw new EngineError("booking_invalid", rev.error.message);
  const bookingId = await applyDirectRevision(deps, tx, orgId, rev.value, "direct_booking");
  await repo.convertHold(hold.id, bookingId);
  await recomputeAvailability(
    tx,
    orgId,
    hold.propertyId,
    hold.roomTypeId,
    hold.arrivalDate,
    lastNight(hold.departureDate),
    Date.parse(nowIso),
    "direct_booking",
  );
  if (quoteNow.promoCode) await repo.usePromo(quoteNow.promoCode);

  // folio: extras and taxes as lines, the payment as captured (spec 10 §10.5)
  const billing = new DrizzleBillingRepository(tx, orgId);
  const folioId = await billing.ensureFolio(bookingId);
  for (const x of quoteNow.extras)
    await billing.addLine(folioId, {
      kind: "extra",
      description: `${x.name} × ${String(x.quantity)}`,
      date: hold.arrivalDate,
      amountMinor: x.amountMinor,
    });
  if (quoteNow.vatMinor > 0)
    await billing.addLine(folioId, {
      kind: "tax",
      description: "VAT",
      date: hold.arrivalDate,
      amountMinor: quoteNow.vatMinor,
    });
  if (quoteNow.cityTaxMinor > 0)
    await billing.addLine(folioId, {
      kind: "tourist_tax",
      description: "City tax",
      date: hold.arrivalDate,
      amountMinor: quoteNow.cityTaxMinor,
    });
  if (intent && quoteNow.dueNowMinor > 0)
    await billing.addPayment(folioId, {
      method: "card",
      amountMinor: quoteNow.dueNowMinor,
      state: intent.status === "requires_capture" ? "held" : "captured",
      providerRef: intent.intentId,
    });

  // what the rules still expect to collect after today's payment (spec 10 §10.4)
  const rules = new DrizzlePaymentRuleRepository(tx, orgId);
  const plan = planPayments({
    rules: await rules.listRules(),
    totalMinor: Math.max(0, quoteNow.totalMinor - quoteNow.dueNowMinor),
    currency: quoteNow.currency,
    propertyId: hold.propertyId,
    channel: "direct",
    arrival: hold.arrivalDate,
    bookedOn: nowIso.slice(0, 10),
  });
  const later = plan.filter((i) => i.dueOn > nowIso.slice(0, 10));
  if (later.length > 0) await rules.saveSchedule(bookingId, quoteNow.currency, later);

  // the direct thread (spec 10 §10.6), the door code (spec 15 M7 exit), the portal link, the mail (BE-7)
  const [b] = await rawRows<{ guest_id: string | null; code: string | null }>(
    tx,
    sql`select guest_id, ota_reservation_code as code from booking where id = ${bookingId}`,
  );
  await new DrizzleMessagingRepository(tx, orgId, deps.crypto).ensureThreadForBooking({
    bookingId,
    propertyId: hold.propertyId,
    provider: "direct",
    arrivalDate: hold.arrivalDate,
    departureDate: hold.departureDate,
    status: "new",
    timezone: prop?.timezone ?? "UTC",
    channexBookingId: rev.value.bookingId,
    guestId: b?.guest_id ?? null,
    createdAt: nowIso,
    updatedAt: nowIso,
    propertyTitle: prop?.title ?? "",
  });
  await issueCredential(
    { db: deps.db, clock: deps.clock, crypto: deps.crypto, lock: deps.lock, log: deps.log },
    tx,
    orgId,
    {
      propertyId: hold.propertyId,
      bookingId,
      unitId: null,
      type: "door_code",
      timezone: prop?.timezone ?? "UTC",
      arrivalDate: hold.arrivalDate,
      departureDate: hold.departureDate,
      issuedBy: "booking_engine",
    },
  );
  const portalToken = deps.crypto.randomToken(32);
  await repo.createGuestSession(
    bookingId,
    deps.crypto.sha256Hex(portalToken),
    new Date(Date.parse(`${hold.departureDate}T00:00:00Z`) + 30 * 86_400_000).toISOString(),
  );
  const reference = b?.code ?? bookingId.slice(0, 8).toUpperCase();
  const portalUrl = `${deps.appUrl ?? ""}/guest?token=${portalToken}`;
  const address = Object.values(prop?.address ?? {}).join(", ");
  await deps.mailer.send({
    to: guest.email,
    template: "booking_confirmation",
    locale: hold.locale,
    params: {
      name: guest.name,
      property: prop?.title ?? "",
      arrival: hold.arrivalDate,
      departure: hold.departureDate,
      reference,
      total: money(quoteNow.totalMinor, quoteNow.currency),
      dueNow: money(quoteNow.dueNowMinor, quoteNow.currency),
      portalUrl,
      ics: icsFor({
        uid: `${bookingId}@channex-pms`,
        propertyTitle: prop?.title ?? "",
        address,
        arrivalDate: hold.arrivalDate,
        departureDate: hold.departureDate,
        checkInTime: prop?.check_in ?? "15:00",
        checkOutTime: prop?.check_out ?? "11:00",
        reference,
        portalUrl,
      }),
    },
  });
  await audit(
    deps,
    tx,
    orgId,
    hold.id,
    "booking:create",
    { kind: "booking", id: bookingId },
    { holdId: hold.id, totalMinor: quoteNow.totalMinor, paid: quoteNow.dueNowMinor },
  );
  return { state: "confirmed", bookingId, reference, portalToken };
}

function nightlyFrom(hold: HoldRow): Record<string, number> {
  // an expired-but-still-converting hold prices from its quote: even split, remainder on the last night
  const out: Record<string, number> = {};
  const nights = hold.quote.nights;
  const each = Math.floor(hold.quote.roomMinor / nights);
  let d = LocalDate.parse(hold.arrivalDate);
  for (let i = 0; i < nights; i++, d = d.plusDays(1))
    out[d.toString()] = i === nights - 1 ? hold.quote.roomMinor - each * (nights - 1) : each;
  return out;
}

/** A promo discount lowers what the owner statement sees: spread over the nights, remainder on the last. */
function applyDiscount(
  nightly: Record<string, number>,
  discountMinor: number,
): Record<string, number> {
  if (discountMinor <= 0) return nightly;
  const dates = Object.keys(nightly).sort();
  const total = dates.reduce((a, d) => a + nightly[d]!, 0);
  const out: Record<string, number> = {};
  let given = 0;
  dates.forEach((d, i) => {
    const share =
      i === dates.length - 1
        ? discountMinor - given
        : Math.floor((discountMinor * nightly[d]!) / Math.max(1, total));
    given += share;
    out[d] = nightly[d]! - share;
  });
  return out;
}

/**
 * Staff, phone, walk-in and direct bookings are revisions like any other (spec 08 §8.11):
 * projection, diff, outbox event, availability and push, exactly as an OTA revision.
 */
export async function applyDirectRevision(
  deps: { clock: Clock; crypto: Crypto },
  tx: Tx,
  orgId: string,
  rev: BookingRevisionPayload,
  source: string,
): Promise<string> {
  const bookings = new DrizzleBookingRepository(tx, orgId, deps.crypto);
  const prev = await bookings.loadProjection(rev.bookingId);
  const next = projectRevision(rev, prev?.bookingId ?? Id.next());
  const diff = diffProjection(prev, next);
  const now = deps.clock.now().toString();
  const event = {
    type: "booking.revision_applied",
    orgId: orgId as IdT,
    aggregate: { kind: "booking", id: next.bookingId as IdT },
    payload: {
      propertyId: rev.propertyId,
      bookingId: next.bookingId,
      diff,
      revisionId: rev.revisionId,
    },
    occurredAt: now,
    dedupeKey: `booking.revision_applied:${rev.systemId}`,
  };
  await bookings.applyRevision({ revision: rev, projection: next, diff, events: [event], now });
  const room = rev.rooms[0];
  if (room?.roomTypeId)
    await recomputeAvailability(
      tx,
      orgId,
      rev.propertyId,
      room.roomTypeId,
      rev.arrivalDate,
      lastNight(rev.departureDate),
      Date.parse(now),
      source,
    );
  await queueAriPush(tx, orgId, rev.propertyId, Date.parse(now), source);
  return next.bookingId;
}

async function audit(
  deps: { crypto: Crypto; clock: Clock },
  tx: Tx,
  orgId: string,
  guestRef: string,
  action: string,
  subject: { kind: string; id: string },
  after: unknown,
): Promise<void> {
  // BE-8: every step from hold to confirmation is an audit entry with actor_type guest
  await new DrizzleAuditWriter(tx, (s) => deps.crypto.sha256Hex(s)).append({
    orgId: orgId as IdT,
    actor: { type: "guest", id: guestRef },
    action,
    subject,
    after,
    surface: "booking_engine",
    occurredAt: deps.clock.now().toString(),
  });
}

// ---- guest portal (spec 10 §10.6) ------------------------------------------------------------------

export interface GuestPortal {
  bookingId: string;
  reference: string;
  status: string;
  property: {
    id: string;
    title: string;
    address: Record<string, string>;
    timezone: string;
    checkInTime: string;
    checkOutTime: string;
    houseManual: string | null;
  };
  arrivalDate: string;
  departureDate: string;
  nights: number;
  guestName: string;
  totalMinor: number;
  currency: string;
  folio: {
    lines: Array<{ kind: string; description: string; amountMinor: number }>;
    balanceMinor: number;
  };
  access:
    | { state: "none" }
    | { state: "hidden"; opensAt: string }
    | { state: "revealed"; code: string; validFrom: string; validTo: string };
  preCheckin: {
    arrivalTime: string | null;
    preferences: string | null;
    guests: Array<{ name: string; surname: string }>;
    completedAt: string | null;
  };
  extras: Array<{ id: string; name: string; priceMinor: number; per: string }>;
  messages: Array<{ direction: string; body: string; sentAt: string }>;
  cancellation: { policy: CancellationPolicy; feeNowMinor: number; allowed: boolean };
}

export async function guestPortal(
  deps: { crypto: Crypto; clock: Clock },
  tx: Tx,
  orgId: string,
  bookingId: string,
): Promise<GuestPortal | null> {
  const nowIso = deps.clock.now().toString();
  const detail = await new DrizzleReservationRepository(tx, orgId, deps.crypto).detail(bookingId);
  if (!detail) return null;
  const repo = repoFor(deps, tx, orgId);
  const settings = await repo.settings(detail.propertyId);
  const [prop] = await rawRows<{
    address: Record<string, string>;
    check_in: string | null;
    check_out: string | null;
    cancellation: Record<string, unknown> | null;
  }>(
    tx,
    sql`select p.address, pol.check_in_time as check_in, pol.check_out_time as check_out, pol.cancellation
        from property p left join policy pol on pol.property_id = p.id where p.id = ${detail.propertyId} limit 1`,
  );
  const ops = new DrizzleOperationsRepository(tx, orgId);
  const cred = (await ops.activeCredentials(bookingId))[0] ?? null;
  let access: GuestPortal["access"] = { state: "none" };
  if (cred) {
    if (accessRevealOpen(nowIso, cred.validFrom, cred.validTo, settings.accessRevealHours)) {
      const sealed = await ops.credentialSecret(cred.id);
      access = {
        state: "revealed",
        code: sealed ? await deps.crypto.open(sealed) : cred.valueMasked,
        validFrom: cred.validFrom,
        validTo: cred.validTo,
      };
      if (cred.deliveryState !== "delivered")
        await new DrizzleMessagingRepository(tx, orgId, deps.crypto).markCredentialDelivered(
          cred.id,
        );
    } else
      access = {
        state: "hidden",
        opensAt: new Date(
          Date.parse(cred.validFrom) - settings.accessRevealHours * 3_600_000,
        ).toISOString(),
      };
  }
  const pre = await repo.preCheckin(bookingId);
  const folios = await new DrizzleBillingRepository(tx, orgId).foliosForBooking(bookingId);
  const lines = folios.flatMap((f) =>
    f.lines.map((l) => ({ kind: l.kind, description: l.description, amountMinor: l.amountMinor })),
  );
  // room nights post to the folio at daily close; until then the booking total stands in for them
  const balanceMinor = folios.reduce(
    (a, f) =>
      a +
      f.lines.filter((l) => l.kind !== "room").reduce((x, l) => x + l.amountMinor, 0) -
      f.payments
        .filter((p) => p.state === "captured" || p.state === "refunded")
        .reduce((x, p) => x + p.amountMinor, 0),
    detail.status === "cancelled" ? 0 : detail.totalAmountMinor,
  );
  const messaging = new DrizzleMessagingRepository(tx, orgId, deps.crypto);
  const thread = await messaging.threadForBooking(bookingId);
  const td = thread ? await messaging.detail(thread.id, nowIso) : null;
  // MSG-6 the other way round: internal notes never reach the guest
  const messages = (td?.messages ?? [])
    .filter((m) => m.kind === "guest_message")
    .map((m) => ({ direction: m.direction ?? "outbound", body: m.body, sentAt: m.sentAt }));
  const policy = parsePolicy(prop?.cancellation ?? null);
  const room = detail.rooms[0];
  const today = deps.clock.today(detail.timezone).toString();
  const feeNowMinor = cancellationFee(
    policy,
    {
      arrivalDate: detail.arrivalDate,
      totalMinor: detail.totalAmountMinor,
      firstNightMinor: room?.days[0]?.amountMinor ?? 0,
    },
    today,
  );
  const guestNames = room?.guestNames[0];
  return {
    bookingId,
    reference: detail.otaReservationCode ?? bookingId.slice(0, 8).toUpperCase(),
    status: detail.status,
    property: {
      id: detail.propertyId,
      title: detail.propertyTitle,
      address: prop?.address ?? {},
      timezone: detail.timezone,
      checkInTime: prop?.check_in ?? "15:00",
      checkOutTime: prop?.check_out ?? "11:00",
      houseManual: settings.houseManual,
    },
    arrivalDate: detail.arrivalDate,
    departureDate: detail.departureDate,
    nights: LocalDate.parse(detail.arrivalDate).daysUntil(LocalDate.parse(detail.departureDate)),
    guestName: guestNames ? `${guestNames.name} ${guestNames.surname}`.trim() : "Guest",
    totalMinor: detail.totalAmountMinor,
    currency: detail.currency,
    folio: { lines, balanceMinor },
    access,
    preCheckin: {
      arrivalTime: pre?.arrivalTime ?? null,
      preferences: pre?.preferences ?? null,
      guests: pre?.guests ?? [],
      completedAt: pre?.completedAt ?? null,
    },
    extras: (await repo.extras(detail.propertyId))
      .filter((e) => e.active)
      .map((e) => ({ id: e.id, name: e.name, priceMinor: e.priceMinor, per: e.per })),
    messages,
    cancellation: {
      policy,
      feeNowMinor,
      allowed: detail.status !== "cancelled" && today < detail.arrivalDate,
    },
  };
}

/** The policy record is free-form JSON from the property editor; unknown shapes fall back to flexible/3 days/100 %. */
export function parsePolicy(raw: Record<string, unknown> | null): CancellationPolicy {
  const type = typeof raw?.type === "string" ? raw.type : "flexible";
  if (type === "non_refundable") return { type: "non_refundable" };
  if (type === "first_night") return { type: "first_night" };
  return {
    type: "flexible",
    freeUntilDaysBefore: Number(raw?.freeUntilDaysBefore ?? 3),
    lateFeePercent: Number(raw?.lateFeePercent ?? 100),
  };
}

/** A guest message from the portal is an inbound message on the direct thread; the inbox sees it like any other. */
export async function guestMessage(
  deps: { crypto: Crypto; clock: Clock },
  tx: Tx,
  orgId: string,
  bookingId: string,
  body: string,
): Promise<string> {
  const messaging = new DrizzleMessagingRepository(tx, orgId, deps.crypto);
  let thread = await messaging.threadForBooking(bookingId);
  if (!thread) {
    const [b] = await rawRows<{
      property_id: string;
      channex_booking_id: string;
      guest_id: string | null;
      arrival_date: string;
      departure_date: string;
      status: "new" | "modified" | "cancelled";
      timezone: string;
      title: string;
    }>(
      tx,
      sql`select b.property_id, b.channex_booking_id, b.guest_id, b.arrival_date::text, b.departure_date::text, b.status, p.timezone, p.title
          from booking b join property p on p.id = b.property_id where b.id = ${bookingId}`,
    );
    if (!b) throw new EngineError("not_found", "Booking not found");
    const now = deps.clock.now().toString();
    const id = await messaging.ensureThreadForBooking({
      bookingId,
      propertyId: b.property_id,
      provider: "direct",
      arrivalDate: b.arrival_date,
      departureDate: b.departure_date,
      status: b.status,
      timezone: b.timezone,
      channexBookingId: b.channex_booking_id,
      guestId: b.guest_id,
      createdAt: now,
      updatedAt: now,
      propertyTitle: b.title,
    });
    thread = { id, providerThreadId: "", automationHandover: false, state: "open" };
  }
  const id = await messaging.addInboundGuestMessage(thread.id, body, deps.clock.now().toString());
  await audit(
    deps,
    tx,
    orgId,
    bookingId,
    "message:send",
    { kind: "thread", id: thread.id },
    {
      bookingId,
    },
  );
  return id;
}

/** Self-service cancellation where the policy allows it (spec 10 §10.6): fee posted, the rest refunded. */
export async function guestCancel(
  deps: EngineDeps,
  orgId: string,
  bookingId: string,
  run: TxRunner,
): Promise<{ feeMinor: number; refundedMinor: number }> {
  const nowIso = deps.clock.now().toString();
  const r = await run(async (tx) => {
    const portal = await guestPortal(deps, tx, orgId, bookingId);
    if (!portal) throw new EngineError("not_found", "Booking not found");
    if (!portal.cancellation.allowed)
      throw new EngineError("not_cancellable", "This booking can no longer be cancelled online");
    const last = await rawRows<{ normalised: BookingRevisionPayload; n: number }>(
      tx,
      sql`select normalised, (select count(*)::int from booking_revision where booking_id = ${bookingId}) as n
          from booking_revision where booking_id = ${bookingId} order by inserted_at desc limit 1`,
    );
    const prev = last[0]!.normalised;
    const cancel = directBookingChange(
      { ...prev, raw: {} },
      { status: "cancelled", nowIso, sequence: last[0]!.n + 1 },
    );
    await applyDirectRevision(deps, tx, orgId, cancel, "direct_cancel");
    const billing = new DrizzleBillingRepository(tx, orgId);
    const folioId = await billing.ensureFolio(bookingId);
    const fee = portal.cancellation.feeNowMinor;
    if (fee > 0)
      await billing.addLine(folioId, {
        kind: "cancellation_fee",
        description: "Cancellation fee",
        date: deps.clock.today(portal.property.timezone).toString(),
        amountMinor: fee,
      });
    const [paid] = await rawRows<{ ref: string | null; amount: number }>(
      tx,
      sql`select provider_ref as ref, amount_minor as amount from payment where folio_id = ${folioId} and method = 'card' and state = 'captured' order by received_at limit 1`,
    );
    await audit(
      deps,
      tx,
      orgId,
      bookingId,
      "booking:cancel",
      { kind: "booking", id: bookingId },
      {
        feeMinor: fee,
      },
    );
    return { fee, folioId, paidRef: paid?.ref ?? null, paidMinor: Number(paid?.amount ?? 0) };
  });
  const refundable = Math.max(0, r.paidMinor - r.fee);
  let refundedMinor = 0;
  if (refundable > 0 && r.paidRef) {
    const refund = await deps.payments.refund(r.paidRef, refundable, `refund:${bookingId}`);
    if (refund.status === "succeeded") {
      refundedMinor = refundable;
      await run((tx) =>
        new DrizzleBillingRepository(tx, orgId).addPayment(r.folioId, {
          method: "card",
          amountMinor: -refundable,
          state: "refunded",
          providerRef: refund.refundId,
        }),
      );
    }
  }
  return { feeMinor: r.fee, refundedMinor };
}
