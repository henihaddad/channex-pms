import {
  AuthError,
  AuthorizationError,
  ContractError,
  Money,
  ThrottleError,
  TransientError,
  ValidationError,
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
  type WebhookSpec,
  type ImportedProperty,
} from "@pms/core";
import type { HttpRequest, HttpResponse, HttpTransport } from "../transport/http.js";

export const CHANNEX_PRODUCTION = "https://app.channex.io";
export const CHANNEX_STAGING = "https://staging.channex.io";

/** The pipeline learns about throttling and outages from these (adaptive limiter, circuit breaker). */
export interface ProviderObserver {
  onResponse?(info: { op: string; status: number; durationMs: number; requestId: string }): void;
}

const PAGE_LIMIT = 100;

/**
 * ChannexProvider: the reference ConnectivityProvider over the documented REST API.
 * Every list call paginates explicitly (default page size is 10; forgetting this
 * silently truncates). Every response is classified per spec 05 §5.10.
 */
export class ChannexProvider implements ConnectivityProvider {
  constructor(
    private readonly http: HttpTransport,
    private readonly observer: ProviderObserver = {},
  ) {}

  // ---- provisioning ------------------------------------------------------------------

  async ensureGroup(g: GroupSpec, meta: CallMeta): Promise<ProviderRef> {
    const existing = await this.findExisting(
      "groups.list",
      "/api/v1/groups",
      {},
      (a) => a.title === g.title,
      meta,
    );
    if (existing) return { id: existing };
    const body = await this.call(
      "groups.create",
      { method: "POST", path: "/api/v1/groups", body: { group: { title: g.title } } },
      meta,
    );
    return { id: idOf(body) };
  }

  async ensureProperty(p: PropertySpec, meta: CallMeta): Promise<ProviderRef> {
    const existing = await this.findExisting(
      "properties.list",
      "/api/v1/properties",
      {},
      (a) => a.title === p.title,
      meta,
    );
    if (existing) return { id: existing };
    const body = await this.call(
      "properties.create",
      {
        method: "POST",
        path: "/api/v1/properties",
        body: {
          property: {
            title: p.title,
            currency: p.currency,
            timezone: p.timezone,
            group_id: p.groupId,
            // Channex keeps the address flat: `address` is the street line (verified on staging)
            ...(p.address?.street !== undefined ? { address: p.address.street } : {}),
            ...(p.address?.city !== undefined ? { city: p.address.city } : {}),
            ...(p.address?.state !== undefined ? { state: p.address.state } : {}),
            ...(p.address?.zipCode !== undefined ? { zip_code: p.address.zipCode } : {}),
            ...(p.address?.country !== undefined ? { country: p.address.country } : {}),
            settings: p.settings,
          },
        },
      },
      meta,
    );
    return { id: idOf(body) };
  }

  async ensureRoomType(rt: RoomTypeSpec, meta: CallMeta): Promise<ProviderRef> {
    const existing = await this.findExisting(
      "room_types.list",
      "/api/v1/room_types",
      { "filter[property_id]": rt.propertyId },
      (a) => a.title === rt.title,
      meta,
    );
    if (existing) return { id: existing };
    const body = await this.call(
      "room_types.create",
      {
        method: "POST",
        path: "/api/v1/room_types",
        body: {
          room_type: {
            property_id: rt.propertyId,
            title: rt.title,
            count_of_rooms: rt.countOfRooms,
            occ_adults: rt.occAdults,
            occ_children: rt.occChildren,
            occ_infants: rt.occInfants,
            default_occupancy: rt.defaultOccupancy,
          },
        },
      },
      meta,
    );
    return { id: idOf(body) };
  }

  async ensureRatePlan(rp: RatePlanSpec, meta: CallMeta): Promise<ProviderRef> {
    const existing = await this.findExisting(
      "rate_plans.list",
      "/api/v1/rate_plans",
      { "filter[property_id]": rp.propertyId },
      (a, item) =>
        a.title === rp.title &&
        String(obj(obj(obj(item.relationships).room_type).data).id ?? a.room_type_id) ===
          rp.roomTypeId,
      meta,
    );
    if (existing) return { id: existing };
    const body = await this.call(
      "rate_plans.create",
      {
        method: "POST",
        path: "/api/v1/rate_plans",
        body: {
          rate_plan: {
            property_id: rp.propertyId,
            room_type_id: rp.roomTypeId,
            title: rp.title,
            currency: rp.currency,
            sell_mode: rp.sellMode,
            rate_mode: "manual",
            parent_rate_plan_id: rp.parentRatePlanId ?? null,
            options: rp.options.map((o) => ({
              occupancy: o.occupancy,
              is_primary: o.isPrimary,
              rate: o.rate,
            })),
          },
        },
      },
      meta,
    );
    return { id: idOf(body) };
  }

  async ensureWebhook(w: WebhookSpec, meta: CallMeta): Promise<ProviderRef> {
    const existing = await this.findExisting(
      "webhooks.list",
      "/api/v1/webhooks",
      { "filter[property_id]": w.propertyId },
      (a) => a.callback_url === w.callbackUrl,
      meta,
    );
    if (existing) return { id: existing };
    const body = await this.call(
      "webhooks.create",
      {
        method: "POST",
        path: "/api/v1/webhooks",
        body: {
          webhook: {
            property_id: w.propertyId,
            callback_url: w.callbackUrl,
            event_mask: w.eventMask,
            request_params: {},
            headers: { "x-channex-webhook-secret": w.secret },
            is_active: true,
            send_data: w.sendData,
          },
        },
      },
      meta,
    );
    return { id: idOf(body) };
  }

  /** Q7: read a property with its room types and rate plans, paginated explicitly. */
  async importProperty(ref: ProviderRef, meta: CallMeta): Promise<ImportedProperty> {
    const p = await this.call(
      "properties.get",
      { method: "GET", path: `/api/v1/properties/${ref.id}` },
      meta,
    );
    const pa = obj(obj(obj(p).data).attributes);
    const rels = obj(obj(obj(p).data).relationships);
    const groupId = obj(obj(obj(rels.groups).data ?? {})).id;
    const roomTypes = (
      await this.listAll("room_types.list", "/api/v1/room_types", ref.id, meta)
    ).map((r) => {
      const a = obj(obj(r).attributes);
      return {
        id: String(obj(r).id),
        title: String(a.title),
        countOfRooms: Number(a.count_of_rooms ?? 1),
        occAdults: Number(a.occ_adults ?? 2),
        occChildren: Number(a.occ_children ?? 0),
        occInfants: Number(a.occ_infants ?? 0),
      };
    });
    const ratePlans = (
      await this.listAll("rate_plans.list", "/api/v1/rate_plans", ref.id, meta)
    ).map((r) => {
      const a = obj(obj(r).attributes);
      const rl = obj(obj(r).relationships);
      return {
        id: String(obj(r).id),
        roomTypeId: String(obj(obj(rl.room_type).data).id ?? a.room_type_id),
        title: String(a.title),
        currency: String(a.currency),
        parentRatePlanId: a.parent_rate_plan_id ? String(a.parent_rate_plan_id) : null,
      };
    });
    return {
      property: {
        id: ref.id,
        title: String(pa.title),
        currency: String(pa.currency),
        timezone: String(pa.timezone),
        ...(groupId ? { groupId: String(groupId) } : {}),
      },
      roomTypes,
      ratePlans,
    };
  }

  /**
   * PROV-3: reconcile by natural key before creating, so a retried provisioning
   * step never duplicates a Channex-side row. Lists are paginated explicitly.
   */
  private async findExisting(
    op: string,
    path: string,
    query: Record<string, string>,
    match: (attrs: Record<string, unknown>, item: Record<string, unknown>) => boolean,
    meta: CallMeta,
  ): Promise<string | null> {
    for (let page = 1; page < 50; page++) {
      const body = await this.call(
        op,
        {
          method: "GET",
          path,
          query: {
            ...query,
            "pagination[page]": String(page),
            "pagination[limit]": String(PAGE_LIMIT),
          },
        },
        meta,
      );
      const data = arr(obj(body).data);
      for (const item of data) {
        const o = obj(item);
        if (match(obj(o.attributes), o)) return String(o.id);
      }
      const total = Number(obj(obj(body).meta).total ?? data.length);
      if (page * PAGE_LIMIT >= total || data.length === 0) break;
    }
    return null;
  }

  private async listAll(
    op: string,
    path: string,
    propertyId: string,
    meta: CallMeta,
  ): Promise<unknown[]> {
    const out: unknown[] = [];
    for (let page = 1; ; page++) {
      const body = await this.call(
        op,
        {
          method: "GET",
          path,
          query: {
            "filter[property_id]": propertyId,
            "pagination[page]": String(page),
            "pagination[limit]": String(PAGE_LIMIT),
          },
        },
        meta,
      );
      const data = arr(obj(body).data);
      out.push(...data);
      const total = Number(obj(obj(body).meta).total ?? data.length);
      if (page * PAGE_LIMIT >= total || data.length === 0) break;
    }
    return out;
  }

  // ---- ARI ---------------------------------------------------------------------------

  async pushAvailability(batch: AvailabilityBatch, meta: CallMeta): Promise<PushResult> {
    const values = batch.entries.map((e) => ({
      property_id: batch.propertyId,
      room_type_id: e.roomTypeId,
      date_from: e.dateFrom,
      date_to: e.dateTo,
      ...(e.days ? { days: e.days } : {}),
      availability: e.availability,
    }));
    const body = await this.call(
      "availability.push",
      { method: "POST", path: "/api/v1/availability", body: { values } },
      meta,
    );
    return pushResult(body, values.length);
  }

  async pushRatesAndRestrictions(batch: RestrictionBatch, meta: CallMeta): Promise<PushResult> {
    const values = batch.entries.map((e) => ({
      property_id: batch.propertyId,
      rate_plan_id: e.ratePlanId,
      date_from: e.dateFrom,
      date_to: e.dateTo,
      ...(e.days ? { days: e.days } : {}),
      ...(e.rate !== undefined ? { rate: e.rate } : {}),
      ...(e.rates !== undefined
        ? {
            rates: Object.entries(e.rates).map(([occ, rate]) => ({ occupancy: Number(occ), rate })),
          }
        : {}),
      // Channex properties default to min_stay_type "both": a plain `min_stay` is refused
      // ("please use min_stay_through or min_stay_arrival", verified on staging), so the
      // canonical minStay is sent as both unless the caller sets them separately.
      ...(e.minStayArrival !== undefined
        ? { min_stay_arrival: e.minStayArrival }
        : e.minStay !== undefined
          ? { min_stay_arrival: e.minStay }
          : {}),
      ...(e.minStayThrough !== undefined
        ? { min_stay_through: e.minStayThrough }
        : e.minStay !== undefined
          ? { min_stay_through: e.minStay }
          : {}),
      ...(e.maxStay !== undefined ? { max_stay: e.maxStay } : {}),
      ...(e.closedToArrival !== undefined ? { closed_to_arrival: e.closedToArrival } : {}),
      ...(e.closedToDeparture !== undefined ? { closed_to_departure: e.closedToDeparture } : {}),
      ...(e.stopSell !== undefined ? { stop_sell: e.stopSell } : {}),
    }));
    const body = await this.call(
      "restrictions.push",
      { method: "POST", path: "/api/v1/restrictions", body: { values } },
      meta,
    );
    return pushResult(body, values.length);
  }

  async readAri(q: AriQuery, meta: CallMeta): Promise<AriSnapshot> {
    const filter = {
      "filter[property_id]": q.propertyId,
      "filter[date][gte]": q.dateFrom,
      "filter[date][lte]": q.dateTo,
    };
    const avail = await this.call(
      "availability.read",
      { method: "GET", path: "/api/v1/availability", query: filter },
      meta,
    );
    const restr = await this.call(
      "restrictions.read",
      {
        method: "GET",
        path: "/api/v1/restrictions",
        query: {
          ...filter,
          "filter[restrictions]":
            "rate,min_stay,min_stay_arrival,min_stay_through,max_stay,closed_to_arrival,closed_to_departure,stop_sell",
        },
      },
      meta,
    );
    return parseAriSnapshot(avail, restr);
  }

  // ---- channels ----------------------------------------------------------------------

  async getAdapterDescriptor(code: string, meta: CallMeta): Promise<AdapterDescriptor> {
    const body = await this.call(
      "channels.adapter",
      { method: "GET", path: "/api/v1/channels/adapter", query: { code } },
      meta,
    );
    // Verified on staging: data.params is an object keyed by field name with position/type/title/default/rules.
    const data = obj(obj(body).data);
    const params = obj(data.params);
    const fields = Object.entries(params)
      .map(([name, raw]) => ({ name, def: obj(raw) }))
      .filter(({ def }) => def.type !== "hidden")
      .sort((a, b) => Number(a.def.position ?? 0) - Number(b.def.position ?? 0))
      .map(({ name, def }) => ({
        name,
        type: String(def.type ?? "string"),
        label: String(def.title ?? name),
        required: def.default === undefined && def.type !== "boolean",
        ...(typeof def.description === "string" ? { help: def.description } : {}),
        ...(Array.isArray(def.options) ? { options: def.options.map(String) } : {}),
      }));
    const capabilities = [
      "rates",
      "availability",
      "restrictions",
      ...(data.message_support === true ? ["messaging"] : []),
      ...(typeof data.mapping_mode === "string" ? [`mapping:${data.mapping_mode}`] : []),
      ...arr(data.actions).map((a) => `action:${String(a)}`),
    ];
    return { code, title: String(data.title ?? code), fields, capabilities };
  }

  async testConnection(s: ConnectionSettings, meta: CallMeta): Promise<TestResult> {
    try {
      const body = await this.call(
        "channels.test_connection",
        {
          method: "POST",
          path: "/api/v1/channels/test_connection",
          body: { channel: s.adapterCode, settings: s.settings },
        },
        meta,
      );
      return { ok: true, message: String(obj(obj(body).meta).message ?? "ok") };
    } catch (e) {
      if (e instanceof ValidationError || e instanceof AuthorizationError)
        return { ok: false, message: e.message };
      throw e;
    }
  }

  async readChannelMappingOptions(s: ConnectionSettings, meta: CallMeta): Promise<MappingOptions> {
    const body = await this.call(
      "channels.mapping_details",
      {
        method: "POST",
        path: "/api/v1/channels/mapping_details",
        body: { channel: s.adapterCode, settings: s.settings },
      },
      meta,
    );
    const rooms = arr(obj(obj(body).data).rooms).map((r) => {
      const o = obj(r);
      return {
        code: String(o.id ?? o.code),
        title: String(o.title),
        rates: arr(o.rates).map((x) => {
          const y = obj(x);
          return {
            code: String(y.id ?? y.code),
            title: String(y.title),
            ...(y.occupancy !== undefined ? { occupancy: Number(y.occupancy) } : {}),
          };
        }),
      };
    });
    return { rooms };
  }

  async createChannel(c: ChannelSpec, meta: CallMeta): Promise<ProviderRef> {
    const body = await this.call(
      "channels.create",
      {
        method: "POST",
        path: "/api/v1/channels",
        body: {
          channel: {
            channel: c.adapterCode,
            properties: [c.propertyId],
            settings: c.settings,
            mappings: c.mappings.map((m) => ({
              rate_plan_id: m.ratePlanId,
              settings: {
                room_type_code: m.roomCode,
                rate_plan_code: m.rateCode,
                occupancy: m.occupancy,
              },
            })),
          },
        },
      },
      meta,
    );
    return { id: idOf(body) };
  }

  async checkReadiness(ref: ProviderRef, meta: CallMeta): Promise<Readiness> {
    const body = await this.call(
      "channels.get",
      { method: "GET", path: `/api/v1/channels/${ref.id}` },
      meta,
    );
    const attrs = obj(obj(obj(body).data).attributes);
    const issues = arr(attrs.readiness_issues ?? obj(attrs.readiness).issues).map(String);
    return { ready: issues.length === 0 && attrs.is_active !== false, issues };
  }

  async setChannelActive(ref: ProviderRef, active: boolean, meta: CallMeta): Promise<void> {
    await this.call(
      active ? "channels.activate" : "channels.deactivate",
      { method: "POST", path: `/api/v1/channels/${ref.id}/${active ? "activate" : "deactivate"}` },
      meta,
    );
  }

  // ---- reservations ------------------------------------------------------------------

  async listBookingRevisions(
    propertyId: string,
    cursor: string | undefined,
    meta: CallMeta,
  ): Promise<BookingRevisionPage> {
    const page = cursor ? Number(cursor) : 1;
    const body = await this.call(
      "booking_revisions.feed",
      {
        method: "GET",
        path: "/api/v1/booking_revisions/feed",
        query: {
          "filter[property_id]": propertyId,
          "pagination[page]": String(page),
          "pagination[limit]": String(PAGE_LIMIT),
          "order[inserted_at]": "asc",
        },
      },
      meta,
    );
    const data = arr(obj(body).data);
    const revisions = data.map((d) => parseRevision(obj(d)));
    const metaObj = obj(obj(body).meta);
    const total = Number(metaObj.total ?? revisions.length);
    const hasMore = page * PAGE_LIMIT < total;
    return { revisions, ...(hasMore ? { nextCursor: String(page + 1) } : {}) };
  }

  async ackBookingRevisions(ids: string[], meta: CallMeta): Promise<void> {
    for (const id of ids)
      await this.call(
        "booking_revisions.ack",
        { method: "POST", path: `/api/v1/booking_revisions/${id}/ack` },
        { ...meta, dedupeKey: `${meta.dedupeKey}:${id}` },
      );
  }

  async getBooking(ref: ProviderRef, meta: CallMeta): Promise<BookingRevisionPayload> {
    const body = await this.call(
      "bookings.get",
      { method: "GET", path: `/api/v1/bookings/${ref.id}` },
      meta,
    );
    return parseRevision(obj(obj(body).data));
  }

  // ---- messaging + reviews -----------------------------------------------------------

  async listThreads(q: ThreadQuery, meta: CallMeta): Promise<ThreadPage> {
    const page = q.cursor ? Number(q.cursor) : 1;
    const body = await this.call(
      "message_threads.list",
      {
        method: "GET",
        path: "/api/v1/message_threads",
        query: {
          "filter[property_id]": q.propertyId,
          ...(q.updatedSince ? { "filter[updated_at][gte]": q.updatedSince } : {}),
          "pagination[page]": String(page),
          "pagination[limit]": String(PAGE_LIMIT),
        },
      },
      meta,
    );
    const threads = arr(obj(body).data).map((t) => {
      const a = obj(obj(t).attributes);
      return {
        id: String(obj(t).id),
        ...(a.booking_id ? { bookingId: String(a.booking_id) } : {}),
        provider: String(a.provider ?? a.ota ?? "unknown"),
        messages: arr(a.messages).map((m) => {
          const o = obj(m);
          return {
            id: String(o.id),
            direction: o.sender === "guest" ? ("inbound" as const) : ("outbound" as const),
            body: String(o.message ?? o.body ?? ""),
            sentAt: String(o.inserted_at ?? ""),
          };
        }),
      };
    });
    const total = Number(obj(obj(body).meta).total ?? threads.length);
    return { threads, ...(page * PAGE_LIMIT < total ? { nextCursor: String(page + 1) } : {}) };
  }

  async sendMessage(m: OutboundMessage, meta: CallMeta): Promise<ProviderRef> {
    const body = await this.call(
      "messages.send",
      {
        method: "POST",
        path: `/api/v1/message_threads/${m.threadId}/messages`,
        body: { message: { message: m.body, attachments: m.attachmentIds ?? [] } },
      },
      meta,
    );
    return { id: idOf(body) };
  }

  async uploadAttachment(a: AttachmentUpload, meta: CallMeta): Promise<ProviderRef> {
    const body = await this.call(
      "attachments.upload",
      {
        method: "POST",
        path: `/api/v1/message_threads/${a.threadId}/attachments`,
        body: {
          attachment: {
            filename: a.filename,
            content_type: a.contentType,
            data: Buffer.from(a.bytes).toString("base64"),
          },
        },
      },
      meta,
    );
    return { id: idOf(body) };
  }

  async closeThread(ref: ProviderRef, reason: CloseReason, meta: CallMeta): Promise<void> {
    await this.call(
      "message_threads.close",
      { method: "POST", path: `/api/v1/message_threads/${ref.id}/close`, body: { reason } },
      meta,
    );
  }

  async listReviews(q: ReviewQuery, meta: CallMeta): Promise<ReviewPage> {
    const body = await this.call(
      "reviews.list",
      {
        method: "GET",
        path: "/api/v1/reviews",
        query: {
          "filter[property_id]": q.propertyId,
          ...(q.since ? { "filter[inserted_at][gte]": q.since } : {}),
          "pagination[limit]": String(PAGE_LIMIT),
          "pagination[page]": "1",
        },
      },
      meta,
    );
    return {
      reviews: arr(obj(body).data).map((r) => {
        const a = obj(obj(r).attributes);
        return {
          id: String(obj(r).id),
          ...(a.booking_id ? { bookingId: String(a.booking_id) } : {}),
          rating: Number(a.overall_score ?? a.rating ?? 0),
          text: String(a.content ?? a.text ?? ""),
          ota: String(a.ota ?? ""),
          insertedAt: String(a.inserted_at ?? ""),
        };
      }),
    };
  }

  async respondToReview(ref: ProviderRef, body: string, meta: CallMeta): Promise<void> {
    await this.call(
      "reviews.reply",
      { method: "POST", path: `/api/v1/reviews/${ref.id}/reply`, body: { reply: body } },
      meta,
    );
  }

  // ---- plumbing ----------------------------------------------------------------------

  private async call(op: string, req: HttpRequest, meta: CallMeta): Promise<unknown> {
    const started = Date.now();
    let res: HttpResponse;
    try {
      res = await this.http.request({
        ...req,
        headers: {
          ...req.headers,
          "x-request-id": meta.requestId,
          "idempotency-key": meta.dedupeKey,
        },
      });
    } catch (e) {
      this.observer.onResponse?.({
        op,
        status: 0,
        durationMs: Date.now() - started,
        requestId: meta.requestId,
      });
      throw new TransientError(`${op}: ${e instanceof Error ? e.message : String(e)}`, { op });
    }
    this.observer.onResponse?.({
      op,
      status: res.status,
      durationMs: Date.now() - started,
      requestId: meta.requestId,
    });
    return classify(op, res);
  }
}

/** Map HTTP outcomes to the taxonomy (spec 05 §5.10). 2xx returns the body. */
export function classify(op: string, res: HttpResponse): unknown {
  if (res.status >= 200 && res.status < 300) return res.body;
  const errors = obj(obj(res.body).errors);
  const detail = String(errors.title ?? errors.code ?? `HTTP ${String(res.status)}`);
  switch (res.status) {
    case 401:
      throw new AuthError();
    case 403:
      throw new AuthorizationError(detail, { op, details: errors.details });
    case 400:
    case 404:
    case 422:
      throw new ValidationError(`${op}: ${detail}`, {
        op,
        status: res.status,
        details: errors.details,
      });
    case 429: {
      const ra = Number(res.headers["retry-after"] ?? res.headers["Retry-After"]);
      throw new ThrottleError(Number.isFinite(ra) && ra > 0 ? ra * 1000 : undefined);
    }
    default:
      if (res.status >= 500)
        throw new TransientError(`${op}: HTTP ${String(res.status)}`, { op, status: res.status });
      throw new ContractError(`${op}: unexpected HTTP ${String(res.status)}`, {
        op,
        status: res.status,
        body: res.body,
      });
  }
}

/** A 200 is not blanket success: per-entry warnings become rejections (spec 05 §5.10 "partial"). */
function pushResult(body: unknown, sent: number): PushResult {
  const metaObj = obj(obj(body).meta);
  const warnings = arr(metaObj.warnings);
  const rejected: PushResult["rejected"] = [];
  const textWarnings: string[] = [];
  warnings.forEach((w, i) => {
    const o = obj(w);
    const warning = obj(o.warning);
    const fields = Object.keys(warning);
    const index = typeof o.index === "number" ? o.index : i;
    if (fields.length > 0)
      rejected.push({
        index,
        reason: fields.map((f) => `${f}: ${arr(warning[f]).map(String).join(", ")}`).join("; "),
        field: fields[0]!,
      });
    else textWarnings.push(typeof w === "string" ? w : JSON.stringify(w));
  });
  const taskIds = arr(obj(body).data).map((d) => String(obj(d).id));
  return {
    accepted: Math.max(0, sent - rejected.length),
    rejected,
    warnings: textWarnings,
    taskIds,
  };
}

function parseAriSnapshot(avail: unknown, restr: unknown): AriSnapshot {
  const availability: AriSnapshot["availability"] = [];
  for (const [roomTypeId, byDate] of Object.entries(obj(obj(avail).data))) {
    for (const [date, v] of Object.entries(obj(byDate)))
      availability.push({ roomTypeId, date, availability: Number(v) });
  }
  const restrictions: AriSnapshot["restrictions"] = [];
  for (const [ratePlanId, byDate] of Object.entries(obj(obj(restr).data))) {
    for (const [date, v] of Object.entries(obj(byDate))) {
      const o = obj(v);
      restrictions.push({
        ratePlanId,
        date,
        ...(o.rate !== undefined ? { rate: minorFromWire(o.rate) } : {}),
        // canonical minStay: the explicit field, else arrival and through when they agree
        ...(o.min_stay !== undefined
          ? { minStay: Number(o.min_stay) }
          : o.min_stay_arrival !== undefined && o.min_stay_arrival === o.min_stay_through
            ? { minStay: Number(o.min_stay_arrival) }
            : {}),
        ...(o.min_stay_arrival !== undefined ? { minStayArrival: Number(o.min_stay_arrival) } : {}),
        ...(o.min_stay_through !== undefined ? { minStayThrough: Number(o.min_stay_through) } : {}),
        ...(o.max_stay !== undefined ? { maxStay: Number(o.max_stay) } : {}),
        ...(o.closed_to_arrival !== undefined
          ? { closedToArrival: Boolean(o.closed_to_arrival) }
          : {}),
        ...(o.closed_to_departure !== undefined
          ? { closedToDeparture: Boolean(o.closed_to_departure) }
          : {}),
        ...(o.stop_sell !== undefined ? { stopSell: Boolean(o.stop_sell) } : {}),
      });
    }
  }
  return { availability, restrictions };
}

/** Channex sends amounts as decimal strings ("200.00"); integers are already minor units. */
function minorFromWire(v: unknown, currency = "EUR"): number {
  if (typeof v === "number")
    return Number.isInteger(v)
      ? v
      : Money.parse(v.toFixed(Money.exponent(currency)), currency).minor;
  return Money.parse(String(v), currency).minor;
}

export function parseRevision(d: Record<string, unknown>): BookingRevisionPayload {
  const a = obj(d.attributes);
  const currency = String(a.currency ?? "EUR");
  const money = (v: unknown): number =>
    v === undefined || v === null ? 0 : minorFromWire(v, currency);
  const customer = obj(a.customer);
  const guarantee = a.guarantee ? obj(a.guarantee) : null;
  const status = String(a.status);
  if (status !== "new" && status !== "modified" && status !== "cancelled")
    throw new ContractError(`unknown booking status ${status}`, { status });
  return {
    revisionId: String(a.id ?? d.id),
    bookingId: String(a.booking_id),
    systemId: String(a.system_id ?? a.unique_id ?? d.id),
    propertyId: String(a.property_id),
    status,
    arrivalDate: String(a.arrival_date),
    departureDate: String(a.departure_date),
    currency,
    amount: money(a.amount),
    otaName: String(a.ota_name ?? ""),
    otaReservationCode: String(a.ota_reservation_code ?? a.unique_id ?? ""),
    insertedAt: String(a.inserted_at ?? ""),
    rooms: arr(a.rooms).map((r) => {
      const o = obj(r);
      const occ = obj(o.occupancy);
      return {
        roomTypeId: o.room_type_id ? String(o.room_type_id) : null,
        ratePlanId: o.rate_plan_id ? String(o.rate_plan_id) : null,
        checkinDate: String(o.checkin_date),
        checkoutDate: String(o.checkout_date),
        days: Object.fromEntries(Object.entries(obj(o.days)).map(([k, v]) => [k, money(v)])),
        occupancy: {
          adults: Number(occ.adults ?? 1),
          children: Number(occ.children ?? 0),
          infants: Number(occ.infants ?? 0),
          ...(Array.isArray(occ.ages) ? { ages: occ.ages.map(Number) } : {}),
        },
        guests: arr(o.guests).map((g) => ({
          name: String(obj(g).name ?? ""),
          surname: String(obj(g).surname ?? ""),
        })),
        ...(obj(o.meta).parent_rate_plan_id
          ? { meta: { parentRatePlanId: String(obj(o.meta).parent_rate_plan_id) } }
          : {}),
      };
    }),
    customer: {
      name: String(customer.name ?? ""),
      surname: String(customer.surname ?? ""),
      ...(customer.mail ? { email: String(customer.mail) } : {}),
      ...(customer.phone ? { phone: String(customer.phone) } : {}),
      ...(customer.country ? { country: String(customer.country) } : {}),
      ...(customer.language ? { language: String(customer.language) } : {}),
    },
    services: arr(a.services).map((s) => {
      const o = obj(s);
      return {
        name: String(o.name ?? o.type ?? ""),
        amount: money(o.total_price ?? o.amount),
        isInclusive: Boolean(o.is_inclusive),
      };
    }),
    taxes: arr(a.taxes).map((t) => {
      const o = obj(t);
      return {
        name: String(o.name ?? ""),
        amount: money(o.total_price ?? o.amount),
        isInclusive: Boolean(o.is_inclusive),
        ...(o.withheld_by_ota !== undefined ? { withheldByOta: Boolean(o.withheld_by_ota) } : {}),
      };
    }),
    ...(a.ota_commission !== undefined && a.ota_commission !== null
      ? { otaCommission: money(a.ota_commission) }
      : {}),
    ...(guarantee
      ? {
          guarantee: {
            cardType: String(guarantee.card_type ?? ""),
            maskedNumber: maskPan(String(guarantee.card_number ?? "")),
            expiry: String(guarantee.expiration_date ?? ""),
            cardholder: String(guarantee.cardholder_name ?? ""),
          },
        }
      : {}),
    raw: d,
  };
}

/** BK-7 / INV-7: keep only first six and last four; an already-masked value passes through; anything short becomes asterisks. */
export function maskPan(input: string): string {
  if (input.includes("*")) return input;
  const digits = input.replace(/\D/g, "");
  if (digits.length < 13) return input.replace(/\d/g, "*");
  return `${digits.slice(0, 6)}${"*".repeat(digits.length - 10)}${digits.slice(-4)}`;
}

function idOf(body: unknown): string {
  const data = obj(obj(body).data);
  const id = data.id ?? obj(data.attributes).id;
  if (typeof id !== "string") throw new ContractError("response without an id", { body });
  return id;
}

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
