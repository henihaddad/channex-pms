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
  type RemoteChannel,
  type AirbnbConnectionLinkSpec,
  type RemoteListing,
  type RemoteListingCalendar,
  type RemoteListingDetails,
  type GuestReview,
  type LiveFeedEvent,
  type LiveFeedPage,
  type LiveFeedQuery,
  type LiveFeedResolution,
} from "@pms/core";
import type { HttpRequest, HttpResponse, HttpTransport } from "../transport/http.js";

export const CHANNEX_PRODUCTION = "https://app.channex.io";
export const CHANNEX_STAGING = "https://staging.channex.io";

/**
 * The URL of Channex's embedded channel screen for a one-time token
 * (docs: Channel IFrame). Headless mode shows only that property's channels.
 */
export function channexChannelScreenUrl(
  base: string,
  token: string,
  propertyId: string,
  opts: { language?: string; channels?: string[] } = {},
): string {
  const q = new URLSearchParams({
    oauth_session_key: token,
    app_mode: "headless",
    redirect_to: "/channels",
    property_id: propertyId,
  });
  if (opts.language) q.set("lng", opts.language);
  if (opts.channels?.length) q.set("channels", opts.channels.join(","));
  return `${base}/auth/exchange?${q.toString()}`;
}

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
    const groupId = groupIdOf(rels);
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
    // Channex creates a channel inactive and activation is our call (CH-4): `is_active` is
    // reported on its own rather than folded into `ready`, otherwise a fresh channel could
    // never pass the readiness check that precedes its activation.
    return {
      ready: issues.length === 0,
      issues,
      ...(attrs.is_active === false ? { inactive: true } : {}),
    };
  }

  async setChannelActive(ref: ProviderRef, active: boolean, meta: CallMeta): Promise<void> {
    await this.call(
      active ? "channels.activate" : "channels.deactivate",
      { method: "POST", path: `/api/v1/channels/${ref.id}/${active ? "activate" : "deactivate"}` },
      meta,
    );
  }
  async createChannelSession(propertyId: string, meta: CallMeta): Promise<{ token: string }> {
    const body = await this.call(
      "auth.one_time_token",
      {
        method: "POST",
        path: "/api/v1/auth/one_time_token",
        body: { one_time_token: { property_id: propertyId } },
      },
      meta,
    );
    const token = obj(obj(body).data).token;
    if (typeof token !== "string")
      throw new ContractError("one_time_token without a token", { body });
    return { token };
  }

  async listChannels(propertyId: string, meta: CallMeta): Promise<RemoteChannel[]> {
    const rows = await this.listAll("channels.list", "/api/v1/channels", propertyId, meta);
    return rows.map((raw) => {
      const r = obj(raw);
      const a = obj(r.attributes);
      const status = String(a.status ?? "unknown");
      return {
        id: String(r.id),
        adapterCode: String(a.channel ?? ""),
        title: String(a.title ?? a.channel ?? ""),
        isActive: a.is_active === true,
        status: (["active", "pending", "temporal_error", "permanent_error"].includes(status)
          ? status
          : "unknown") as RemoteChannel["status"],
        mappings: (Array.isArray(a.rate_plans) ? a.rate_plans : []).map((m) => {
          const mm = obj(m);
          const st = obj(mm.settings);
          return {
            ...(typeof mm.id === "string" ? { id: mm.id } : {}),
            ratePlanId: String(mm.rate_plan_id ?? ""),
            ...(typeof st.room_type_code === "string" ? { roomCode: st.room_type_code } : {}),
            ...(typeof st.rate_plan_code === "string" ? { rateCode: st.rate_plan_code } : {}),
            ...(typeof st.occupancy === "number" ? { occupancy: st.occupancy } : {}),
            ...(st.listing_id !== undefined ? { listingId: String(st.listing_id) } : {}),
          };
        }),
      };
    });
  }
  async createAirbnbConnectionLink(
    spec: AirbnbConnectionLinkSpec,
    meta: CallMeta,
  ): Promise<{ url: string }> {
    // Channex requires the group; a property carries it under relationships.groups.
    let groupId = spec.groupId;
    if (!groupId) {
      const first = spec.propertyIds[0];
      if (!first) throw new ContractError("connection link needs at least one property", {});
      const prop = await this.call(
        "properties.get",
        { method: "GET", path: `/api/v1/properties/${first}` },
        meta,
      );
      const g = groupIdOf(obj(obj(obj(prop).data).relationships));
      if (typeof g !== "string")
        throw new ContractError("property without a group; cannot build the Airbnb link", {
          body: prop,
        });
      groupId = g;
    }
    const body = await this.call(
      "airbnb.connection_link",
      {
        method: "POST",
        path: "/api/v1/meta/airbnb/connection_link",
        body: {
          connection_link: {
            group_id: groupId,
            properties: spec.propertyIds,
            redirect_uri: spec.redirectUri,
            failure_redirect_uri: spec.failureRedirectUri,
            token: spec.token,
            title: spec.title,
            ...(spec.channelId ? { channel_id: spec.channelId } : {}),
            settings: {
              min_stay_type: "Arrival",
              booking_amount_settings: "Payout Amount",
              ...spec.settings,
            },
          },
        },
      },
      meta,
    );
    const url = obj(obj(obj(body).data).attributes).url;
    if (typeof url !== "string") throw new ContractError("connection_link without a url", { body });
    return { url };
  }

  async listChannelListings(ref: ProviderRef, meta: CallMeta): Promise<RemoteListing[]> {
    const body = await this.call(
      "airbnb.listings",
      { method: "GET", path: `/api/v1/channels/${ref.id}/action/listings` },
      meta,
    );
    const values = arr(obj(obj(obj(body).data).listing_id_dictionary).values);
    return values.map((raw) => {
      const v = obj(raw);
      return {
        id: String(v.id),
        title: String(v.title ?? v.id),
        ...(typeof v.type === "string" ? { type: v.type } : {}),
        ...(typeof v.city === "string" ? { city: v.city } : {}),
        ...(typeof v.country_code === "string" ? { countryCode: v.country_code } : {}),
        ...(Array.isArray(v.occupancies) ? { occupancies: v.occupancies.map(Number) } : {}),
        ...(typeof v.quality_status === "string" ? { qualityStatus: v.quality_status } : {}),
      };
    });
  }

  async getChannelListingDetails(
    ref: ProviderRef,
    listingId: string,
    meta: CallMeta,
  ): Promise<RemoteListingDetails> {
    const body = await this.call(
      "airbnb.listing_details",
      {
        method: "GET",
        path: `/api/v1/channels/${ref.id}/action/listing_details`,
        query: { listing_id: listingId },
      },
      meta,
    );
    const listing = obj(obj(obj(body).data).listing);
    const descriptions = obj(listing.descriptions);
    const photos = arr(listing.images)
      .map((i) => {
        const o = obj(i);
        const u = o.url ?? o.large ?? o.xl_picture_url ?? o.picture_url ?? o.image_url;
        return typeof u === "string" ? u : null;
      })
      .filter((u): u is string => u !== null);
    const amenities = arr(listing.amenities ?? listing.amenity_categories)
      .map((a) => (typeof a === "string" ? a : String(obj(a).name ?? obj(a).id ?? "")))
      .filter(Boolean);
    const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
    const capacity = num(listing.person_capacity);
    const bedrooms = num(listing.bedrooms);
    return {
      id: String(listing.id ?? listingId),
      title: String(descriptions.name ?? listing.name ?? listing.title ?? listingId),
      ...(typeof descriptions.summary === "string" ? { summary: descriptions.summary } : {}),
      ...(typeof listing.city === "string" ? { city: listing.city } : {}),
      ...(typeof listing.country_code === "string" ? { countryCode: listing.country_code } : {}),
      ...(capacity !== undefined ? { capacity } : {}),
      ...(bedrooms !== undefined ? { bedrooms } : {}),

      photos,
      amenities,
    };
  }

  async getChannelListingCalendar(
    ref: ProviderRef,
    listingId: string,
    range: { from: string; to: string },
    meta: CallMeta,
  ): Promise<RemoteListingCalendar> {
    const body = await this.call(
      "airbnb.listing_calendar",
      {
        method: "GET",
        path: `/api/v1/channels/${ref.id}/action/get_listing_calendar`,
        query: { listing_id: listingId, date_from: range.from, date_to: range.to },
      },
      meta,
    );
    const data = obj(obj(body).data);
    const cal = obj(data.calendar ?? data);
    return {
      currency: String(cal.listing_currency ?? ""),
      days: arr(cal.days).map((d) => {
        const o = obj(d);
        return {
          date: String(o.date),
          available: o.availability === "available" || o.availability === true,
          price: typeof o.daily_price === "number" ? o.daily_price : null,
          ...(typeof o.min_nights === "number" ? { minNights: o.min_nights } : {}),
          ...(typeof o.max_nights === "number" ? { maxNights: o.max_nights } : {}),
          ...(typeof o.closed_to_arrival === "boolean"
            ? { closedToArrival: o.closed_to_arrival }
            : {}),
          ...(typeof o.closed_to_departure === "boolean"
            ? { closedToDeparture: o.closed_to_departure }
            : {}),
        };
      }),
    };
  }

  async mapListing(
    ref: ProviderRef,
    mapping: { ratePlanId: string; listingId: string },
    meta: CallMeta,
  ): Promise<ProviderRef> {
    const body = await this.call(
      "airbnb.mapping.create",
      {
        method: "POST",
        path: `/api/v1/channels/${ref.id}/mappings`,
        body: {
          mapping: {
            rate_plan_id: mapping.ratePlanId,
            settings: { listing_id: mapping.listingId },
          },
        },
      },
      meta,
    );
    return { id: idOf(body) };
  }

  async removeMapping(ref: ProviderRef, mappingId: string, meta: CallMeta): Promise<void> {
    await this.call(
      "channels.mapping.delete",
      { method: "DELETE", path: `/api/v1/channels/${ref.id}/mappings/${mappingId}` },
      meta,
    );
  }

  async loadFutureReservations(
    ref: ProviderRef,
    meta: CallMeta,
    listingId?: string,
  ): Promise<void> {
    await this.call(
      "airbnb.load_future_reservations",
      {
        method: "POST",
        path: `/api/v1/channels/${ref.id}/execute/load_future_reservations`,
        body: listingId ? { listing_id: listingId } : {},
      },
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
    const threads = [];
    for (const t of arr(obj(body).data)) {
      const a = obj(obj(t).attributes);
      const guest = obj(a.guest);
      const id = String(obj(t).id);
      // the thread carries only its last message; the conversation is its own collection
      const inline = arr(a.messages);
      const messages = inline.length
        ? inline.map(parseMessage)
        : await this.threadMessages(id, meta);
      // the booking is a relationship of the thread (docs: Messages Collection); an inquiry has none
      const bookingId =
        relationshipId(t, "booking") ?? (a.booking_id ? String(a.booking_id) : undefined);
      threads.push({
        id,
        ...(bookingId ? { bookingId } : {}),
        provider: String(a.provider ?? a.ota ?? "unknown"),
        ...(a.updated_at ? { updatedAt: String(a.updated_at) } : {}),
        // Channex titles an Airbnb thread with the guest's name
        ...(guest.name || a.guest_name || a.title
          ? { guestName: String(guest.name ?? a.guest_name ?? a.title) }
          : {}),
        ...(guest.language ? { guestLanguage: String(guest.language) } : {}),
        kind: bookingId ? ("booking" as const) : ("inquiry" as const),
        state: a.is_closed === true ? ("closed" as const) : ("open" as const),
        messages,
      });
    }
    const total = Number(obj(obj(body).meta).total ?? threads.length);
    return { threads, ...(page * PAGE_LIMIT < total ? { nextCursor: String(page + 1) } : {}) };
  }

  /** Every message of one thread, oldest first (the API answers newest first, paginated). */
  private async threadMessages(
    threadId: string,
    meta: CallMeta,
  ): Promise<ThreadPage["threads"][number]["messages"]> {
    const out: ThreadPage["threads"][number]["messages"] = [];
    for (let page = 1; ; page += 1) {
      const body = await this.call(
        "messages.list",
        {
          method: "GET",
          path: `/api/v1/message_threads/${threadId}/messages`,
          query: { "pagination[page]": String(page), "pagination[limit]": String(PAGE_LIMIT) },
        },
        { ...meta, dedupeKey: `${meta.dedupeKey}:m${String(page)}` },
      );
      const data = arr(obj(body).data);
      out.push(...data.map(parseMessage));
      const total = Number(obj(obj(body).meta).total ?? out.length);
      if (page * PAGE_LIMIT >= total || data.length === 0) break;
    }
    return out.sort((x, y) => (x.sentAt < y.sentAt ? -1 : x.sentAt > y.sentAt ? 1 : 0));
  }

  async sendMessage(m: OutboundMessage, meta: CallMeta): Promise<ProviderRef> {
    // `booking:<id>` writes to a booking that has no thread yet (an automation writing first)
    const path = m.threadId.startsWith("booking:")
      ? `/api/v1/bookings/${m.threadId.slice("booking:".length)}/messages`
      : `/api/v1/message_threads/${m.threadId}/messages`;
    // Channex takes either text or one attachment per message, never both: with a `message`
    // field present the attachment is ignored (docs: Messages Collection › Send attachment)
    const bodies: Array<Record<string, string>> = [];
    if (m.body.trim() !== "") bodies.push({ message: m.body });
    for (const id of m.attachmentIds ?? []) bodies.push({ attachment_id: id });
    if (bodies.length === 0) throw new ValidationError("messages.send: nothing to send");
    let last: unknown;
    for (const [i, message] of bodies.entries()) {
      last = await this.call(
        "messages.send",
        { method: "POST", path, body: { message } },
        i === 0 ? meta : { ...meta, dedupeKey: `${meta.dedupeKey}:${String(i)}` },
      );
    }
    return { id: idOf(last) };
  }

  /** `POST /attachments`: the file goes up first and is then sent as a message of its own. */
  async uploadAttachment(a: AttachmentUpload, meta: CallMeta): Promise<ProviderRef> {
    const body = await this.call(
      "attachments.upload",
      {
        method: "POST",
        path: "/api/v1/attachments",
        body: {
          attachment: {
            file: Buffer.from(a.bytes).toString("base64"),
            file_name: a.filename,
            file_type: a.contentType,
          },
        },
      },
      meta,
    );
    return { id: idOf(body) };
  }

  /**
   * Two different calls: `close` ends the conversation; `no_reply_needed` (Booking.com only)
   * keeps it open and tells Booking.com not to count it against the response time.
   */
  async closeThread(ref: ProviderRef, reason: CloseReason, meta: CallMeta): Promise<void> {
    const action = reason === "no_reply_needed" ? "no_reply_needed" : "close";
    await this.call(
      `message_threads.${action}`,
      { method: "POST", path: `/api/v1/message_threads/${ref.id}/${action}` },
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
        const bookingId = relationshipId(r, "booking");
        const expiresAt = a.expired_at ? String(a.expired_at) : undefined;
        // the reply window as the OTA reports it; its date is judged against our clock downstream
        const expired = a.is_expired === true;
        return {
          id: String(obj(r).id),
          ...(bookingId ? { bookingId } : {}),
          ...(a.ota_reservation_id ? { otaReservationCode: String(a.ota_reservation_id) } : {}),
          rating: Number(a.overall_score ?? a.rating ?? 0),
          text: String(a.content ?? a.text ?? ""),
          ota: String(a.ota ?? ""),
          // `inserted_at` is when Channex took the review in (our sync cursor); `received_at`
          // is when the guest wrote it, which is the date a host wants to see
          insertedAt: String(a.inserted_at ?? ""),
          receivedAt: String(a.received_at ?? a.inserted_at ?? ""),
          ...(a.guest_name ? { guestName: String(a.guest_name) } : {}),
          canRespond: a.is_replied !== true && a.can_reply !== false && !expired,
          ...(expiresAt ? { replyExpiresAt: expiresAt } : {}),
          // Airbnb keeps a review hidden until the host has reviewed the guest
          hidden: a.is_hidden === true,
          ...(a.reply ? { response: String(a.reply) } : {}),
        };
      }),
    };
  }

  async respondToReview(ref: ProviderRef, body: string, meta: CallMeta): Promise<void> {
    await this.call(
      "reviews.reply",
      // docs: Reviews Collection › Reply to Review
      { method: "POST", path: `/api/v1/reviews/${ref.id}/reply`, body: { reply: { reply: body } } },
      meta,
    );
  }

  async reviewGuest(ref: ProviderRef, r: GuestReview, meta: CallMeta): Promise<void> {
    await this.call(
      "reviews.guest_review",
      // docs: Reviews Collection › Send Guest Review (Airbnb only)
      {
        method: "POST",
        path: `/api/v1/reviews/${ref.id}/guest_review`,
        body: {
          review: {
            scores: r.scores.map((x) => ({ category: x.category, rating: x.rating })),
            public_review: r.publicReview,
            private_review: r.privateReview ?? "",
            is_reviewee_recommended: r.isRecommended,
            tags: r.tags ?? [],
          },
        },
      },
      meta,
    );
  }

  // ---- Airbnb booking requests (docs: Airbnb API › Booking Requests) --------------------

  async listLiveFeed(q: LiveFeedQuery, meta: CallMeta): Promise<LiveFeedPage> {
    const page = q.cursor ? Number(q.cursor) : 1;
    const body = await this.call(
      "live_feed.list",
      {
        method: "GET",
        path: "/api/v1/live_feed",
        query: {
          "filter[property_id]": q.propertyId,
          ...(q.since ? { "filter[inserted_at][gte]": q.since } : {}),
          "pagination[page]": String(page),
          "pagination[limit]": String(PAGE_LIMIT),
        },
      },
      meta,
    );
    // the feed carries every event kind (messages, reviews, requests); only requests are ours here
    const events = arr(obj(body).data)
      .map(parseLiveFeedEvent)
      .filter((e): e is LiveFeedEvent => e !== null);
    const total = Number(obj(obj(body).meta).total ?? 0);
    return { events, ...(page * PAGE_LIMIT < total ? { nextCursor: String(page + 1) } : {}) };
  }

  async resolveLiveFeedEvent(
    ref: ProviderRef,
    r: LiveFeedResolution,
    meta: CallMeta,
  ): Promise<LiveFeedEvent> {
    // one endpoint, three payload shapes: a boolean for reservation requests, a string for
    // alterations, `type` for inquiries (docs: Airbnb API › Answering a request)
    const resolution: Record<string, unknown> =
      r.kind === "reservation_request"
        ? r.accept
          ? { accept: true }
          : {
              accept: false,
              reason: r.reason ?? "not_comfortable",
              ...(r.messageToGuest ? { decline_message_to_guest: r.messageToGuest } : {}),
              ...(r.messageToAirbnb ? { decline_message_to_airbnb: r.messageToAirbnb } : {}),
            }
        : r.kind === "inquiry"
          ? r.type === "preapproval"
            ? { type: "preapproval", block_instant_booking: r.blockInstantBooking ?? false }
            : { type: "special_offer", total_price: r.totalPrice }
          : { accept: r.accept };
    const body = await this.call(
      "live_feed.resolve",
      { method: "POST", path: `/api/v1/live_feed/${ref.id}/resolve`, body: { resolution } },
      meta,
    );
    const event = parseLiveFeedEvent(obj(body).data);
    if (!event) throw new ContractError("live_feed.resolve: response without an event", { body });
    return event;
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

/** The property's group: docs show `groups: { data: { id } }`, staging answers a bare array of groups. */
function groupIdOf(rels: Record<string, unknown>): unknown {
  const groups = rels.groups;
  if (Array.isArray(groups)) return obj(groups[0]).id;
  const data = obj(groups).data;
  return Array.isArray(data) ? obj(data[0]).id : obj(data).id;
}

function idOf(body: unknown): string {
  const data = obj(obj(body).data);
  const id = data.id ?? obj(data.attributes).id;
  if (typeof id !== "string") throw new ContractError("response without an id", { body });
  return id;
}

/** One message as Channex returns it, from a thread's collection or inlined on the thread. */
function parseMessage(m: unknown): ThreadPage["threads"][number]["messages"][number] {
  const o = obj(m);
  const a = obj(o.attributes);
  const f = Object.keys(a).length ? a : o;
  const sender = String(f.sender ?? "guest");
  return {
    id: String(o.id),
    direction: sender === "guest" ? ("inbound" as const) : ("outbound" as const),
    authorType:
      sender === "guest"
        ? ("guest" as const)
        : sender === "system"
          ? ("system" as const)
          : ("staff" as const),
    body: String(f.message ?? f.body ?? ""),
    sentAt: String(f.inserted_at ?? ""),
    ...(arr(f.attachments).length
      ? {
          attachments: arr(f.attachments).map((x) => ({
            id: String(obj(x).id),
            filename: String(obj(x).filename ?? ""),
            contentType: String(obj(x).content_type ?? "application/octet-stream"),
          })),
        }
      : {}),
  };
}

const REQUEST_KINDS = new Set(["inquiry", "reservation_request", "alteration_request"]);

/**
 * A live feed event as a booking request, or null for the other kinds. Inquiries carry
 * `booking_details`; reservation and alteration requests carry the stay as `bms`, a booking
 * revision (docs: Airbnb API › Event payload).
 */
function parseLiveFeedEvent(e: unknown): LiveFeedEvent | null {
  const o = obj(e);
  const a = obj(o.attributes);
  const kind = String(a.event ?? "");
  if (!REQUEST_KINDS.has(kind)) return null;
  const p = obj(a.payload);
  const bd = obj(p.booking_details);
  const bms = obj(obj(p.bms).attributes ?? p.bms);
  const occupancy = obj(bms.occupancy);
  const customer = obj(bms.customer);
  const num = (v: unknown): number | undefined =>
    v === undefined || v === null || v === "" || Number.isNaN(Number(v)) ? undefined : Number(v);
  const str = (v: unknown): string | undefined =>
    v === undefined || v === null || v === "" ? undefined : String(v);
  const details: LiveFeedEvent["details"] = {};
  const checkIn = str(bd.checkin_date ?? bms.arrival_date);
  if (checkIn !== undefined) details.checkIn = checkIn;
  const checkOut = str(bd.checkout_date ?? bms.departure_date);
  if (checkOut !== undefined) details.checkOut = checkOut;
  const nights = num(bd.nights);
  if (nights !== undefined) details.nights = nights;
  const adults = num(bd.number_of_adults ?? occupancy.adults);
  if (adults !== undefined) details.adults = adults;
  const children = num(bd.number_of_children ?? occupancy.children);
  if (children !== undefined) details.children = children;
  const infants = num(bd.number_of_infants ?? occupancy.infants);
  if (infants !== undefined) details.infants = infants;
  const pets = num(bd.number_of_pets);
  if (pets !== undefined) details.pets = pets;
  const guests =
    num(bd.number_of_guests) ?? (adults === undefined ? undefined : adults + (children ?? 0));
  if (guests !== undefined) details.guests = guests;
  const currency = str(bd.currency ?? bms.currency);
  if (currency !== undefined) details.currency = currency;
  const payout = str(bd.payout_amount ?? bd.expected_payout_amount_accurate ?? bms.amount);
  if (payout !== undefined) details.payoutText = payout;
  const guestName =
    str(bd.guest_name) ?? str([customer.name, customer.surname].filter(Boolean).join(" "));
  if (guestName !== undefined) details.guestName = guestName;
  const listingId = str(bd.listing_id);
  if (listingId !== undefined) details.listingId = listingId;
  const listingName = str(bd.listing_name);
  if (listingName !== undefined) details.listingName = listingName;
  const roomTypeId = str(bd.room_type_id);
  if (roomTypeId !== undefined) details.roomTypeId = roomTypeId;
  const respondBy = str(bd.non_response_at);
  if (respondBy !== undefined) details.respondBy = respondBy;
  const event: LiveFeedEvent = {
    id: String(o.id),
    kind: kind as LiveFeedEvent["kind"],
    insertedAt: String(a.inserted_at ?? ""),
    resolved: p.resolved === true,
    details,
  };
  const threadId = str(p.message_thread_id);
  if (threadId !== undefined) event.threadId = threadId;
  const bookingId = str(bms.booking_id) ?? str(p.booking_id) ?? relationshipId(e, "booking");
  if (bookingId !== undefined) event.bookingId = bookingId;
  const status = str(p.status);
  if (status !== undefined) event.status = status;
  if (p.resolution !== undefined && p.resolution !== null)
    event.resolution =
      typeof p.resolution === "string" ? p.resolution : JSON.stringify(p.resolution);
  return event;
}

/** The id under `relationships.<name>.data`, where Channex links a resource to another. */
function relationshipId(resource: unknown, name: string): string | undefined {
  const data = obj(obj(obj(obj(resource).relationships)[name]).data);
  return data.id !== undefined && data.id !== null ? String(data.id) : undefined;
}

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
