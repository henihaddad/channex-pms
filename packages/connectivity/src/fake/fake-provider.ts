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
  type RemoteChannel,
  type AirbnbConnectionLinkSpec,
  type RemoteListing,
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
  type WebhookSpec,
  type ImportedProperty,
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
  /** Every guest-facing message the fake accepted (MSG-6 oracle: notes never appear here). */
  messagesSent: Array<{ threadId: string; id: string; body: string; dedupeKey: string }>;
  reviewResponses: Array<{ reviewId: string; body: string }>;
  calls: Array<{ op: string; dedupeKey: string; outcome: "ok" | FaultKind }>;
}

export interface WebhookPayload {
  event: string;
  property_id: string;
  timestamp: string;
  user_id: null;
  payload: Record<string, unknown>;
}

export interface FakeMessage {
  id: string;
  direction: "inbound" | "outbound";
  authorType: "guest" | "staff" | "system";
  body: string;
  sentAt: string;
  attachments: Array<{ id: string; filename: string; contentType: string }>;
}
export interface FakeThread {
  id: string;
  propertyId: string;
  bookingId: string | undefined;
  provider: string;
  guestName: string;
  guestLanguage: string;
  kind: "booking" | "inquiry";
  state: "open" | "closed";
  updatedAt: string;
  messages: FakeMessage[];
}
export interface FakeReview {
  id: string;
  propertyId: string;
  bookingId: string | undefined;
  rating: number;
  text: string;
  ota: string;
  guestName: string;
  insertedAt: string;
  response: string | undefined;
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
    messagesSent: [],
    reviewResponses: [],
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
  private readonly listingMappings = new Map<
    string,
    Array<{ id: string; ratePlanId: string; listingId: string }>
  >();
  private readonly pendingWebhooks: WebhookPayload[] = [];
  private readonly threads = new Map<string, FakeThread>();
  private readonly reviews = new Map<string, FakeReview>();
  private readonly attachments = new Map<string, AttachmentUpload>();
  /** Harness hook: message and review timestamps come from here (defaults to the synthetic clock). */
  nowSource: (() => string) | null = null;
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

  async ensureWebhook(w: WebhookSpec, meta: CallMeta): Promise<ProviderRef> {
    this.guard("ensureWebhook", meta);
    return this.remember("webhook", { propertyId: w.propertyId, callbackUrl: w.callbackUrl });
  }

  /** Q7: read back what was provisioned (or seeded via `seedRemoteProperty`) so a PMS can adopt it. */
  async importProperty(ref: ProviderRef, meta: CallMeta): Promise<ImportedProperty> {
    this.guard("importProperty", meta);
    const specs = [...this.created.entries()].map(([k, id]) => ({
      kind: k.slice(0, k.indexOf(":")),
      spec: JSON.parse(k.slice(k.indexOf(":") + 1)) as Record<string, unknown>,
      id: String(id),
    }));
    const prop = specs.find((s) => s.kind === "property" && s.id === ref.id);
    if (!prop) throw new ValidationError(`property ${ref.id} not found`);
    const roomTypes = specs
      .filter((s) => s.kind === "room_type" && s.spec.propertyId === ref.id)
      .map((s) => ({
        id: s.id,
        title: String(s.spec.title),
        countOfRooms: Number(s.spec.countOfRooms),
        occAdults: Number(s.spec.occAdults),
        occChildren: Number(s.spec.occChildren),
        occInfants: Number(s.spec.occInfants ?? 0),
      }));
    const ratePlans = specs
      .filter((s) => s.kind === "rate_plan" && s.spec.propertyId === ref.id)
      .map((s) => ({
        id: s.id,
        roomTypeId: String(s.spec.roomTypeId),
        title: String(s.spec.title),
        currency: String(s.spec.currency),
        parentRatePlanId:
          typeof s.spec.parentRatePlanId === "string" ? s.spec.parentRatePlanId : null,
      }));
    return {
      property: {
        id: ref.id,
        title: String(prop.spec.title),
        currency: String(prop.spec.currency),
        timezone: String(prop.spec.timezone),
        ...(typeof prop.spec.groupId === "string" ? { groupId: prop.spec.groupId } : {}),
      },
      roomTypes,
      ratePlans,
    };
  }

  /** Test helper: a property that exists on the provider side before we know about it. */
  async seedRemoteProperty(input: {
    title: string;
    currency: string;
    timezone: string;
    roomTypes: Array<{ title: string; countOfRooms: number; ratePlans: string[] }>;
  }): Promise<string> {
    const meta = { dedupeKey: `seed:${input.title}`, requestId: "seed" };
    const p = await this.ensureProperty(
      { title: input.title, currency: input.currency, timezone: input.timezone },
      meta,
    );
    for (const rt of input.roomTypes) {
      const r = await this.ensureRoomType(
        {
          propertyId: p.id,
          title: rt.title,
          countOfRooms: rt.countOfRooms,
          occAdults: 2,
          occChildren: 0,
          occInfants: 0,
          defaultOccupancy: 2,
        },
        meta,
      );
      for (const title of rt.ratePlans)
        await this.ensureRatePlan(
          {
            propertyId: p.id,
            roomTypeId: r.id,
            title,
            currency: input.currency,
            sellMode: "per_room",
            options: [{ occupancy: 2, isPrimary: true, rate: 10000 }],
          },
          meta,
        );
    }
    return p.id;
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
  async createChannelSession(propertyId: string, meta: CallMeta): Promise<{ token: string }> {
    this.guard("channels.session", meta);
    return { token: `fake-session-${propertyId.slice(0, 8)}` };
  }
  /** The channels created through `createChannel` for the property, as the provider's UI would list them. */
  async listChannels(propertyId: string, meta: CallMeta): Promise<RemoteChannel[]> {
    this.guard("channels.list", meta);
    const out: RemoteChannel[] = [];
    for (const [key, id] of this.created.entries()) {
      if (!key.startsWith("channel:") || typeof id !== "string") continue;
      const spec = JSON.parse(key.slice("channel:".length)) as ChannelSpec;
      const props = Array.isArray(spec.settings.properties)
        ? (spec.settings.properties as string[])
        : [spec.propertyId];
      if (!props.includes(propertyId)) continue;
      out.push({
        id,
        adapterCode: spec.adapterCode,
        title: spec.adapterCode,
        isActive: true,
        status: "active",
        mappings: [
          ...spec.mappings.map((m) => ({
            ratePlanId: m.ratePlanId,
            roomCode: m.roomCode,
            rateCode: m.rateCode,
            ...(m.occupancy !== undefined ? { occupancy: m.occupancy } : {}),
          })),
          ...(this.listingMappings.get(id) ?? []).map((m) => ({
            id: m.id,
            ratePlanId: m.ratePlanId,
            roomCode: m.listingId,
            rateCode: m.listingId,
            listingId: m.listingId,
          })),
        ],
      });
    }
    return out;
  }
  /** Consent is immediate: the link is the caller's own callback with a freshly remembered channel. */
  async createAirbnbConnectionLink(
    spec: AirbnbConnectionLinkSpec,
    meta: CallMeta,
  ): Promise<{ url: string }> {
    this.guard("airbnb.connection_link", meta);
    const ref = this.remember("channel", {
      adapterCode: "AirBNB",
      propertyId: spec.propertyIds[0] ?? "",
      settings: { properties: spec.propertyIds },
      mappings: [],
    });
    const u = new URL(spec.redirectUri);
    u.searchParams.set("success", "true");
    u.searchParams.set("channel_id", ref.id);
    u.searchParams.set("token", spec.token);
    return { url: u.toString() };
  }
  async listChannelListings(_ref: ProviderRef, meta: CallMeta): Promise<RemoteListing[]> {
    this.guard("airbnb.listings", meta);
    return [
      {
        id: "10000001",
        title: "Fake Loft by the River",
        type: "Entire home/apt",
        city: "Porto",
        countryCode: "PT",
        occupancies: [1, 2, 3, 4],
      },
      {
        id: "10000002",
        title: "Fake Garden Studio",
        type: "Entire home/apt",
        city: "Porto",
        countryCode: "PT",
        occupancies: [1, 2],
      },
    ];
  }
  async mapListing(
    ref: ProviderRef,
    mapping: { ratePlanId: string; listingId: string },
    meta: CallMeta,
  ): Promise<ProviderRef> {
    this.guard("airbnb.mapping.create", meta);
    const list = this.listingMappings.get(ref.id) ?? [];
    if (list.some((m) => m.listingId === mapping.listingId))
      throw new ValidationError("mapping the same listing twice is rejected");
    const id = Id.next();
    list.push({ id, ...mapping });
    this.listingMappings.set(ref.id, list);
    return { id };
  }
  async removeMapping(ref: ProviderRef, mappingId: string, meta: CallMeta): Promise<void> {
    this.guard("channels.mapping.delete", meta);
    this.listingMappings.set(
      ref.id,
      (this.listingMappings.get(ref.id) ?? []).filter((m) => m.id !== mappingId),
    );
  }
  async loadFutureReservations(
    _ref: ProviderRef,
    meta: CallMeta,
    _listingId?: string,
  ): Promise<void> {
    this.guard("airbnb.load_future_reservations", meta);
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

  // ---- messaging + reviews (spec 05 §5.8, spec 09) -----------------------------------

  /**
   * A guest writes (or an OTA posts a system notice such as an Airbnb inquiry).
   * Creates the thread when needed and queues a `message` webhook; sync then
   * pulls the thread (a webhook is a trigger, not truth: CXMSG-2).
   */
  emitGuestMessage(input: {
    propertyId: string;
    bookingId?: string;
    threadId?: string;
    provider?: string;
    body: string;
    guestName?: string;
    guestLanguage?: string;
    authorType?: "guest" | "system";
    kind?: "booking" | "inquiry";
  }): { threadId: string; messageId: string } {
    const at = this.stamp();
    let thread = input.threadId ? this.threads.get(input.threadId) : undefined;
    if (!thread && input.bookingId)
      thread = [...this.threads.values()].find((t) => t.bookingId === input.bookingId);
    if (!thread) {
      thread = {
        id: Id.next(),
        propertyId: input.propertyId,
        bookingId: input.bookingId,
        provider: input.provider ?? "booking_com",
        guestName: input.guestName ?? "Ana Guest",
        guestLanguage: input.guestLanguage ?? "en",
        kind: input.kind ?? (input.bookingId ? "booking" : "inquiry"),
        state: "open",
        updatedAt: at,
        messages: [],
      };
      this.threads.set(thread.id, thread);
    }
    const message: FakeMessage = {
      id: Id.next(),
      direction: "inbound",
      authorType: input.authorType ?? "guest",
      body: input.body,
      sentAt: at,
      attachments: [],
    };
    thread.messages.push(message);
    thread.state = "open";
    thread.updatedAt = at;
    this.queueWebhook({
      event: "message",
      property_id: thread.propertyId,
      timestamp: at,
      user_id: null,
      payload: { thread_id: thread.id, message_id: message.id },
    });
    return { threadId: thread.id, messageId: message.id };
  }

  /** A stay was reviewed on the OTA; queues a `review` webhook. */
  emitReview(input: {
    propertyId: string;
    bookingId?: string;
    rating: number;
    text: string;
    ota?: string;
    guestName?: string;
  }): string {
    const at = this.stamp();
    const review: FakeReview = {
      id: Id.next(),
      propertyId: input.propertyId,
      bookingId: input.bookingId,
      rating: input.rating,
      text: input.text,
      ota: input.ota ?? "Booking.com",
      guestName: input.guestName ?? "Ana Guest",
      insertedAt: at,
      response: undefined,
    };
    this.reviews.set(review.id, review);
    this.queueWebhook({
      event: "review",
      property_id: input.propertyId,
      timestamp: at,
      user_id: null,
      payload: { review_id: review.id },
    });
    return review.id;
  }

  /** Test oracle: the thread as the provider sees it. */
  thread(id: string): FakeThread | undefined {
    return this.threads.get(id);
  }

  async listThreads(q: ThreadQuery, meta: CallMeta): Promise<ThreadPage> {
    this.guard("threads.list", meta);
    const threads = [...this.threads.values()]
      .filter((t) => t.propertyId === q.propertyId)
      .filter((t) => !q.updatedSince || t.updatedAt >= q.updatedSince)
      .sort((a, b) => (a.updatedAt < b.updatedAt ? -1 : 1))
      .map((t) => ({
        id: t.id,
        ...(t.bookingId ? { bookingId: t.bookingId } : {}),
        provider: t.provider,
        updatedAt: t.updatedAt,
        guestName: t.guestName,
        guestLanguage: t.guestLanguage,
        kind: t.kind,
        state: t.state,
        messages: t.messages.map((m) => ({
          id: m.id,
          direction: m.direction,
          authorType: m.authorType,
          body: m.body,
          sentAt: m.sentAt,
          ...(m.attachments.length ? { attachments: m.attachments } : {}),
        })),
      }));
    return { threads };
  }

  /**
   * `booking:<id>` addresses a booking that has no thread yet (an automation
   * writing first); the provider opens the thread. Faults on `messages.send`
   * are how tests see a failed delivery rendered as failed (spec 09 §9.2).
   */
  async sendMessage(m: OutboundMessage, meta: CallMeta): Promise<ProviderRef> {
    this.guard("messages.send", meta);
    let thread = this.threads.get(m.threadId);
    if (!thread && m.threadId.startsWith("booking:")) {
      const bookingId = m.threadId.slice("booking:".length);
      thread = [...this.threads.values()].find((t) => t.bookingId === bookingId);
      if (!thread) {
        const b = this.bookings.get(bookingId);
        if (!b) throw new ValidationError("messages.send: unknown booking", { id: bookingId });
        thread = {
          id: Id.next(),
          propertyId: b.propertyId,
          bookingId,
          provider: b.otaName,
          guestName: `${b.customer.name} ${b.customer.surname}`,
          guestLanguage: "en",
          kind: "booking",
          state: "open",
          updatedAt: this.stamp(),
          messages: [],
        };
        this.threads.set(thread.id, thread);
      }
    }
    if (!thread) throw new ValidationError("messages.send: thread not found", { id: m.threadId });
    if (m.body.trim() === "") throw new ValidationError("messages.send: empty body");
    const at = this.stamp();
    const message: FakeMessage = {
      id: Id.next(),
      direction: "outbound",
      authorType: "staff",
      body: m.body,
      sentAt: at,
      attachments: (m.attachmentIds ?? []).flatMap((id) => {
        const a = this.attachments.get(id);
        return a ? [{ id, filename: a.filename, contentType: a.contentType }] : [];
      }),
    };
    thread.messages.push(message);
    thread.updatedAt = at;
    this.ledger.messagesSent.push({
      threadId: thread.id,
      id: message.id,
      body: m.body,
      dedupeKey: meta.dedupeKey,
    });
    return { id: message.id };
  }
  async uploadAttachment(a: AttachmentUpload, meta: CallMeta): Promise<ProviderRef> {
    this.guard("attachments.upload", meta);
    const id = Id.next();
    this.attachments.set(id, a);
    return { id };
  }
  async closeThread(ref: ProviderRef, _reason: CloseReason, meta: CallMeta): Promise<void> {
    this.guard("threads.close", meta);
    const t = this.threads.get(ref.id);
    if (!t) throw new ValidationError("threads.close: not found", { id: ref.id });
    t.state = "closed";
    t.updatedAt = this.stamp();
  }
  async listReviews(q: ReviewQuery, meta: CallMeta): Promise<ReviewPage> {
    this.guard("reviews.list", meta);
    return {
      reviews: [...this.reviews.values()]
        .filter((r) => r.propertyId === q.propertyId && (!q.since || r.insertedAt >= q.since))
        .map((r) => ({
          id: r.id,
          ...(r.bookingId ? { bookingId: r.bookingId } : {}),
          rating: r.rating,
          text: r.text,
          ota: r.ota,
          insertedAt: r.insertedAt,
          guestName: r.guestName,
          canRespond: true,
          ...(r.response !== undefined ? { response: r.response } : {}),
        })),
    };
  }
  async respondToReview(ref: ProviderRef, body: string, meta: CallMeta): Promise<void> {
    this.guard("reviews.reply", meta);
    const r = this.reviews.get(ref.id);
    if (!r) throw new ValidationError("reviews.reply: not found", { id: ref.id });
    r.response = body;
    this.ledger.reviewResponses.push({ reviewId: ref.id, body });
  }

  private stamp(): string {
    this.clock += 1;
    return this.nowSource ? this.nowSource() : this.now();
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
    if (this.nowSource) return this.nowSource();
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
