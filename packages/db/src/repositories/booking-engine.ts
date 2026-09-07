import { and, asc, eq, sql } from "drizzle-orm";
import {
  activeHoldsByDate,
  Id,
  type Crypto,
  type Extra,
  type GuaranteePolicy,
  type PromoCode,
  type Quote,
  type SearchableRoomType,
  type TaxRules,
  type Instalment,
  type PaymentRule,
} from "@pms/core";
import * as s from "../schema/index.js";
import { rawRows, type Tx } from "../tenant.js";

const num = (v: unknown): number => Number(v ?? 0);

export interface EngineSettings {
  propertyId: string;
  enabled: boolean;
  connectionId: string | null;
  guarantee: GuaranteePolicy;
  taxes: TaxRules;
  theme: Record<string, string>;
  description: string | null;
  attributes: string[];
  lat: string | null;
  lng: string | null;
  accessRevealHours: number;
  analyticsSnippet: string | null;
  abandonmentEmails: boolean;
  houseManual: string | null;
}

export interface StorefrontProperty {
  id: string;
  title: string;
  currency: string;
  timezone: string;
  address: Record<string, string>;
  settings: EngineSettings;
  photos: Array<{ id: string; storageKey: string; kind: string }>;
  policy: {
    title: string;
    cancellation: Record<string, unknown>;
    deposit: Record<string, unknown>;
    checkInTime: string;
    checkOutTime: string;
  } | null;
  minRateMinor: number | null;
}

export interface HoldRow {
  id: string;
  propertyId: string;
  roomTypeId: string;
  ratePlanId: string;
  arrivalDate: string;
  departureDate: string;
  rooms: number;
  adults: number;
  children: number;
  childAges: number[];
  quote: Quote;
  promoCode: string | null;
  extras: Array<{ id: string; quantity: number }>;
  locale: string;
  guest: {
    name: string;
    surname: string;
    email: string;
    phone: string | null;
    language: string;
    requests: string | null;
  } | null;
  consentMarketing: boolean;
  state: string;
  expiresAt: string;
  idempotencyKey: string | null;
  bookingId: string | null;
  paymentIntentId: string | null;
}

const DEFAULT_SETTINGS = (propertyId: string): EngineSettings => ({
  propertyId,
  enabled: false,
  connectionId: null,
  guarantee: { kind: "pay_at_property" },
  taxes: { vatBps: 0, cityTaxPerPersonNightMinor: 0, cityTaxMaxNights: null },
  theme: {},
  description: null,
  attributes: [],
  lat: null,
  lng: null,
  accessRevealHours: 24,
  analyticsSnippet: null,
  abandonmentEmails: false,
  houseManual: null,
});

/** The direct channel's storage: settings, storefront reads, holds, promo codes, extras, guest sessions, pre-check-in (spec 10). */
export class DrizzleBookingEngineRepository {
  constructor(
    private readonly tx: Tx,
    private readonly orgId: string,
    private readonly crypto: Crypto,
  ) {}

  // ---- settings ---------------------------------------------------------------------------------

  async settings(propertyId: string): Promise<EngineSettings> {
    const [r] = await this.tx
      .select()
      .from(s.bookingEngineSettings)
      .where(eq(s.bookingEngineSettings.propertyId, propertyId));
    if (!r) return DEFAULT_SETTINGS(propertyId);
    return {
      propertyId,
      enabled: r.enabled,
      connectionId: r.connectionId,
      guarantee: r.guarantee as unknown as GuaranteePolicy,
      taxes: r.taxes as unknown as TaxRules,
      theme: r.theme,
      description: r.description,
      attributes: r.attributes,
      lat: r.lat,
      lng: r.lng,
      accessRevealHours: r.accessRevealHours,
      analyticsSnippet: r.analyticsSnippet,
      abandonmentEmails: r.abandonmentEmails,
      houseManual: r.houseManual,
    };
  }

  async saveSettings(
    propertyId: string,
    patch: Partial<Omit<EngineSettings, "propertyId">>,
  ): Promise<void> {
    const current = await this.settings(propertyId);
    const next = { ...current, ...patch };
    await this.tx
      .insert(s.bookingEngineSettings)
      .values({
        propertyId,
        orgId: this.orgId,
        enabled: next.enabled,
        connectionId: next.connectionId,
        guarantee: next.guarantee,
        taxes: next.taxes as unknown as Record<string, unknown>,
        theme: next.theme,
        description: next.description,
        attributes: next.attributes,
        lat: next.lat,
        lng: next.lng,
        accessRevealHours: next.accessRevealHours,
        analyticsSnippet: next.analyticsSnippet,
        abandonmentEmails: next.abandonmentEmails,
        houseManual: next.houseManual,
      })
      .onConflictDoUpdate({
        target: s.bookingEngineSettings.propertyId,
        set: {
          enabled: next.enabled,
          connectionId: next.connectionId,
          guarantee: next.guarantee,
          taxes: next.taxes as unknown as Record<string, unknown>,
          theme: next.theme,
          description: next.description,
          attributes: next.attributes,
          lat: next.lat,
          lng: next.lng,
          accessRevealHours: next.accessRevealHours,
          analyticsSnippet: next.analyticsSnippet,
          abandonmentEmails: next.abandonmentEmails,
          houseManual: next.houseManual,
          updatedAt: sql`now()`,
        },
      });
  }

  // ---- storefront reads (public, no PII) ---------------------------------------------------------

  /** Properties with the engine enabled, for the portfolio storefront (spec 10 §10.3). */
  async storefront(
    filter: { propertyId?: string | null; attributes?: string[] } = {},
  ): Promise<StorefrontProperty[]> {
    const rows = await rawRows<{
      id: string;
      title: string;
      currency: string;
      timezone: string;
      address: Record<string, string>;
      min_rate: number | null;
    }>(
      this.tx,
      sql`select p.id, p.title, p.currency, p.timezone, p.address,
            (select min((rd.values->>'rate')::bigint) from rate_day rd join rate_plan rp on rp.id = rd.rate_plan_id where rp.property_id = p.id and rd.date >= current_date and rd.date < current_date + 60 and rd.values ? 'rate') as min_rate
          from property p join booking_engine_settings bes on bes.property_id = p.id
          where p.org_id = ${this.orgId} and p.archived_at is null and p.state = 'live' and bes.enabled ${filter.propertyId ? sql`and p.id = ${filter.propertyId}` : sql``}
          order by p.title`,
    );
    const out: StorefrontProperty[] = [];
    for (const r of rows) {
      const settings = await this.settings(r.id);
      if (
        filter.attributes?.length &&
        !filter.attributes.every((a) => settings.attributes.includes(a))
      )
        continue;
      const photos = await rawRows<{ id: string; storage_key: string; kind: string }>(
        this.tx,
        sql`select id, storage_key, kind from photo where property_id = ${r.id} order by position limit 12`,
      );
      const [policy] = await rawRows<{
        title: string;
        cancellation: Record<string, unknown>;
        deposit: Record<string, unknown>;
        check_in_time: string;
        check_out_time: string;
      }>(
        this.tx,
        sql`select title, cancellation, deposit, check_in_time, check_out_time from policy where property_id = ${r.id} order by id limit 1`,
      );
      out.push({
        id: r.id,
        title: r.title,
        currency: r.currency,
        timezone: r.timezone,
        address: r.address,
        settings,
        photos: photos.map((p) => ({ id: p.id, storageKey: p.storage_key, kind: p.kind })),
        policy: policy
          ? {
              title: policy.title,
              cancellation: policy.cancellation,
              deposit: policy.deposit,
              checkInTime: policy.check_in_time,
              checkOutTime: policy.check_out_time,
            }
          : null,
        minRateMinor: r.min_rate === null ? null : num(r.min_rate),
      });
    }
    return out;
  }

  /** Room types with their rate plans' cells and availability for a stay: the input to `searchOffers` (BE-2). */
  async searchable(
    propertyId: string,
    arrivalDate: string,
    departureDate: string,
  ): Promise<SearchableRoomType[]> {
    const rts = await rawRows<{
      id: string;
      title: string;
      max_occupancy: number | null;
      occ_adults: number;
      occ_children: number;
    }>(
      this.tx,
      sql`select id, title, max_occupancy, occ_adults, occ_children from room_type where property_id = ${propertyId} and archived_at is null order by title`,
    );
    const plans = await rawRows<{
      id: string;
      room_type_id: string;
      title: string;
      currency: string;
      direct_only: boolean;
      meal_plan: string | null;
      date: string;
      values: Record<string, unknown>;
    }>(
      this.tx,
      sql`select rp.id, rp.room_type_id, rp.title, rp.currency, rp.direct_only, rp.meal_plan, rd.date::text, rd.values
          from rate_plan rp join rate_day rd on rd.rate_plan_id = rp.id
          where rp.property_id = ${propertyId} and rp.archived_at is null and rd.date >= ${arrivalDate} and rd.date < ${departureDate}
            and not exists (select 1 from channel_mapping cm join channel_connection cc on cc.id = cm.connection_id where cm.rate_plan_id = rp.id and cc.adapter_code <> 'direct' and cc.archived_at is null and rp.direct_only)
          order by rp.title, rd.date`,
    );
    const avail = await rawRows<{ room_type_id: string; date: string; available: number }>(
      this.tx,
      sql`select room_type_id, date::text, available from availability_day where property_id = ${propertyId} and date >= ${arrivalDate} and date < ${departureDate}`,
    );
    return rts.map((rt) => {
      const byPlan = new Map<string, SearchableRoomType["ratePlans"][number]>();
      for (const p of plans.filter((x) => x.room_type_id === rt.id)) {
        const entry = byPlan.get(p.id) ?? {
          ratePlanId: p.id,
          title: p.title,
          currency: p.currency,
          directOnly: p.direct_only,
          mealPlan: p.meal_plan,
          cells: [],
        };
        entry.cells = [...entry.cells, { ratePlanId: p.id, date: p.date, values: p.values }];
        byPlan.set(p.id, entry);
      }
      return {
        roomTypeId: rt.id,
        title: rt.title,
        maxOccupancy: rt.max_occupancy ?? rt.occ_adults + rt.occ_children,
        availability: new Map(
          avail.filter((a) => a.room_type_id === rt.id).map((a) => [a.date, num(a.available)]),
        ),
        ratePlans: [...byPlan.values()],
      };
    });
  }

  // ---- holds (BE-5, BE-6) --------------------------------------------------------------------------

  /** Live holds per date for a room type; the availability derivation subtracts them (INV-2). */
  async activeHolds(
    propertyId: string,
    roomTypeId: string,
    dateFrom: string,
    dateTo: string,
    nowIso: string,
  ): Promise<Map<string, number>> {
    return activeHoldCounts(this.tx, propertyId, roomTypeId, dateFrom, dateTo, nowIso);
  }

  async createHold(h: {
    propertyId: string;
    roomTypeId: string;
    ratePlanId: string;
    arrivalDate: string;
    departureDate: string;
    adults: number;
    children: number;
    childAges: number[];
    quote: Quote;
    promoCode: string | null;
    extras: Array<{ id: string; quantity: number }>;
    locale: string;
    expiresAt: string;
  }): Promise<string> {
    const id = Id.next();
    await this.tx.insert(s.bookingHold).values({
      id,
      orgId: this.orgId,
      propertyId: h.propertyId,
      roomTypeId: h.roomTypeId,
      ratePlanId: h.ratePlanId,
      arrivalDate: h.arrivalDate,
      departureDate: h.departureDate,
      adults: h.adults,
      children: h.children,
      childAges: h.childAges,
      quote: h.quote as unknown as Record<string, unknown>,
      promoCode: h.promoCode,
      extras: h.extras,
      locale: h.locale,
      expiresAt: h.expiresAt,
    });
    return id;
  }

  async hold(id: string): Promise<HoldRow | null> {
    const [r] = await this.tx
      .select()
      .from(s.bookingHold)
      .where(and(eq(s.bookingHold.id, id), eq(s.bookingHold.orgId, this.orgId)));
    if (!r) return null;
    return {
      id: r.id,
      propertyId: r.propertyId,
      roomTypeId: r.roomTypeId,
      ratePlanId: r.ratePlanId,
      arrivalDate: r.arrivalDate,
      departureDate: r.departureDate,
      rooms: r.rooms,
      adults: r.adults,
      children: r.children,
      childAges: r.childAges,
      quote: r.quote as unknown as Quote,
      promoCode: r.promoCode,
      extras: r.extras,
      locale: r.locale,
      guest: r.guestEnc
        ? (JSON.parse(await this.crypto.open(r.guestEnc)) as HoldRow["guest"])
        : null,
      consentMarketing: r.consentMarketing,
      state: r.state,
      expiresAt: new Date(r.expiresAt).toISOString(),
      idempotencyKey: r.idempotencyKey,
      bookingId: r.bookingId,
      paymentIntentId: r.paymentIntentId,
    };
  }

  async updateHold(
    id: string,
    patch: {
      quote?: Quote;
      extras?: Array<{ id: string; quantity: number }>;
      promoCode?: string | null;
      guest?: NonNullable<HoldRow["guest"]>;
      consentMarketing?: boolean;
      paymentIntentId?: string | null;
    },
  ): Promise<void> {
    await this.tx
      .update(s.bookingHold)
      .set({
        ...(patch.quote ? { quote: patch.quote as unknown as Record<string, unknown> } : {}),
        ...(patch.extras ? { extras: patch.extras } : {}),
        ...(patch.promoCode !== undefined ? { promoCode: patch.promoCode } : {}),
        ...(patch.guest ? { guestEnc: await this.crypto.seal(JSON.stringify(patch.guest)) } : {}),
        ...(patch.consentMarketing !== undefined
          ? { consentMarketing: patch.consentMarketing }
          : {}),
        ...(patch.paymentIntentId !== undefined ? { paymentIntentId: patch.paymentIntentId } : {}),
        updatedAt: sql`now()`,
      })
      .where(and(eq(s.bookingHold.id, id), eq(s.bookingHold.orgId, this.orgId)));
  }

  /**
   * BE-6: convert the hold exactly once. The idempotency key is unique per org;
   * a second confirm with the same key returns the booking the first one made.
   */
  async claimHold(
    id: string,
    idempotencyKey: string,
  ): Promise<{ claimed: boolean; bookingId: string | null; state: string }> {
    const rows = await rawRows<{
      state: string;
      booking_id: string | null;
      idempotency_key: string | null;
    }>(
      this.tx,
      sql`select state, booking_id, idempotency_key from booking_hold where id = ${id} and org_id = ${this.orgId} for update`,
    );
    const r = rows[0];
    if (!r) return { claimed: false, bookingId: null, state: "missing" };
    if (r.state === "converted")
      return { claimed: false, bookingId: r.booking_id, state: "converted" };
    if (r.state !== "held") return { claimed: false, bookingId: null, state: r.state };
    await this.tx.execute(
      sql`update booking_hold set idempotency_key = ${idempotencyKey}, updated_at = now() where id = ${id}`,
    );
    return { claimed: true, bookingId: null, state: "held" };
  }

  async convertHold(id: string, bookingId: string): Promise<void> {
    await this.tx.execute(
      sql`update booking_hold set state = 'converted', booking_id = ${bookingId}, updated_at = now() where id = ${id} and org_id = ${this.orgId}`,
    );
  }

  async releaseHold(id: string, state: "released" | "expired" = "released"): Promise<void> {
    await this.tx.execute(
      sql`update booking_hold set state = ${state}, updated_at = now() where id = ${id} and org_id = ${this.orgId} and state = 'held'`,
    );
  }

  /** Holds past their expiry, still counted against availability: the sweep releases them (BE-5). */
  async expiredHolds(nowIso: string): Promise<
    Array<{
      id: string;
      propertyId: string;
      roomTypeId: string;
      arrivalDate: string;
      departureDate: string;
    }>
  > {
    const rows = await rawRows<{
      id: string;
      property_id: string;
      room_type_id: string;
      arrival_date: string;
      departure_date: string;
    }>(
      this.tx,
      sql`select id, property_id, room_type_id, arrival_date::text, departure_date::text from booking_hold where org_id = ${this.orgId} and state = 'held' and expires_at <= ${nowIso}`,
    );
    return rows.map((r) => ({
      id: r.id,
      propertyId: r.property_id,
      roomTypeId: r.room_type_id,
      arrivalDate: r.arrival_date,
      departureDate: r.departure_date,
    }));
  }

  /** Abandoned checkouts with consent (spec 10 §10.5): guest details entered, no booking, hold gone. */
  async abandoned(sinceIso: string): Promise<
    Array<{
      id: string;
      propertyId: string;
      guest: NonNullable<HoldRow["guest"]>;
      arrivalDate: string;
      locale: string;
    }>
  > {
    const rows = await rawRows<{
      id: string;
      property_id: string;
      guest_enc: string;
      arrival_date: string;
      locale: string;
    }>(
      this.tx,
      sql`select id, property_id, guest_enc, arrival_date::text, locale from booking_hold where org_id = ${this.orgId} and state in ('expired', 'released') and consent_marketing and guest_enc is not null and recovery_mailed_at is null and updated_at >= ${sinceIso}`,
    );
    const out = [];
    for (const r of rows)
      out.push({
        id: r.id,
        propertyId: r.property_id,
        guest: JSON.parse(await this.crypto.open(r.guest_enc)) as NonNullable<HoldRow["guest"]>,
        arrivalDate: r.arrival_date,
        locale: r.locale,
      });
    return out;
  }

  async markRecoveryMailed(holdId: string): Promise<void> {
    await this.tx.execute(
      sql`update booking_hold set recovery_mailed_at = now() where id = ${holdId} and org_id = ${this.orgId}`,
    );
  }

  // ---- promo codes and extras (spec 10 §10.5) ------------------------------------------------------

  async promo(code: string): Promise<PromoCode | null> {
    const [r] = await this.tx
      .select()
      .from(s.promoCode)
      .where(
        and(eq(s.promoCode.orgId, this.orgId), eq(s.promoCode.code, code.trim().toUpperCase())),
      );
    return r
      ? {
          code: r.code,
          kind: r.kind as PromoCode["kind"],
          value: r.value,
          validFrom: r.validFrom,
          validTo: r.validTo,
          stayFrom: r.stayFrom,
          stayTo: r.stayTo,
          minNights: r.minNights,
          maxUses: r.maxUses,
          uses: r.uses,
          singleUse: r.singleUse,
          active: r.active,
          propertyId: r.propertyId,
        }
      : null;
  }

  async listPromos(): Promise<Array<PromoCode & { id: string }>> {
    const rows = await this.tx
      .select()
      .from(s.promoCode)
      .where(eq(s.promoCode.orgId, this.orgId))
      .orderBy(s.promoCode.code);
    return rows.map((r) => ({
      id: r.id,
      code: r.code,
      kind: r.kind as PromoCode["kind"],
      value: r.value,
      validFrom: r.validFrom,
      validTo: r.validTo,
      stayFrom: r.stayFrom,
      stayTo: r.stayTo,
      minNights: r.minNights,
      maxUses: r.maxUses,
      uses: r.uses,
      singleUse: r.singleUse,
      active: r.active,
      propertyId: r.propertyId,
    }));
  }

  async savePromo(p: Omit<PromoCode, "uses"> & { createdBy: string }): Promise<string> {
    const id = Id.next();
    await this.tx
      .insert(s.promoCode)
      .values({
        id,
        orgId: this.orgId,
        propertyId: p.propertyId,
        code: p.code.trim().toUpperCase(),
        kind: p.kind,
        value: p.value,
        validFrom: p.validFrom,
        validTo: p.validTo,
        stayFrom: p.stayFrom,
        stayTo: p.stayTo,
        minNights: p.minNights,
        maxUses: p.maxUses,
        singleUse: p.singleUse,
        active: p.active,
        createdBy: p.createdBy,
      })
      .onConflictDoUpdate({
        target: [s.promoCode.orgId, s.promoCode.code],
        set: {
          kind: p.kind,
          value: p.value,
          validFrom: p.validFrom,
          validTo: p.validTo,
          stayFrom: p.stayFrom,
          stayTo: p.stayTo,
          minNights: p.minNights,
          maxUses: p.maxUses,
          singleUse: p.singleUse,
          active: p.active,
          propertyId: p.propertyId,
        },
      });
    return id;
  }

  async usePromo(code: string): Promise<void> {
    await this.tx.execute(
      sql`update promo_code set uses = uses + 1 where org_id = ${this.orgId} and code = ${code.trim().toUpperCase()}`,
    );
  }

  async extras(
    propertyId: string,
  ): Promise<Array<Extra & { description: string | null; active: boolean }>> {
    const rows = await this.tx
      .select()
      .from(s.extra)
      .where(and(eq(s.extra.propertyId, propertyId), eq(s.extra.orgId, this.orgId)))
      .orderBy(s.extra.name);
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      priceMinor: r.priceMinor,
      per: r.per as Extra["per"],
      description: r.description,
      active: r.active,
    }));
  }

  async saveExtra(e: {
    id?: string | null;
    propertyId: string;
    name: string;
    description: string | null;
    priceMinor: number;
    per: Extra["per"];
    active: boolean;
  }): Promise<string> {
    const id = e.id ?? Id.next();
    await this.tx
      .insert(s.extra)
      .values({
        id,
        orgId: this.orgId,
        propertyId: e.propertyId,
        name: e.name,
        description: e.description,
        priceMinor: e.priceMinor,
        per: e.per,
        active: e.active,
      })
      .onConflictDoUpdate({
        target: s.extra.id,
        set: {
          name: e.name,
          description: e.description,
          priceMinor: e.priceMinor,
          per: e.per,
          active: e.active,
        },
      });
    return id;
  }

  async setDirectOnly(ratePlanId: string, directOnly: boolean): Promise<void> {
    await this.tx.execute(
      sql`update rate_plan set direct_only = ${directOnly} where id = ${ratePlanId} and org_id = ${this.orgId}`,
    );
  }

  // ---- guest portal (spec 10 §10.6) ----------------------------------------------------------------

  async createGuestSession(
    bookingId: string,
    tokenHash: string,
    expiresAt: string,
  ): Promise<string> {
    const id = Id.next();
    await this.tx
      .insert(s.guestSession)
      .values({ id, orgId: this.orgId, bookingId, tokenHash, expiresAt });
    return id;
  }

  async guestSession(
    tokenHash: string,
    nowIso: string,
  ): Promise<{ id: string; bookingId: string } | null> {
    const [r] = await rawRows<{ id: string; booking_id: string }>(
      this.tx,
      sql`select id, booking_id from guest_session where token_hash = ${tokenHash} and expires_at > ${nowIso}`,
    );
    if (!r) return null;
    await this.tx.execute(sql`update guest_session set last_seen_at = now() where id = ${r.id}`);
    return { id: r.id, bookingId: r.booking_id };
  }

  async preCheckin(bookingId: string): Promise<{
    arrivalTime: string | null;
    idDocumentRef: string | null;
    preferences: string | null;
    guests: Array<{ name: string; surname: string }>;
    completedAt: string | null;
  } | null> {
    const [r] = await this.tx
      .select()
      .from(s.preCheckin)
      .where(eq(s.preCheckin.bookingId, bookingId));
    return r
      ? {
          arrivalTime: r.arrivalTime,
          idDocumentRef: r.idDocumentRef,
          preferences: r.preferences,
          guests: r.guests,
          completedAt: r.completedAt,
        }
      : null;
  }

  async savePreCheckin(
    bookingId: string,
    p: {
      arrivalTime: string | null;
      idDocumentRef: string | null;
      preferences: string | null;
      guests: Array<{ name: string; surname: string }>;
    },
  ): Promise<void> {
    await this.tx
      .insert(s.preCheckin)
      .values({ bookingId, orgId: this.orgId, ...p, completedAt: sql`now()` })
      .onConflictDoUpdate({
        target: s.preCheckin.bookingId,
        set: { ...p, completedAt: sql`now()`, updatedAt: sql`now()` },
      });
  }
}

/** Payment rules and the instalments they produce (spec 10 §10.4). */
export class DrizzlePaymentRuleRepository {
  constructor(
    private readonly tx: Tx,
    private readonly orgId: string,
  ) {}

  async listRules(): Promise<PaymentRule[]> {
    const rows = await this.tx
      .select()
      .from(s.paymentRule)
      .orderBy(asc(s.paymentRule.position), asc(s.paymentRule.id));
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      trigger: r.trigger as PaymentRule["trigger"],
      offsetDays: r.offsetDays,
      amount:
        r.amountKind === "percent"
          ? { kind: "percent", percentBps: r.amountValue }
          : r.amountKind === "fixed"
            ? { kind: "fixed", amountMinor: r.amountValue }
            : { kind: "remainder" },
      propertyIds: r.propertyIds,
      channels: r.channels,
      enabled: r.enabled,
      position: r.position,
    }));
  }

  async saveRule(r: PaymentRule): Promise<void> {
    const row = {
      orgId: this.orgId,
      name: r.name,
      trigger: r.trigger,
      offsetDays: r.offsetDays,
      amountKind: r.amount.kind,
      amountValue:
        r.amount.kind === "percent"
          ? r.amount.percentBps
          : r.amount.kind === "fixed"
            ? r.amount.amountMinor
            : 0,
      propertyIds: r.propertyIds,
      channels: r.channels,
      enabled: r.enabled,
      position: r.position,
    };
    await this.tx
      .insert(s.paymentRule)
      .values({ id: r.id, ...row })
      .onConflictDoUpdate({ target: s.paymentRule.id, set: row });
  }

  async deleteRule(id: string): Promise<void> {
    await this.tx.delete(s.paymentRule).where(eq(s.paymentRule.id, id));
  }

  /** Write a booking's instalments; re-running with the same plan changes nothing. */
  async saveSchedule(
    bookingId: string,
    currency: string,
    instalments: readonly Instalment[],
  ): Promise<void> {
    for (const i of instalments)
      await this.tx
        .insert(s.paymentSchedule)
        .values({
          id: Id.next(),
          orgId: this.orgId,
          bookingId,
          ruleId: i.ruleId,
          name: i.name,
          dueOn: i.dueOn,
          amountMinor: i.amountMinor,
          currency,
        })
        .onConflictDoNothing();
  }

  async listSchedule(bookingId: string): Promise<ScheduledPayment[]> {
    const rows = await this.tx
      .select()
      .from(s.paymentSchedule)
      .where(eq(s.paymentSchedule.bookingId, bookingId))
      .orderBy(asc(s.paymentSchedule.dueOn));
    return rows.map(toScheduled);
  }

  /** Cancel what a cancelled or shortened booking no longer owes. */
  async cancelSchedule(bookingId: string): Promise<void> {
    await this.tx
      .update(s.paymentSchedule)
      .set({ state: "cancelled", settledAt: sql`now()` })
      .where(
        and(eq(s.paymentSchedule.bookingId, bookingId), eq(s.paymentSchedule.state, "scheduled")),
      );
  }
}

export interface ScheduledPayment {
  id: string;
  bookingId: string;
  ruleId: string | null;
  name: string;
  dueOn: string;
  amountMinor: number;
  currency: string;
  state: "scheduled" | "paid" | "failed" | "cancelled";
  attempts: number;
  lastError: string | null;
}

const toScheduled = (r: typeof s.paymentSchedule.$inferSelect): ScheduledPayment => ({
  id: r.id,
  bookingId: r.bookingId,
  ruleId: r.ruleId,
  name: r.name,
  dueOn: r.dueOn,
  amountMinor: r.amountMinor,
  currency: r.currency,
  state: r.state as ScheduledPayment["state"],
  attempts: r.attempts,
  lastError: r.lastError,
});

/** Instalments due on or before a date, across tenants: the collection job's queue. */
export async function duePayments(
  tx: Tx,
  onOrBefore: string,
  limit = 200,
): Promise<Array<ScheduledPayment & { orgId: string }>> {
  const rows = await rawRows<typeof s.paymentSchedule.$inferSelect & { org_id: string }>(
    tx,
    sql`select * from payment_schedule
      where state = 'scheduled' and due_on <= ${onOrBefore} and attempts < 6
      order by due_on limit ${limit}`,
  );
  return rows.map((r) => ({ ...toScheduled(r), orgId: r.org_id }));
}

/**
 * BE-5: rooms held per date for a room type, for `recomputeAvailability` (no tenant
 * crypto needed, so callers without a repository can subtract holds too).
 */
export async function activeHoldCounts(
  tx: Tx,
  propertyId: string,
  roomTypeId: string,
  dateFrom: string,
  dateTo: string,
  nowIso: string,
): Promise<Map<string, number>> {
  const rows = await rawRows<{
    room_type_id: string;
    arrival_date: string;
    departure_date: string;
    rooms: number;
    expires_at: string;
    state: string;
  }>(
    tx,
    sql`select room_type_id, arrival_date::text, departure_date::text, rooms, expires_at::text, state from booking_hold
        where property_id = ${propertyId} and room_type_id = ${roomTypeId} and state = 'held' and expires_at > ${nowIso}
          and arrival_date <= ${dateTo} and departure_date > ${dateFrom}`,
  );
  return activeHoldsByDate(
    rows.map((r) => ({
      roomTypeId: r.room_type_id,
      arrivalDate: r.arrival_date,
      departureDate: r.departure_date,
      rooms: num(r.rooms),
      expiresAt: new Date(r.expires_at).toISOString(),
      state: r.state,
    })),
    roomTypeId,
    nowIso,
  );
}
