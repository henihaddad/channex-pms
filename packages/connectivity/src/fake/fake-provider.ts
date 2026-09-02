import {
  Id,
  ThrottleError,
  TransientError,
  ValidationError,
  ContractError,
  type AdapterDescriptor,
  type AriQuery,
  type AriSnapshot,
  type AttachmentUpload,
  type AvailabilityBatch,
  type BookingRevisionPage,
  type BookingRevisionPayload,
  type CallMeta,
  type ChannelSpec,
  type CloseReason,
  type ConnectionSettings,
  type ConnectivityProvider,
  type GroupSpec,
  type MappingOptions,
  type OutboundMessage,
  type PropertySpec,
  type ProviderRef,
  type PushResult,
  type RatePlanSpec,
  type Readiness,
  type RestrictionBatch,
  type ReviewPage,
  type ReviewQuery,
  type RoomTypeSpec,
  type TestResult,
  type ThreadPage,
  type ThreadQuery,
  type RestrictionEntry,
  type AvailabilityEntry,
} from "@pms/core";
import {
  applyAvailabilityEntries,
  applyRestrictionEntries,
  availKey,
  emptyState,
  rateKey,
  type AriState,
} from "@pms/sync";
import { mulberry32 } from "./rng.js";

export type FaultKind =
  | "429"
  | "5xx"
  | "timeout"
  | "partial_422"
  | "outage"
  | "duplicate_webhook"
  | "reorder_webhooks"
  | "drop_webhook"
  | "unmapped_booking";

export interface FaultRule {
  /** Operation name prefix, e.g. "push", "ack", "feed", "webhook". Omit for all. */
  op?: string;
  probability?: number;
  /** Fire at most this many times. */
  times?: number;
  fault: FaultKind;
}

export interface FaultPlan {
  seed: number;
  rules: FaultRule[];
}

/** Everything the fake has seen and done: the oracle for the chaos runner. */
export interface Ledger {
  emitted: BookingRevisionPayload[];
  acks: Array<{ revisionId: string; at: number }>;
  ari: AriState;
  webhooksDelivered: WebhookPayload[];
  webhooksDropped: number;
  calls: Array<{ op: string; dedupeKey: string; outcome: "ok" | FaultKind }>;
}

export interface WebhookPayload {
  event: string;
  property_id: string;
  timestamp: string;
  user_id: null;
  payload: Record<string, unknown>;
}

export interface BookingSpec {
  propertyId: string;
  roomTypeId: string | null;
  ratePlanId: string | null;
  arrivalDate: string;
  departureDate: string;
  /** date → minor units */
  days: Record<string, number>;
  currency?: string;
  adults?: number;
  otaName?: string;
}

/**
 * In-memory ConnectivityProvider that behaves like Channex, including the
 * failures that matter (spec 04 §4.3, spec 15 M1): 429 storms, 5xx, timeouts,
 * partially valid batches, outages, duplicate/reordered/dropped webhooks and
 * unmapped bookings. The whole test suite and demo seed run against it.
 */
export class FakeProvider implements ConnectivityProvider {
  readonly ledger: Ledger = {
    emitted: [],
    acks: [],
    ari: emptyState(),
    webhooksDelivered: [],
    webhooksDropped: 0,
    calls: [],
  };
  /** Set by the harness: where webhooks go. */
  webhookSink: ((payload: WebhookPayload) => Promise<void>) | null = null;

  private readonly rand: () => number;
  private readonly fired = new Map<FaultRule, number>();
  private readonly unacked = new Map<string, BookingRevisionPayload>();
  private readonly acked = new Set<string>();
  private readonly bookings = new Map<string, BookingRevisionPayload>();
  private readonly created = new Map<string, unknown>();
  private readonly pendingWebhooks: WebhookPayload[] = [];
  private clock = 0;
  private systemSeq = 1000;

  constructor(readonly plan: FaultPlan = { seed: 1, rules: [] }) {
    this.rand = mulberry32(plan.seed);
  }

  // ---- fault machinery --------------------------------------------------------------

  private pick(op: string): FaultKind | null {
    for (const rule of this.plan.rules) {
      if (rule.op && !op.startsWith(rule.op)) continue;
      const n = this.fired.get(rule) ?? 0;
      if (rule.times !== undefined && n >= rule.times) continue;
      if (rule.probability !== undefined && this.rand() > rule.probability) continue;
      this.fired.set(rule, n + 1);
      return rule.fault;
    }
    return null;
  }

  private guard(op: string, meta: CallMeta): FaultKind | null {
    this.clock += 1;
    const fault = this.pick(op);
    this.ledger.calls.push({ op, dedupeKey: meta.dedupeKey, outcome: fault ?? "ok" });
    switch (fault) {
      case "429":
        throw new ThrottleError(250);
      case "5xx":
      case "outage":
        throw new TransientError(`${op}: simulated ${fault}`);
      case "timeout":
        throw new TransientError(`${op}: simulated timeout`);
      default:
        return fault;
    }
  }

  // ---- provisioning ------------------------------------------------------------------

  async ensureGroup(g: GroupSpec, meta: CallMeta): Promise<ProviderRef> {
    this.guard("ensureGroup", meta);
    return this.remember("group", g);
  }
  async ensureProperty(p: PropertySpec, meta: CallMeta): Promise<ProviderRef> {
    this.guard("ensureProperty", meta);
    return this.remember("property", p);
  }
  async ensureRoomType(rt: RoomTypeSpec, meta: CallMeta): Promise<ProviderRef> {
    this.guard("ensureRoomType", meta);
    return this.remember("room_type", rt);
  }
  async ensureRatePlan(rp: RatePlanSpec, meta: CallMeta): Promise<ProviderRef> {
    this.guard("ensureRatePlan", meta);
    return this.remember("rate_plan", rp);
  }

  private remember(kind: string, spec: unknown): ProviderRef {
    // idempotent by natural key (PROV-3): same title in the same parent returns the same id
    const key = `${kind}:${JSON.stringify(spec)}`;
    const existing = this.created.get(key);
    if (typeof existing === "string") return { id: existing };
    const id = Id.next();
    this.created.set(key, id);
    return { id };
  }

  // ---- ARI ---------------------------------------------------------------------------

  async pushAvailability(batch: AvailabilityBatch, meta: CallMeta): Promise<PushResult> {
    const fault = this.guard("push.availability", meta);
    const { accepted, rejected } = this.partial(batch.entries, fault);
    applyAvailabilityEntries(this.ledger.ari, accepted);
    return { accepted: accepted.length, rejected, warnings: [], taskIds: [Id.next()] };
  }

  async pushRatesAndRestrictions(batch: RestrictionBatch, meta: CallMeta): Promise<PushResult> {
    const fault = this.guard("push.restrictions", meta);
    const invalid = batch.entries
      .map((e, i) => ({ e, i }))
      .filter(
        ({ e }) =>
          (e.rate !== undefined && e.rate < 0) || (e.minStay !== undefined && e.minStay < 1),
      );
    if (invalid.length === batch.entries.length && batch.entries.length > 0)
      throw new ValidationError("restrictions.push: every entry invalid", {
        count: invalid.length,
      });
    const { accepted, rejected } = this.partial(
      batch.entries,
      fault,
      new Set(invalid.map((x) => x.i)),
    );
    applyRestrictionEntries(this.ledger.ari, accepted);
    return { accepted: accepted.length, rejected, warnings: [], taskIds: [Id.next()] };
  }

  /** A `partial_422` fault rejects every other entry, as Channex does when a batch mixes valid and invalid values. */
  private partial<T extends RestrictionEntry | AvailabilityEntry>(
    entries: T[],
    fault: FaultKind | null,
    alwaysInvalid = new Set<number>(),
  ): { accepted: T[]; rejected: PushResult["rejected"] } {
    const accepted: T[] = [];
    const rejected: PushResult["rejected"] = [];
    entries.forEach((e, i) => {
      if (alwaysInvalid.has(i))
        rejected.push({ index: i, reason: "rate: must be non-negative", field: "rate" });
      else if (fault === "partial_422" && i % 2 === 1)
        rejected.push({ index: i, reason: "date: simulated validation error", field: "date" });
      else accepted.push(e);
    });
    return { accepted, rejected };
  }

  async readAri(q: AriQuery, meta: CallMeta): Promise<AriSnapshot> {
    this.guard("readAri", meta);
    const inRange = (date: string) => date >= q.dateFrom && date <= q.dateTo;
    const availability: AriSnapshot["availability"] = [];
    for (const [k, v] of this.ledger.ari.availability) {
      const [roomTypeId, date] = k.split("|") as [string, string];
      if (inRange(date)) availability.push({ roomTypeId, date, availability: v });
    }
    const restrictions: AriSnapshot["restrictions"] = [];
    for (const [k, v] of this.ledger.ari.restrictions) {
      const [ratePlanId, date] = k.split("|") as [string, string];
      if (inRange(date)) restrictions.push({ ratePlanId, date, ...v });
    }
    return { availability, restrictions };
  }

  /** Test hook: an edit made in the Channex dashboard or by an OTA (drift, spec 05 §5.4.6). */
  driftRestriction(ratePlanId: string, date: string, values: Record<string, unknown>): void {
    const k = rateKey(ratePlanId, date);
    this.ledger.ari.restrictions.set(k, {
      ...(this.ledger.ari.restrictions.get(k) ?? {}),
      ...values,
    });
    this.queueWebhook({
      event: "ari",
      property_id: "*",
      timestamp: this.now(),
      user_id: null,
      payload: { rate_plan_id: ratePlanId, date },
    });
  }
  driftAvailability(roomTypeId: string, date: string, availability: number): void {
    this.ledger.ari.availability.set(availKey(roomTypeId, date), availability);
  }

  // ---- channels ----------------------------------------------------------------------

  async getAdapterDescriptor(code: string, meta: CallMeta): Promise<AdapterDescriptor> {
    this.guard("channels.adapter", meta);
    return {
      code,
      title: code === "BookingCom" ? "Booking.com" : code,
      capabilities: ["rates", "availability", "restrictions", "messaging"],
      fields: [
        { name: "hotel_id", type: "string", label: "Hotel ID", required: true },
        { name: "currency", type: "string", label: "Currency", required: false },
      ],
    };
  }
  async testConnection(s: ConnectionSettings, meta: CallMeta): Promise<TestResult> {
    this.guard("channels.test", meta);
    return s.settings.hotel_id ? { ok: true } : { ok: false, message: "hotel_id is required" };
  }
  async readChannelMappingOptions(_s: ConnectionSettings, meta: CallMeta): Promise<MappingOptions> {
    this.guard("channels.mapping", meta);
    return {
      rooms: [
        {
          code: "R1",
          title: "Double Room",
          rates: [{ code: "RP1", title: "Standard", occupancy: 2 }],
        },
      ],
    };
  }
  async createChannel(c: ChannelSpec, meta: CallMeta): Promise<ProviderRef> {
    this.guard("channels.create", meta);
    return this.remember("channel", c);
  }
  async checkReadiness(_ref: ProviderRef, meta: CallMeta): Promise<Readiness> {
    this.guard("channels.readiness", meta);
    return { ready: true, issues: [] };
  }
  async setChannelActive(_ref: ProviderRef, _active: boolean, meta: CallMeta): Promise<void> {
    this.guard("channels.activate", meta);
  }

  // ---- reservations ------------------------------------------------------------------

  /** Emit a new booking (one revision) into the feed and deliver its webhook per the fault plan. */
  emitBooking(spec: BookingSpec): BookingRevisionPayload {
    const unmapped = this.pick("booking.emit") === "unmapped_booking";
    const bookingId = Id.next();
    return this.emitRevision(
      {
        revisionId: Id.next(),
        bookingId,
        systemId: String(this.systemSeq++),
        propertyId: spec.propertyId,
        status: "new",
        arrivalDate: spec.arrivalDate,
        departureDate: spec.departureDate,
        currency: spec.currency ?? "EUR",
        amount: Object.values(spec.days).reduce((a, b) => a + b, 0),
        otaName: spec.otaName ?? "Booking.com",
        otaReservationCode: `OTA-${bookingId.slice(-8)}`,
        insertedAt: this.now(),
        rooms: [
          {
            roomTypeId: unmapped ? null : spec.roomTypeId,
            ratePlanId: unmapped ? null : spec.ratePlanId,
            checkinDate: spec.arrivalDate,
            checkoutDate: spec.departureDate,
            days: spec.days,
            occupancy: { adults: spec.adults ?? 2, children: 0, infants: 0 },
            guests: [{ name: "Guest", surname: bookingId.slice(-4) }],
          },
        ],
        customer: {
          name: "Guest",
          surname: bookingId.slice(-4),
          email: `guest-${bookingId.slice(-6)}@example.com`,
        },
        services: [],
        taxes: [],
        raw: { fake: true },
      },
      "booking_new",
    );
  }

  modifyBooking(
    bookingId: string,
    change: { departureDate?: string; days?: Record<string, number> },
  ): BookingRevisionPayload {
    const prev = this.bookings.get(bookingId);
    if (!prev) throw new ContractError("unknown booking", { bookingId });
    const room = prev.rooms[0]!;
    const days = change.days ?? room.days;
    return this.emitRevision(
      {
        ...prev,
        revisionId: Id.next(),
        systemId: String(this.systemSeq++),
        status: "modified",
        insertedAt: this.now(),
        departureDate: change.departureDate ?? prev.departureDate,
        amount: Object.values(days).reduce((a, b) => a + b, 0),
        rooms: [{ ...room, checkoutDate: change.departureDate ?? room.checkoutDate, days }],
      },
      "booking_modification",
    );
  }

  cancelBooking(bookingId: string): BookingRevisionPayload {
    const prev = this.bookings.get(bookingId);
    if (!prev) throw new ContractError("unknown booking", { bookingId });
    return this.emitRevision(
      {
        ...prev,
        revisionId: Id.next(),
        systemId: String(this.systemSeq++),
        status: "cancelled",
        insertedAt: this.now(),
      },
      "booking_cancellation",
    );
  }

  private emitRevision(rev: BookingRevisionPayload, event: string): BookingRevisionPayload {
    this.bookings.set(rev.bookingId, rev);
    this.unacked.set(rev.revisionId, rev);
    this.ledger.emitted.push(rev);
    this.queueWebhook({
      event,
      property_id: rev.propertyId,
      timestamp: rev.insertedAt,
      user_id: null,
      payload: { booking_id: rev.bookingId, revision_id: rev.revisionId },
    });
    return rev;
  }

  async listBookingRevisions(
    propertyId: string,
    cursor: string | undefined,
    meta: CallMeta,
  ): Promise<BookingRevisionPage> {
    this.guard("feed", meta);
    const all = [...this.unacked.values()]
      .filter((r) => r.propertyId === propertyId)
      .sort((a, b) =>
        a.insertedAt < b.insertedAt
          ? -1
          : a.insertedAt > b.insertedAt
            ? 1
            : a.systemId < b.systemId
              ? -1
              : 1,
      );
    const page = cursor ? Number(cursor) : 1;
    const size = 10;
    const slice = all.slice((page - 1) * size, page * size);
    return {
      revisions: slice,
      ...(page * size < all.length ? { nextCursor: String(page + 1) } : {}),
    };
  }

  async ackBookingRevisions(ids: string[], meta: CallMeta): Promise<void> {
    this.guard("ack", meta);
    for (const id of ids) {
      if (this.unacked.delete(id) || this.acked.has(id)) {
        this.acked.add(id);
        this.ledger.acks.push({ revisionId: id, at: this.clock });
      } else throw new ValidationError("ack: unknown revision", { id });
    }
  }

  async getBooking(ref: ProviderRef, meta: CallMeta): Promise<BookingRevisionPayload> {
    this.guard("bookings.get", meta);
    const b = this.bookings.get(ref.id);
    if (!b) throw new ValidationError("bookings.get: not found", { id: ref.id });
    return b;
  }

  // ---- messaging + reviews (minimal until M4) -----------------------------------------

  async listThreads(_q: ThreadQuery, meta: CallMeta): Promise<ThreadPage> {
    this.guard("threads.list", meta);
    return { threads: [] };
  }
  async sendMessage(_m: OutboundMessage, meta: CallMeta): Promise<ProviderRef> {
    this.guard("messages.send", meta);
    return { id: Id.next() };
  }
  async uploadAttachment(_a: AttachmentUpload, meta: CallMeta): Promise<ProviderRef> {
    this.guard("attachments.upload", meta);
    return { id: Id.next() };
  }
  async closeThread(_ref: ProviderRef, _reason: CloseReason, meta: CallMeta): Promise<void> {
    this.guard("threads.close", meta);
  }
  async listReviews(_q: ReviewQuery, meta: CallMeta): Promise<ReviewPage> {
    this.guard("reviews.list", meta);
    return { reviews: [] };
  }
  async respondToReview(_ref: ProviderRef, _body: string, meta: CallMeta): Promise<void> {
    this.guard("reviews.reply", meta);
  }

  // ---- webhooks ----------------------------------------------------------------------

  private queueWebhook(w: WebhookPayload): void {
    this.pendingWebhooks.push(w);
  }

  /**
   * Deliver queued webhooks to the sink, applying duplicate / reorder / drop
   * faults. Channex retries 5xx up to 11 times over ~24 h; the sink returning
   * (not throwing) counts as delivered. Call from the harness whenever "time passes".
   */
  async flushWebhooks(): Promise<number> {
    if (!this.webhookSink) return 0;
    let batch = this.pendingWebhooks.splice(0);
    if (batch.length > 1 && this.pick("webhook.order") === "reorder_webhooks")
      batch = shuffle(batch, this.rand);
    let delivered = 0;
    for (const w of batch) {
      const fault = this.pick("webhook.deliver");
      if (fault === "drop_webhook") {
        this.ledger.webhooksDropped += 1;
        continue;
      }
      const times = fault === "duplicate_webhook" ? 2 : 1;
      for (let i = 0; i < times; i++) {
        await this.webhookSink(w);
        this.ledger.webhooksDelivered.push(w);
        delivered += 1;
      }
    }
    return delivered;
  }

  get pendingWebhookCount(): number {
    return this.pendingWebhooks.length;
  }

  unackedRevisionIds(): string[] {
    return [...this.unacked.keys()];
  }

  private now(): string {
    return new Date(Date.UTC(2026, 8, 1) + this.clock * 1000).toISOString();
  }
}

function shuffle<T>(xs: T[], rand: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}
