import { and, eq, sql } from "drizzle-orm";
import type { BookingRevisionPayload, Crypto, RevisionDiff } from "@pms/core";
import * as s from "../schema/index.js";
import { rawRows, type Tx } from "../tenant.js";

export interface ReservationFilters {
  view?: string;
  dateType?: "arrival" | "departure" | "stay" | "booked";
  from?: string;
  to?: string;
  propertyId?: string;
  groupId?: string;
  channel?: string;
  status?: string;
  mappingState?: string;
  unassigned?: boolean;
  noAccessCode?: boolean;
  q?: string;
  limit?: number;
  offset?: number;
}

export interface ReservationRow {
  id: string;
  propertyId: string;
  propertyTitle: string;
  otaName: string | null;
  otaReservationCode: string | null;
  status: string;
  arrivalDate: string;
  departureDate: string;
  nights: number;
  currency: string;
  totalAmountMinor: number;
  mappingState: string;
  /** "Ana S.": what the CSV export carries. */
  guestName: string;
  /** "Ana Silva": what the list shows (the lead guest's name is on the booking already). */
  guestFullName: string;
  adults: number;
  children: number;
  unitNames: string | null;
  unassignedRooms: number;
  credentials: number;
  balanceMinor: number;
  /** For the balance in words (core `bookingBalance`). */
  paymentCollect: string | null;
  roomChargesMinor: number;
  otherChargesMinor: number;
  paidMinor: number;
  /** One per room: expected | checked_in | checked_out | no_show. */
  stayStates: string[];
  unacknowledged: boolean;
  createdAt: string;
  updatedAt: string;
}

export const SHIPPED_VIEWS: Record<string, (today: string) => Partial<ReservationFilters>> = {
  arrivals_today: (t) => ({ dateType: "arrival", from: t, to: t }),
  departures_today: (t) => ({ dateType: "departure", from: t, to: t }),
  in_stay: (t) => ({ dateType: "stay", from: t, to: t, status: "active" }),
  same_day_changeovers: () => ({ view: "same_day_changeovers" }),
  unassigned: () => ({ unassigned: true }),
  unmapped: () => ({ mappingState: "unmapped" }),
  no_access_code: (t) => ({ noAccessCode: true, dateType: "arrival", from: t }),
  cancelled_this_week: (t) => ({ status: "cancelled", dateType: "booked", from: shift(t, -7) }),
  modified_since_yesterday: () => ({ view: "modified_since_yesterday" }),
  payment_action_needed: () => ({ view: "payment_action_needed" }),
  arriving_this_week: (t) => ({ dateType: "arrival", from: t, to: shift(t, 6), status: "active" }),
  balance_due: () => ({ view: "balance_due" }),
  cancelled: () => ({ status: "cancelled" }),
};
/** The four filters the list leads with (design canvas, November 2026), each with its count. */
export const LIST_PILLS = ["arriving_this_week", "in_stay", "balance_due", "cancelled"] as const;
export type ListPill = (typeof LIST_PILLS)[number];
function shift(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Money on the booking's folios, for the balance in words (core `bookingBalance`): one
// definition for the list's columns and for its "Balance due" filter.
const ROOM_CHARGES = sql`coalesce((select sum(l.amount_minor) from folio_line l join folio f on f.id = l.folio_id where f.booking_id = b.id and l.kind = 'room'), 0)`;
const OTHER_CHARGES = sql`coalesce((select sum(l.amount_minor) from folio_line l join folio f on f.id = l.folio_id where f.booking_id = b.id and l.kind <> 'room'), 0)`;
const PAID = sql`coalesce((select sum(case when pm.state = 'captured' then pm.amount_minor when pm.state = 'refunded' then -pm.amount_minor else 0 end) from payment pm join folio f on f.id = pm.folio_id where f.booking_id = b.id), 0)`;
const DUE = sql`((case when b.payment_collect = 'ota' then 0 when b.status = 'cancelled' then ${ROOM_CHARGES} else greatest(b.total_amount_minor, ${ROOM_CHARGES}) end) + ${OTHER_CHARGES} - ${PAID})`;

/** Reservation list, detail, timeline and actions (spec 08 §8.1–8.5). PII stays sealed until a `booking:read_pii` reader opens it. */
export class DrizzleReservationRepository {
  constructor(
    private readonly tx: Tx,
    private readonly orgId: string,
    private readonly crypto: Crypto,
  ) {}

  private where(f: ReservationFilters, today: string) {
    const view =
      f.view && SHIPPED_VIEWS[f.view]
        ? { ...SHIPPED_VIEWS[f.view]!(today), ...f, view: f.view }
        : f;
    const dateCol =
      view.dateType === "departure"
        ? sql`b.departure_date`
        : view.dateType === "booked"
          ? sql`b.created_at::date`
          : sql`b.arrival_date`;
    const where = [sql`true`];
    if (view.propertyId) where.push(sql`b.property_id = ${view.propertyId}`);
    if (view.groupId)
      where.push(
        sql`exists (select 1 from property_group_membership m where m.property_id = b.property_id and m.group_id = ${view.groupId})`,
      );
    if (view.channel) where.push(sql`lower(b.ota_name) = lower(${view.channel})`);
    // "active": everything still happening, whatever its last revision type
    if (view.status === "active") where.push(sql`b.status <> 'cancelled'`);
    else if (view.status) where.push(sql`b.status = ${view.status}`);
    if (view.mappingState === "unmapped") where.push(sql`b.mapping_state <> 'mapped'`);
    else if (view.mappingState) where.push(sql`b.mapping_state = ${view.mappingState}`);
    if (view.dateType === "stay") {
      if (view.from) where.push(sql`b.departure_date > ${view.from}`);
      if (view.to) where.push(sql`b.arrival_date <= ${view.to}`);
    } else {
      if (view.from) where.push(sql`${dateCol} >= ${view.from}`);
      if (view.to) where.push(sql`${dateCol} <= ${view.to}`);
    }
    if (view.unassigned)
      where.push(
        sql`exists (select 1 from booking_room br join property p on p.id = b.property_id where br.booking_id = b.id and br.assigned_unit_id is null and p.kind <> 'single_unit') and b.status <> 'cancelled'`,
      );
    if (view.noAccessCode)
      where.push(
        sql`not exists (select 1 from access_credential c where c.booking_id = b.id and c.revoked_at is null) and b.status <> 'cancelled'`,
      );
    if (view.view === "same_day_changeovers")
      where.push(
        sql`exists (select 1 from turnover_task t where (t.departing_booking_id = b.id or t.arriving_booking_id = b.id) and t.is_same_day and t.state <> 'cancelled' and t.date = ${view.from ?? today})`,
      );
    if (view.view === "modified_since_yesterday")
      where.push(sql`b.status = 'modified' and b.updated_at >= ${shift(today, -1)}::date`);
    if (view.view === "payment_action_needed")
      where.push(
        sql`exists (select 1 from payment_instrument pi where pi.booking_id = b.id and pi.vcc_effective_to is not null and pi.vcc_effective_to <= now() + interval '3 days') or (b.status <> 'cancelled' and b.departure_date < ${today} and (select coalesce(sum(l.amount_minor),0) from folio_line l join folio f on f.id = l.folio_id where f.booking_id = b.id) > (select coalesce(sum(pm.amount_minor),0) from payment pm join folio f on f.id = pm.folio_id where f.booking_id = b.id and pm.state = 'captured'))`,
      );
    if (view.view === "balance_due") where.push(sql`${DUE} > 0`);
    if (view.q)
      where.push(
        sql`(b.ota_reservation_code ilike ${"%" + view.q + "%"} or g.dedupe_hash = ${this.crypto.sha256Hex(view.q.toLowerCase())} or exists (select 1 from booking_room br where br.booking_id = b.id and br.guest_names::text ilike ${"%" + view.q + "%"}))`,
      );
    return sql.join(where, sql` and `);
  }

  async count(f: ReservationFilters, today: string): Promise<number> {
    const [count] = await rawRows<{ n: number }>(
      this.tx,
      sql`select count(*)::int as n from booking b join property p on p.id = b.property_id left join guest g on g.id = b.guest_id where ${this.where(f, today)}`,
    );
    return count?.n ?? 0;
  }

  /** The list's filter pills with their counts. */
  async pillCounts(today: string): Promise<Record<ListPill, number>> {
    const out = {} as Record<ListPill, number>;
    for (const v of LIST_PILLS) out[v] = await this.count({ view: v }, today);
    return out;
  }

  async list(
    f: ReservationFilters,
    today: string,
  ): Promise<{ rows: ReservationRow[]; total: number }> {
    const cond = this.where(f, today);
    const rows = await rawRows<
      Omit<ReservationRow, "guestName" | "guestFullName"> & {
        guestNameEnc: string;
        guestSurnameEnc: string;
      }
    >(
      this.tx,
      sql`select b.id, b.property_id as "propertyId", p.title as "propertyTitle", b.ota_name as "otaName", b.ota_reservation_code as "otaReservationCode", b.status, b.arrival_date::text as "arrivalDate", b.departure_date::text as "departureDate",
        (b.departure_date - b.arrival_date) as nights, b.currency, b.total_amount_minor as "totalAmountMinor", b.mapping_state as "mappingState", g.name_enc as "guestNameEnc", g.surname_enc as "guestSurnameEnc",
        coalesce((select sum((br.occupancy->>'adults')::int) from booking_room br where br.booking_id = b.id), 0)::int as adults,
        coalesce((select sum((br.occupancy->>'children')::int) from booking_room br where br.booking_id = b.id), 0)::int as children,
        (select string_agg(u.name, ', ') from booking_room br join unit u on u.id = br.assigned_unit_id where br.booking_id = b.id) as "unitNames",
        (select count(*)::int from booking_room br where br.booking_id = b.id and br.assigned_unit_id is null and p.kind <> 'single_unit') as "unassignedRooms",
        (select count(*)::int from access_credential c where c.booking_id = b.id and c.revoked_at is null) as credentials,
        (coalesce((select sum(l.amount_minor) from folio_line l join folio f on f.id = l.folio_id where f.booking_id = b.id), 0) - ${PAID})::bigint as "balanceMinor",
        b.payment_collect as "paymentCollect", ${ROOM_CHARGES}::bigint as "roomChargesMinor", ${OTHER_CHARGES}::bigint as "otherChargesMinor", ${PAID}::bigint as "paidMinor",
        coalesce((select json_agg(coalesce(ss.state, 'expected')) from booking_room br left join stay_state ss on ss.booking_room_id = br.id where br.booking_id = b.id), '[]'::json) as "stayStates",
        (b.status = 'modified' and not exists (select 1 from booking_acknowledgement a where a.booking_id = b.id and a.revision_id = b.last_revision_id::text)) as unacknowledged,
        b.created_at as "createdAt", b.updated_at as "updatedAt"
        from booking b join property p on p.id = b.property_id left join guest g on g.id = b.guest_id
        where ${cond} order by b.arrival_date desc, b.id limit ${f.limit ?? 200} offset ${f.offset ?? 0}`,
    );
    const total = await this.count(f, today);
    const out: ReservationRow[] = [];
    for (const r of rows) {
      const { guestNameEnc, guestSurnameEnc, ...rest } = r;
      const name = guestNameEnc ? await this.crypto.open(guestNameEnc) : "";
      const surname = guestSurnameEnc ? await this.crypto.open(guestSurnameEnc) : "";
      out.push({
        ...rest,
        balanceMinor: Number(rest.balanceMinor),
        roomChargesMinor: Number(rest.roomChargesMinor),
        otherChargesMinor: Number(rest.otherChargesMinor),
        paidMinor: Number(rest.paidMinor),
        guestName: guestNameEnc ? `${name} ${surname.slice(0, 1)}.` : "—",
        guestFullName: guestNameEnc ? `${name} ${surname}`.trim() : "—",
      });
    }
    return { rows: out, total };
  }

  async detail(id: string): Promise<ReservationDetail | null> {
    const [b] = await this.tx.select().from(s.booking).where(eq(s.booking.id, id)).limit(1);
    if (!b) return null;
    const [p] = await this.tx
      .select({ title: s.property.title, kind: s.property.kind, timezone: s.property.timezone })
      .from(s.property)
      .where(eq(s.property.id, b.propertyId))
      .limit(1);
    const rooms = await rawRows<ReservationDetail["rooms"][number]>(
      this.tx,
      sql`select br.id, br.room_type_id as "roomTypeId", rt.title as "roomTypeTitle", br.rate_plan_id as "ratePlanId", rp.title as "ratePlanTitle", br.checkin_date::text as "checkinDate", br.checkout_date::text as "checkoutDate", br.occupancy, br.guest_names as "guestNames", br.amount_minor as "amountMinor", br.assigned_unit_id as "assignedUnitId", u.name as "unitName",
        coalesce(ss.state, 'expected') as "stayState", rt.max_occupancy as "maxOccupancy",
        (select json_agg(json_build_object('date', d.date, 'amountMinor', d.amount_minor) order by d.date) from booking_room_day d where d.booking_room_id = br.id) as days
        from booking_room br left join room_type rt on rt.id = br.room_type_id left join rate_plan rp on rp.id = br.rate_plan_id left join unit u on u.id = br.assigned_unit_id left join stay_state ss on ss.booking_room_id = br.id
        where br.booking_id = ${id} order by br.checkin_date`,
    );
    const revisions = await rawRows<{
      id: string;
      channexRevisionId: string;
      revisionType: string;
      systemId: string;
      insertedAt: string;
      receivedAt: string;
      diff: RevisionDiff | null;
      acknowledged: boolean;
      normalised: Record<string, unknown>;
    }>(
      this.tx,
      sql`select r.id, r.channex_revision_id as "channexRevisionId", r.revision_type as "revisionType", r.system_id as "systemId", r.inserted_at as "insertedAt", r.received_at as "receivedAt", r.diff_from_previous as diff, exists (select 1 from booking_acknowledgement a where a.revision_id = r.channex_revision_id) as acknowledged, r.normalised
        from booking_revision r where r.booking_id = ${id} order by r.inserted_at desc, r.system_id desc`,
    );
    const guest = b.guestId
      ? (await this.tx.select().from(s.guest).where(eq(s.guest.id, b.guestId)).limit(1))[0]
      : undefined;
    const instruments = await this.tx
      .select()
      .from(s.paymentInstrument)
      .where(eq(s.paymentInstrument.bookingId, id));
    // what happened to the stay besides revisions, for the readable timeline (spec 08 §8.3)
    const events = await rawRows<ReservationDetail["events"][number]>(
      this.tx,
      sql`select * from (
          select 'form_done' as kind, pc.completed_at::text as at, null as detail from pre_checkin pc where pc.booking_id = ${id} and pc.completed_at is not null
          union all select 'code_issued', c.issued_at::text, c.type from access_credential c where c.booking_id = ${id}
          union all select 'code_revoked', c.revoked_at::text, c.type from access_credential c where c.booking_id = ${id} and c.revoked_at is not null
          union all select 'checked_in', ss.checked_in_at::text, null from stay_state ss where ss.booking_id = ${id} and ss.checked_in_at is not null
          union all select 'checked_out', ss.checked_out_at::text, null from stay_state ss where ss.booking_id = ${id} and ss.checked_out_at is not null
          union all select 'message_sent', ar.executed_at::text, coalesce(r.name, '') from automation_run ar left join automation_rule r on r.id = ar.rule_id where ar.booking_id = ${id} and ar.state = 'sent'
        ) e order by at desc`,
    );
    const [extra] = await rawRows<{
      checkInTime: string | null;
      checkOutTime: string | null;
      guestStays: number;
      preCheckin: ReservationDetail["preCheckin"];
    }>(
      this.tx,
      sql`select (select check_in_time from policy where property_id = ${b.propertyId} limit 1) as "checkInTime",
          (select check_out_time from policy where property_id = ${b.propertyId} limit 1) as "checkOutTime",
          (select count(*)::int from booking b2 where ${b.guestId}::uuid is not null and b2.guest_id = ${b.guestId} and b2.status <> 'cancelled' and b2.arrival_date <= ${b.arrivalDate}) as "guestStays",
          (select json_build_object('completedAt', pc.completed_at, 'arrivalTime', pc.arrival_time, 'guests', jsonb_array_length(pc.guests), 'idOnFile', pc.id_document_ref is not null) from pre_checkin pc where pc.booking_id = ${id}) as "preCheckin"`,
    );
    const taxes =
      (revisions[0]?.normalised.taxes as
        Array<{ name: string; amount: number; withheldByOta?: boolean }> | undefined) ?? [];
    const services =
      (revisions[0]?.normalised.services as Array<{ name: string; amount: number }> | undefined) ??
      [];
    return {
      id: b.id,
      propertyId: b.propertyId,
      propertyTitle: p?.title ?? "",
      propertyKind: p?.kind ?? "single_unit",
      timezone: p?.timezone ?? "UTC",
      channexBookingId: b.channexBookingId,
      otaName: b.otaName,
      otaReservationCode: b.otaReservationCode,
      status: b.status,
      arrivalDate: b.arrivalDate,
      departureDate: b.departureDate,
      currency: b.currency,
      totalAmountMinor: b.totalAmountMinor,
      otaCommissionMinor: b.otaCommissionMinor,
      paymentCollect: b.paymentCollect,
      paymentType: b.paymentType,
      mappingState: b.mappingState,
      lastRevisionId: b.lastRevisionId,
      rooms: rooms.map((r) => ({ ...r, days: r.days ?? [] })),
      revisions: revisions.map(({ normalised: n, ...r }) => ({
        ...r,
        amountMinor: Number(n.amount ?? 0),
        guests: ((n.rooms as BookingRevisionPayload["rooms"] | undefined) ?? []).reduce(
          (a, x) => a + x.occupancy.adults + x.occupancy.children,
          0,
        ),
        timelineText: describeDiff(r.diff, r.revisionType, b.currency),
      })),
      events,
      checkInTime: extra?.checkInTime ?? "15:00",
      checkOutTime: extra?.checkOutTime ?? "11:00",
      guestStays: extra?.guestStays ?? 0,
      preCheckin: extra?.preCheckin ?? null,
      guest: guest
        ? {
            id: guest.id,
            country: guest.country,
            language: guest.language,
            hasEmail: Boolean(guest.emailEnc),
            hasPhone: Boolean(guest.phoneEnc),
          }
        : null,
      instruments: instruments.map((i) => ({
        id: i.id,
        type: i.type,
        cardType: i.cardType,
        maskedNumber: i.maskedNumber,
        expiry: i.expiry,
        vccBalanceMinor: i.vccBalanceMinor ?? null,
        vccEffectiveTo: i.vccEffectiveTo ?? null,
      })),
      financials: {
        roomRevenueMinor: rooms.reduce((a, r) => a + Number(r.amountMinor), 0),
        extrasMinor: services.reduce((a, x) => a + x.amount, 0),
        taxesMinor: taxes.filter((t) => !t.withheldByOta).reduce((a, t) => a + t.amount, 0),
        withheldTaxesMinor: taxes.filter((t) => t.withheldByOta).reduce((a, t) => a + t.amount, 0),
        otaCommissionMinor: b.otaCommissionMinor ?? 0,
      },
      unacknowledged:
        b.status === "modified" &&
        !revisions.find((r) => r.channexRevisionId === b.lastRevisionId)?.acknowledged,
    };
  }

  /** Guest PII, opened only for a `booking:read_pii` reader; every call is audited by the wrapper. */
  async guestPii(
    guestId: string,
  ): Promise<{ name: string; surname: string; email: string | null; phone: string | null } | null> {
    const [g] = await this.tx.select().from(s.guest).where(eq(s.guest.id, guestId)).limit(1);
    if (!g) return null;
    return {
      name: await this.crypto.open(g.nameEnc),
      surname: await this.crypto.open(g.surnameEnc),
      email: g.emailEnc ? await this.crypto.open(g.emailEnc) : null,
      phone: g.phoneEnc ? await this.crypto.open(g.phoneEnc) : null,
    };
  }
  /**
   * The online check-in board (spec 10 §10.6): who arrives in the next `days` days or is in house,
   * how far their check-in form is, the money, and the door code. Lead guest names are opened
   * for the list as everywhere else under `booking:read`; nothing else.
   */
  async checkinBoard(today: string, days: number): Promise<CheckinRow[]> {
    const until = shift(today, days - 1);
    const rows = await rawRows<
      Omit<CheckinRow, "guestName"> & {
        guestNameEnc: string | null;
        guestSurnameEnc: string | null;
      }
    >(
      this.tx,
      sql`select b.id, b.property_id as "propertyId", p.title as "propertyTitle", p.kind as "propertyKind", b.ota_name as "otaName", b.status,
          b.arrival_date::text as "arrivalDate", b.departure_date::text as "departureDate", b.currency, b.total_amount_minor as "totalAmountMinor", b.payment_collect as "paymentCollect",
          g.name_enc as "guestNameEnc", g.surname_enc as "guestSurnameEnc", (g.email_enc is not null) as "hasEmail", g.language as "guestLanguage",
          coalesce((select sum((br.occupancy->>'adults')::int + (br.occupancy->>'children')::int) from booking_room br where br.booking_id = b.id), 0)::int as "guestsExpected",
          pc.completed_at::text as "formCompletedAt", coalesce(jsonb_array_length(pc.guests), 0)::int as "guestsListed", (pc.id_document_ref is not null) as "idOnFile", pc.arrival_time as "arrivalTime",
          cr.value_masked as "codeMasked", cr.valid_from::text as "codeValidFrom", cr.delivery_state as "codeDelivery",
          ${ROOM_CHARGES}::bigint as "roomChargesMinor", ${OTHER_CHARGES}::bigint as "otherChargesMinor", ${PAID}::bigint as "paidMinor",
          exists (select 1 from message_thread t where t.booking_id = b.id) as "hasThread"
        from booking b join property p on p.id = b.property_id left join guest g on g.id = b.guest_id
          left join pre_checkin pc on pc.booking_id = b.id
          left join lateral (select c.value_masked, c.valid_from, c.delivery_state from access_credential c where c.booking_id = b.id and c.revoked_at is null order by c.issued_at desc limit 1) cr on true
        where b.status <> 'cancelled' and b.departure_date > ${today} and b.arrival_date <= ${until}
        order by b.arrival_date, b.id limit 300`,
    );
    const out: CheckinRow[] = [];
    for (const r of rows) {
      const { guestNameEnc, guestSurnameEnc, ...rest } = r;
      out.push({
        ...rest,
        totalAmountMinor: Number(rest.totalAmountMinor),
        roomChargesMinor: Number(rest.roomChargesMinor),
        otherChargesMinor: Number(rest.otherChargesMinor),
        paidMinor: Number(rest.paidMinor),
        guestName:
          guestNameEnc && guestSurnameEnc
            ? `${await this.crypto.open(guestNameEnc)} ${await this.crypto.open(guestSurnameEnc)}`.trim()
            : "—",
      });
    }
    return out;
  }

  /**
   * Every guest with what the guest list shows (design canvas, November 2026): stays,
   * properties, lifetime value per currency, channels, what is happening now, marketing consent
   * and pinned notes. Names are opened as on the reservation list; contact details stay sealed.
   */
  async guestList(today: string): Promise<GuestListRow[]> {
    const rows = await rawRows<
      Omit<GuestListRow, "name"> & { nameEnc: string; surnameEnc: string }
    >(
      this.tx,
      sql`select g.id, g.name_enc as "nameEnc", g.surname_enc as "surnameEnc", g.country, g.language,
          (g.email_enc is not null) as "hasEmail", (g.phone_enc is not null) as "hasPhone",
          (select count(*)::int from booking b where b.guest_id = g.id and b.status <> 'cancelled') as stays,
          coalesce((select json_agg(distinct p.title) from booking b join property p on p.id = b.property_id where b.guest_id = g.id and b.status <> 'cancelled'), '[]'::json) as properties,
          coalesce((select json_agg(x) from (select b.currency, sum(b.total_amount_minor)::bigint as "amountMinor" from booking b where b.guest_id = g.id and b.status <> 'cancelled' group by b.currency) x), '[]'::json) as value,
          coalesce((select json_agg(distinct b.ota_name) from booking b where b.guest_id = g.id and b.status <> 'cancelled'), '[]'::json) as channels,
          (select b.id from booking b where b.guest_id = g.id and b.status <> 'cancelled' and b.arrival_date <= ${today} and b.departure_date > ${today} limit 1) as "inHouseBookingId",
          (select min(b.arrival_date)::text from booking b where b.guest_id = g.id and b.status <> 'cancelled' and b.arrival_date > ${today}) as "nextArrival",
          (select r.rating from review r join booking b on b.id = r.booking_id where b.guest_id = g.id order by r.inserted_at desc limit 1) as "lastRating",
          (select n.body from note n join booking b on b.id = n.subject_id where n.subject_type = 'booking' and n.pinned and b.guest_id = g.id order by n.created_at desc limit 1) as "pinnedNote",
          exists (select 1 from booking_hold h join booking b on b.id = h.booking_id where b.guest_id = g.id and h.consent_marketing) as consent,
          exists (select 1 from booking d join booking o on o.guest_id = d.guest_id
            where d.guest_id = g.id and d.status <> 'cancelled' and o.status <> 'cancelled'
              and lower(coalesce(d.ota_name, '')) in ('direct', 'staff', 'phone', 'walk_in')
              and lower(coalesce(o.ota_name, '')) not in ('direct', 'staff', 'phone', 'walk_in')
              and d.created_at::date >= o.departure_date) as "directAfterOta",
          (select b.id from booking b where b.guest_id = g.id order by b.arrival_date desc limit 1) as "lastBookingId",
          g.created_at as "createdAt"
        from guest g where g.erased_at is null order by g.created_at desc limit 2000`,
    );
    const out: GuestListRow[] = [];
    for (const r of rows) {
      const { nameEnc, surnameEnc, ...rest } = r;
      out.push({
        ...rest,
        value: rest.value.map((v) => ({
          currency: v.currency,
          amountMinor: Number(v.amountMinor),
        })),
        channels: rest.channels.filter(Boolean),
        name: `${await this.crypto.open(nameEnc)} ${await this.crypto.open(surnameEnc)}`.trim(),
      });
    }
    return out;
  }

  /** Enabled before-arrival messages by property (null: every property), for "Reminders scheduled". */
  async beforeArrivalRules(): Promise<Array<{ id: string; propertyIds: string[] | null }>> {
    const rows = await rawRows<{ id: string; conditions: Record<string, unknown> }>(
      this.tx,
      sql`select id, conditions from automation_rule where enabled and trigger = 'before_arrival'`,
    );
    return rows.map((r) => {
      const ids = r.conditions.propertyIds;
      return {
        id: r.id,
        propertyIds: Array.isArray(ids) && ids.length > 0 ? (ids as string[]) : null,
      };
    });
  }

  /**
   * Returning guests whose name or email contains `q` (accents and case ignored). Names are
   * sealed, so this opens them in memory for the most recent guests; callers hold
   * `booking:read_pii` and are audited.
   */
  async findGuests(
    q: string,
    limit: number,
  ): Promise<
    Array<{
      guestId: string;
      name: string;
      surname: string;
      email: string | null;
      phone: string | null;
      language: string | null;
      country: string | null;
      stays: number;
    }>
  > {
    const fold = (x: string) =>
      x
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .toLowerCase()
        .trim();
    const needle = fold(q);
    if (needle.length < 2) return [];
    const rows = await rawRows<{
      id: string;
      name_enc: string;
      surname_enc: string;
      email_enc: string | null;
      phone_enc: string | null;
      language: string | null;
      country: string | null;
      stays: number;
    }>(
      this.tx,
      sql`select g.id, g.name_enc, g.surname_enc, g.email_enc, g.phone_enc, g.language, g.country,
          (select count(*)::int from booking b where b.guest_id = g.id and b.status <> 'cancelled') as stays
        from guest g where g.erased_at is null order by g.created_at desc limit 2000`,
    );
    const out = [];
    for (const r of rows) {
      const name = await this.crypto.open(r.name_enc);
      const surname = await this.crypto.open(r.surname_enc);
      const email = r.email_enc ? await this.crypto.open(r.email_enc) : null;
      if (!fold(`${name} ${surname}`).includes(needle) && !fold(email ?? "").includes(needle))
        continue;
      out.push({
        guestId: r.id,
        name,
        surname,
        email,
        phone: r.phone_enc ? await this.crypto.open(r.phone_enc) : null,
        language: r.language,
        country: r.country,
        stays: r.stays,
      });
      if (out.length >= limit) break;
    }
    return out;
  }

  async acknowledge(bookingId: string, revisionId: string, userId: string): Promise<void> {
    await this.tx
      .insert(s.bookingAcknowledgement)
      .values({ orgId: this.orgId, bookingId, revisionId, acknowledgedBy: userId })
      .onConflictDoNothing();
  }
  async assignUnit(bookingRoomId: string, unitId: string | null): Promise<void> {
    await this.tx
      .update(s.bookingRoom)
      .set({ assignedUnitId: unitId })
      .where(eq(s.bookingRoom.id, bookingRoomId));
  }
  async setStayState(
    bookingRoomId: string,
    state: "expected" | "checked_in" | "checked_out" | "no_show",
    by: string,
    reason?: string,
  ): Promise<void> {
    const [br] = await this.tx
      .select({ bookingId: s.bookingRoom.bookingId })
      .from(s.bookingRoom)
      .where(eq(s.bookingRoom.id, bookingRoomId))
      .limit(1);
    if (!br) throw new RangeError("room not found");
    await this.tx
      .insert(s.stayState)
      .values({
        orgId: this.orgId,
        bookingRoomId,
        bookingId: br.bookingId,
        state,
        updatedBy: by,
        ...(state === "checked_in" ? { checkedInAt: sql`now()` } : {}),
        ...(state === "checked_out" ? { checkedOutAt: sql`now()` } : {}),
        ...(reason ? { noShowReason: reason } : {}),
      })
      .onConflictDoUpdate({
        target: s.stayState.bookingRoomId,
        set: {
          state,
          updatedBy: by,
          updatedAt: sql`now()`,
          ...(state === "checked_in" ? { checkedInAt: sql`now()` } : {}),
          ...(state === "checked_out" ? { checkedOutAt: sql`now()` } : {}),
          ...(reason ? { noShowReason: reason } : {}),
        },
      });
  }
  /** Mapping resolution queue (spec 08 §8.5): unmapped bookings with the OTA codes and ranked suggestions. */
  async unmappedQueue(): Promise<
    Array<{
      id: string;
      propertyId: string;
      propertyTitle: string;
      otaName: string | null;
      otaReservationCode: string | null;
      arrivalDate: string;
      departureDate: string;
      mappingState: string;
      rooms: Array<{
        id: string;
        roomTypeId: string | null;
        ratePlanId: string | null;
        otaRoomCode: string | null;
        otaRateCode: string | null;
      }>;
      suggestions: Array<{
        roomTypeId: string;
        roomTypeTitle: string;
        ratePlanId: string;
        ratePlanTitle: string;
      }>;
    }>
  > {
    const rows = await rawRows<{
      id: string;
      propertyId: string;
      propertyTitle: string;
      otaName: string | null;
      otaReservationCode: string | null;
      arrivalDate: string;
      departureDate: string;
      mappingState: string;
      rooms: Array<{
        id: string;
        roomTypeId: string | null;
        ratePlanId: string | null;
        otaRoomCode: string | null;
        otaRateCode: string | null;
      }>;
    }>(
      this.tx,
      sql`select b.id, b.property_id as "propertyId", p.title as "propertyTitle", b.ota_name as "otaName", b.ota_reservation_code as "otaReservationCode", b.arrival_date::text as "arrivalDate", b.departure_date::text as "departureDate", b.mapping_state as "mappingState",
        (select json_agg(json_build_object('id', br.id, 'roomTypeId', br.room_type_id, 'ratePlanId', br.rate_plan_id,
          'otaRoomCode', coalesce(r.raw_payload->'attributes'->'rooms'->0->>'ota_room_code', r.raw_payload->'attributes'->'rooms'->0->'meta'->>'room_type_code'),
          'otaRateCode', coalesce(r.raw_payload->'attributes'->'rooms'->0->>'ota_rate_code', r.raw_payload->'attributes'->'rooms'->0->'meta'->>'rate_plan_code'))) from booking_room br where br.booking_id = b.id) as rooms
        from booking b join property p on p.id = b.property_id left join booking_revision r on r.channex_revision_id = b.last_revision_id::text where b.mapping_state <> 'mapped' and b.status <> 'cancelled' order by b.arrival_date`,
    );
    const out = [];
    for (const r of rows) {
      const suggestions = await rawRows<{
        roomTypeId: string;
        roomTypeTitle: string;
        ratePlanId: string;
        ratePlanTitle: string;
      }>(
        this.tx,
        sql`select rt.id as "roomTypeId", rt.title as "roomTypeTitle", rp.id as "ratePlanId", rp.title as "ratePlanTitle" from rate_plan rp join room_type rt on rt.id = rp.room_type_id where rp.property_id = ${r.propertyId} and rp.archived_at is null order by (rp.parent_rate_plan_id is not null), rt.title, rp.title limit 10`,
      );
      out.push({ ...r, rooms: r.rooms ?? [], suggestions });
    }
    return out;
  }
  async resolveMapping(bookingId: string, roomTypeId: string, ratePlanId: string): Promise<void> {
    await this.tx
      .update(s.bookingRoom)
      .set({ roomTypeId, ratePlanId })
      .where(
        and(
          eq(s.bookingRoom.bookingId, bookingId),
          sql`(${s.bookingRoom.roomTypeId} is null or ${s.bookingRoom.ratePlanId} is null)`,
        ),
      );
    await this.tx.execute(
      sql`update booking_room_day d set room_type_id = ${roomTypeId} from booking_room br where br.id = d.booking_room_id and br.booking_id = ${bookingId} and d.room_type_id is null`,
    );
    await this.tx
      .update(s.booking)
      .set({ mappingState: "mapped", updatedAt: sql`now()` })
      .where(eq(s.booking.id, bookingId));
  }
  async savedViews(
    userId: string,
    surface: string,
  ): Promise<Array<{ id: string; name: string; filters: Record<string, unknown> }>> {
    const rows = await this.tx
      .select()
      .from(s.savedView)
      .where(and(eq(s.savedView.userId, userId), eq(s.savedView.surface, surface)));
    return rows.map((r) => ({ id: r.id, name: r.name, filters: r.filters }));
  }
  async saveView(
    id: string,
    userId: string,
    surface: string,
    name: string,
    filters: Record<string, unknown>,
  ): Promise<void> {
    await this.tx
      .insert(s.savedView)
      .values({ id, orgId: this.orgId, userId, surface, name, filters });
  }
  /** Room rack for hotel-kind properties (spec 08 §8.10): units × dates with occupancy state. */
  async roomRack(
    propertyId: string,
    from: string,
    to: string,
  ): Promise<
    Array<{
      unitId: string;
      unitName: string;
      status: string;
      stays: Array<{ bookingId: string; from: string; to: string; state: string; guest: string }>;
      blocks: Array<{ from: string; to: string; reason: string }>;
    }>
  > {
    const units = await rawRows<{ unitId: string; unitName: string; status: string }>(
      this.tx,
      sql`select id as "unitId", name as "unitName", status from unit where property_id = ${propertyId} and archived_at is null order by name`,
    );
    const stays = await rawRows<{
      unitId: string;
      bookingId: string;
      from: string;
      to: string;
      state: string;
      guest: string;
    }>(
      this.tx,
      sql`select br.assigned_unit_id as "unitId", b.id as "bookingId", br.checkin_date::text as "from", br.checkout_date::text as "to", coalesce(ss.state, 'expected') as state, coalesce(br.guest_names->0->>'surname', '') as guest
      from booking_room br join booking b on b.id = br.booking_id left join stay_state ss on ss.booking_room_id = br.id where b.property_id = ${propertyId} and b.status <> 'cancelled' and br.assigned_unit_id is not null and br.checkout_date > ${from} and br.checkin_date <= ${to}`,
    );
    const blocks = await rawRows<{
      unitId: string | null;
      from: string;
      to: string;
      reason: string;
    }>(
      this.tx,
      sql`select unit_id as "unitId", date_from::text as "from", date_to::text as "to", reason from unit_block where property_id = ${propertyId} and cancelled_at is null and date_to > ${from} and date_from <= ${to}`,
    );
    return units.map((u) => ({
      ...u,
      stays: stays.filter((x) => x.unitId === u.unitId),
      blocks: blocks.filter((x) => x.unitId === u.unitId),
    }));
  }
}

export interface GuestListRow {
  id: string;
  name: string;
  country: string | null;
  language: string | null;
  hasEmail: boolean;
  hasPhone: boolean;
  stays: number;
  properties: string[];
  /** Lifetime value per currency, non-cancelled stays. */
  value: Array<{ currency: string; amountMinor: number }>;
  /** Channex `ota_name`s the guest booked through. */
  channels: string[];
  inHouseBookingId: string | null;
  nextArrival: string | null;
  lastRating: number | null;
  /** The latest pinned note on any of the guest's bookings: the guest is flagged. */
  pinnedNote: string | null;
  /** Ticked "keep me posted" on a direct booking. */
  consent: boolean;
  /** Booked direct after a stay that came through a channel. */
  directAfterOta: boolean;
  /** The most recent booking, for the link from the list. */
  lastBookingId: string | null;
  createdAt: string;
}

export interface CheckinRow {
  id: string;
  propertyId: string;
  propertyTitle: string;
  propertyKind: string;
  otaName: string | null;
  status: string;
  arrivalDate: string;
  departureDate: string;
  currency: string;
  totalAmountMinor: number;
  paymentCollect: string | null;
  guestName: string;
  hasEmail: boolean;
  guestLanguage: string | null;
  guestsExpected: number;
  formCompletedAt: string | null;
  guestsListed: number;
  idOnFile: boolean;
  arrivalTime: string | null;
  codeMasked: string | null;
  codeValidFrom: string | null;
  codeDelivery: string | null;
  roomChargesMinor: number;
  otherChargesMinor: number;
  paidMinor: number;
  hasThread: boolean;
}

export interface ReservationDetail {
  id: string;
  propertyId: string;
  propertyTitle: string;
  propertyKind: string;
  timezone: string;
  channexBookingId: string;
  otaName: string | null;
  otaReservationCode: string | null;
  status: string;
  arrivalDate: string;
  departureDate: string;
  currency: string;
  totalAmountMinor: number;
  otaCommissionMinor: number | null;
  /** Channex `payment_collect` / `payment_type`; null when the channel did not say. */
  paymentCollect: string | null;
  paymentType: string | null;
  mappingState: string;
  lastRevisionId: string | null;
  rooms: Array<{
    id: string;
    roomTypeId: string | null;
    roomTypeTitle: string | null;
    ratePlanId: string | null;
    ratePlanTitle: string | null;
    checkinDate: string;
    checkoutDate: string;
    occupancy: { adults: number; children: number; infants: number; ages?: number[] };
    guestNames: Array<{ name: string; surname: string }>;
    amountMinor: number;
    assignedUnitId: string | null;
    unitName: string | null;
    stayState: string;
    maxOccupancy: number | null;
    days: Array<{ date: string; amountMinor: number }>;
  }>;
  revisions: Array<{
    id: string;
    channexRevisionId: string;
    revisionType: string;
    systemId: string;
    insertedAt: string;
    receivedAt: string;
    diff: RevisionDiff | null;
    acknowledged: boolean;
    timelineText: string;
    /** The booking's total and party size as this revision stated them. */
    amountMinor: number;
    guests: number;
  }>;
  /** Local events on the stay, newest first: form done, code issued or revoked, check-in/out, messages sent. */
  events: Array<{
    kind:
      "form_done" | "code_issued" | "code_revoked" | "checked_in" | "checked_out" | "message_sent";
    at: string;
    detail: string | null;
  }>;
  checkInTime: string;
  checkOutTime: string;
  /** This guest's stays up to and including this one ("2nd stay"). */
  guestStays: number;
  preCheckin: {
    completedAt: string | null;
    arrivalTime: string | null;
    guests: number;
    idOnFile: boolean;
  } | null;
  guest: {
    id: string;
    country: string | null;
    language: string | null;
    hasEmail: boolean;
    hasPhone: boolean;
  } | null;
  instruments: Array<{
    id: string;
    type: string;
    cardType: string | null;
    maskedNumber: string | null;
    expiry: string | null;
    vccBalanceMinor: number | null;
    vccEffectiveTo: string | null;
  }>;
  financials: {
    roomRevenueMinor: number;
    extrasMinor: number;
    taxesMinor: number;
    withheldTaxesMinor: number;
    otaCommissionMinor: number;
  };
  unacknowledged: boolean;
}

/** RES-4 / spec 08 §8.3: a human-readable diff line. */
export function describeDiff(diff: RevisionDiff | null, type: string, currency: string): string {
  if (!diff || diff.first)
    return type === "cancelled" ? "Cancelled on arrival" : "Booking received";
  const parts: string[] = [];
  if (diff.statusChanged && diff.statusChanged.to !== "modified")
    parts.push(`Status ${diff.statusChanged.from ?? "—"} → ${diff.statusChanged.to}`);
  if (diff.datesChanged?.from) {
    const f = diff.datesChanged.from;
    const t = diff.datesChanged.to;
    if (f.arrival !== t.arrival) parts.push(`Arrival ${f.arrival} → ${t.arrival}`);
    if (f.departure !== t.departure) parts.push(`Departure ${f.departure} → ${t.departure}`);
    const delta = diff.nightsAdded.length - diff.nightsRemoved.length;
    if (delta !== 0) parts.push(`${delta > 0 ? "+" : ""}${String(delta)} nights`);
  }
  if (diff.amountChanged) parts.push(`amount changed (${currency})`);
  if (diff.datesChanged || diff.statusChanged?.to === "cancelled")
    parts.push("turnover tasks re-planned, access code rotated");
  return parts.join(" · ") || "Revision applied";
}
