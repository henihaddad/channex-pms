/**
 * Channex PMS SDK (Apache-2.0). Hand-written against /api/v1/openapi.json so it
 * has no build-time dependency on the core; regenerate types from the document
 * when the API grows.
 */
export interface ClientOptions {
  baseUrl: string;
  /**
   * An API key (`otab_…`, Settings → API & AI) or an access token from POST /api/v1/auth/login,
   * sent as Bearer. Omit to rely on cookies.
   */
  token?: string;
  /** Organization to act in; required with an access token, ignored with an API key (the key carries it). */
  orgId?: string;
  fetch?: typeof fetch;
}

export interface Problem {
  type?: string;
  title?: string;
  status: number;
  detail?: string;
  missing?: string;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly problem: Problem,
  ) {
    super(problem.detail ?? problem.title ?? `HTTP ${String(status)}`);
    this.name = "ApiError";
  }
}

export type PropertyKind = "single_unit" | "multi_unit" | "hotel";
export interface PropertyInput {
  title: string;
  kind: PropertyKind;
  currency: string;
  timezone: string;
  address?: Record<string, string>;
  groupIds?: string[];
  roomTypes?: Array<{
    title: string;
    countOfRooms: number;
    occAdults: number;
    occChildren?: number;
  }>;
  ratePlans?: Array<{
    title: string;
    roomTypeTitle?: string;
    baseRateMinor: number;
    minStay?: number;
  }>;
}
export interface PropertySummary {
  id: string;
  title: string;
  kind: PropertyKind;
  state: string;
  currency: string;
  timezone: string;
  channexPropertyId: string | null;
  roomTypes: number;
  ratePlans: number;
  units: number;
  provisioningStep: string | null;
}
export interface RestrictionValues {
  rate?: number;
  minStay?: number | null;
  minStayArrival?: number | null;
  minStayThrough?: number | null;
  maxStay?: number | null;
  closedToArrival?: boolean;
  closedToDeparture?: boolean;
  stopSell?: boolean;
}
export type SyncState = "pending" | "in_flight" | "synced" | "failed" | "conflicted";
export type RateCell = [date: string, values: RestrictionValues, state: SyncState, version: number];
export type AvailabilityCell = [date: string, available: number, state: SyncState, version: number];
export interface Grid {
  from: string;
  to: string;
  properties: Array<{
    id: string;
    title: string;
    kind: PropertyKind;
    currency: string;
    state: string;
    groups: string[];
    roomTypes: Array<{
      id: string;
      title: string;
      countOfRooms: number;
      isSystemManaged: boolean;
      cells: AvailabilityCell[];
      ratePlans: Array<{
        id: string;
        title: string;
        parentRatePlanId: string | null;
        cells: RateCell[];
      }>;
    }>;
  }>;
}
export interface CellEdit<V = RestrictionValues> {
  ratePlanId: string;
  date: string;
  values: V;
  expectedVersion?: number;
}
export interface EditResult {
  undoId: string | null;
  outcomes: Array<{
    ok: boolean;
    ratePlanId: string;
    date: string;
    version?: number;
    reason?: "conflict" | "missing";
    current?: { values: RestrictionValues; version: number };
  }>;
}
export type BulkOp =
  | { op: "set_rate"; rateMinor: number }
  | {
      op: "adjust_rate_percent";
      basisPoints: number;
      rounding?: "nearest" | "up" | "down";
      roundToMinor?: number;
    }
  | { op: "adjust_rate_amount"; deltaMinor: number }
  | { op: "set_min_stay"; minStay: number | null }
  | { op: "set_max_stay"; maxStay: number | null }
  | { op: "set_cta"; closed: boolean }
  | { op: "set_ctd"; closed: boolean }
  | { op: "stop_sell"; stop: boolean };
export interface BulkRequest {
  propertyId: string;
  dateFrom: string;
  dateTo: string;
  days?: Array<"mo" | "tu" | "we" | "th" | "fr" | "sa" | "su">;
  ratePlanIds: string[];
  ops: BulkOp[];
  horizonEnd: string;
  override?: boolean;
  dryRun?: boolean;
}
export interface BulkResult {
  applied: boolean;
  id: string | null;
  cellCount: number;
  warnings: string[];
  blocked: string[];
}

/** A range of nights, both ends included (YYYY-MM-DD). */
export interface NightRange {
  propertyId: string;
  /** Omit for every base rate plan of the property. */
  ratePlanIds?: string[];
  firstNight: string;
  lastNight: string;
}
export interface NightsResult {
  applied: boolean;
  propertyId: string;
  ratePlanIds: string[];
  firstNight: string;
  lastNight: string;
  cells: number;
  undoId: string | null;
}
export interface Calendar {
  firstNight: string;
  lastNight: string;
  properties: Array<{
    id: string;
    title: string;
    currency: string;
    roomTypes: Array<{
      id: string;
      title: string;
      available: Record<string, number>;
      ratePlans: Array<{
        id: string;
        title: string;
        derivedFrom: string | null;
        nights: Array<{
          date: string;
          priceMinor: number | null;
          minStay?: number;
          maxStay?: number;
          stopSell: boolean;
          closedToArrival?: boolean;
          closedToDeparture?: boolean;
          sync: SyncState;
        }>;
      }>;
    }>;
  }>;
}
export interface InventoryProperty {
  id: string;
  title: string;
  kind: PropertyKind;
  state: string;
  currency: string;
  timezone: string;
  city: string | null;
  channels: string[];
  roomTypes: Array<{
    id: string;
    title: string;
    units: number;
    ratePlans: Array<{ id: string; title: string; derivedFrom: string | null }>;
  }>;
}
export interface ReservationSummary {
  id: string;
  code: string | null;
  propertyId: string;
  property: string;
  channel: string | null;
  status: string;
  arrival: string;
  departure: string;
  nights: number;
  guest: string;
  adults: number;
  children: number;
  currency: string;
  totalMinor: number;
  balanceMinor: number;
  unit: string | null;
}
export interface ReservationQuery {
  view?: string;
  propertyId?: string;
  dateType?: "arrival" | "departure" | "stay" | "booked";
  from?: string;
  to?: string;
  status?: "new" | "modified" | "cancelled" | "active";
  q?: string;
  limit?: number;
  offset?: number;
}
export interface DirectReservationInput {
  propertyId: string;
  roomTypeId: string;
  ratePlanId: string;
  /** First night. */
  arrivalDate: string;
  /** Check-out day. */
  departureDate: string;
  adults: number;
  children?: number;
  /** First name and surname. */
  guestName: string;
  email?: string;
  phone?: string;
  language?: string;
  /** Overrides the rate plan's price, minor units. */
  totalMinor?: number;
  note?: string;
}
export interface ConversationSummary {
  id: string;
  propertyId: string;
  property: string;
  channel: string;
  guest: string;
  language: string | null;
  kind: "booking" | "inquiry";
  state: string;
  unread: number;
  lastMessage: string;
  lastMessageAt: string | null;
  replyDueAt: string | null;
  reservationId: string | null;
  arrival: string | null;
  departure: string | null;
}
export interface Conversation {
  id: string;
  propertyId: string;
  property: string;
  channel: string;
  guest: string;
  language: string | null;
  state: string;
  reservation: Record<string, unknown> | null;
  messages: Array<{
    id: string;
    at: string;
    from: "guest" | "staff" | "automation" | "system" | "note";
    author: string | null;
    text: string;
    delivery?: string;
  }>;
}
export interface Review {
  id: string;
  propertyId: string;
  property: string;
  channel: string;
  /** Out of 10. */
  rating: number;
  guest: string;
  text: string;
  receivedAt: string;
  canReply: boolean;
  replyDueAt: string | null;
  reply: { body: string; deliveryState: string; sentAt: string | null } | null;
  reservationId: string | null;
}
export interface Today {
  today: string;
  arrivals: Array<{
    reservationId: string;
    guest: string;
    property: string;
    channel: string | null;
    nights: number;
    unit: string | null;
  }>;
  departures: Today["arrivals"];
  inHouse: number;
  needsYou: {
    conversationsWaiting: number;
    conversationsPastDue: number;
    reservationsChanged: number;
    reservationsUnmapped: number;
    nightsRefusedByChannel: number;
  };
}

export function createClient(opts: ClientOptions) {
  const f = opts.fetch ?? fetch;
  async function call<T>(
    method: string,
    path: string,
    body?: unknown,
    query?: Record<string, string | string[] | undefined>,
  ): Promise<T> {
    const url = new URL(path, opts.baseUrl);
    for (const [k, v] of Object.entries(query ?? {})) {
      if (v === undefined) continue;
      for (const x of Array.isArray(v) ? v : [v]) url.searchParams.append(k, x);
    }
    const headers: Record<string, string> = { accept: "application/json" };
    if (body !== undefined) headers["content-type"] = "application/json";
    if (opts.token) headers.authorization = `Bearer ${opts.token}`;
    if (opts.orgId && !opts.token?.startsWith("otab_")) headers["x-pms-org"] = opts.orgId;
    const res = await f(url, {
      method,
      headers,
      credentials: "include",
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await res.text();
    const data = text ? (JSON.parse(text) as unknown) : null;
    if (!res.ok && res.status !== 409)
      throw new ApiError(res.status, (data as Problem | null) ?? { status: res.status });
    return data as T;
  }
  return {
    properties: {
      list: () => call<PropertySummary[]>("GET", "/api/v1/properties"),
      create: (input: PropertyInput) => call<PropertySummary>("POST", "/api/v1/properties", input),
      /** Every property with its room types and rate plans: the ids the other calls take. */
      inventory: () => call<InventoryProperty[]>("GET", "/api/v1/properties/inventory"),
    },
    today: () => call<Today>("GET", "/api/v1/today"),
    reservations: {
      list: (q: ReservationQuery = {}) =>
        call<{ today: string; total: number; reservations: ReservationSummary[] }>(
          "GET",
          "/api/v1/reservations",
          undefined,
          Object.fromEntries(
            Object.entries(q).map(([k, v]) => [k, v === undefined ? undefined : String(v)]),
          ),
        ),
      get: (id: string) => call<Record<string, unknown>>("GET", `/api/v1/reservations/${id}`),
      create: (input: DirectReservationInput) =>
        call<{ reservationId: string; status: string }>("POST", "/api/v1/reservations", input),
      cancel: (id: string, propertyId: string) =>
        call<{ reservationId: string; status: string; cancellationFeeMinor: number }>(
          "POST",
          `/api/v1/reservations/${id}/cancel`,
          { propertyId },
        ),
    },
    conversations: {
      list: (q: { filter?: string; propertyId?: string; q?: string; limit?: number } = {}) =>
        call<{ filter: string; total: number; conversations: ConversationSummary[] }>(
          "GET",
          "/api/v1/conversations",
          undefined,
          Object.fromEntries(
            Object.entries(q).map(([k, v]) => [k, v === undefined ? undefined : String(v)]),
          ),
        ),
      get: (id: string) => call<Conversation>("GET", `/api/v1/conversations/${id}`),
      /** Sent to the guest through the channel they wrote on, or by email for a direct booking. */
      send: (id: string, propertyId: string, text: string) =>
        call<{ messageId: string; delivery: string }>(
          "POST",
          `/api/v1/conversations/${id}/messages`,
          { propertyId, text },
        ),
      note: (id: string, propertyId: string, text: string) =>
        call<{ noteId: string }>("POST", `/api/v1/conversations/${id}/notes`, { propertyId, text }),
    },
    reviews: {
      list: (q: { filter?: "all" | "needs_reply"; propertyId?: string; maxRating?: number } = {}) =>
        call<{ total: number; reviews: Review[] }>(
          "GET",
          "/api/v1/reviews",
          undefined,
          Object.fromEntries(
            Object.entries(q).map(([k, v]) => [k, v === undefined ? undefined : String(v)]),
          ),
        ),
      reply: (id: string, propertyId: string, text: string) =>
        call<{ responseId: string; delivery: string }>("POST", `/api/v1/reviews/${id}/reply`, {
          propertyId,
          text,
        }),
    },
    channels: { list: () => call<Array<Record<string, unknown>>>("GET", "/api/v1/channels") },
    syncHealth: () => call<Record<string, unknown>>("GET", "/api/v1/sync-health"),
    ari: {
      /** Night by night, both ends included, at most 62 nights. */
      calendar: (q: { propertyId?: string; firstNight: string; lastNight: string }) =>
        call<Calendar>("GET", "/api/v1/ari/calendar", undefined, q),
      /** The nightly price, in minor units, on every connected channel. */
      setPrices: (input: NightRange & { priceMinor: number }) =>
        call<NightsResult>("PUT", "/api/v1/ari/prices", input),
      /** Open (sell) or close (stop-sell) nights on every connected channel. */
      setAvailability: (input: NightRange & { open: boolean }) =>
        call<NightsResult>("PUT", "/api/v1/ari/availability", input),
      setMinStay: (input: NightRange & { minStay: number }) =>
        call<NightsResult>("PUT", "/api/v1/ari/min-stay", input),
      grid: (q: { from: string; to: string; propertyIds?: string[]; groupId?: string }) =>
        call<Grid>("GET", "/api/v1/ari/grid", undefined, {
          from: q.from,
          to: q.to,
          propertyId: q.propertyIds,
          groupId: q.groupId,
        }),
      editRates: (input: { propertyId: string; edits: Array<CellEdit<{ rate: number }>> }) =>
        call<EditResult>("PATCH", "/api/v1/ari/rates", input),
      editRestrictions: (input: {
        propertyId: string;
        edits: Array<CellEdit<Omit<RestrictionValues, "rate">>>;
      }) => call<EditResult>("PATCH", "/api/v1/ari/restrictions", input),
      bulk: (input: BulkRequest) => call<BulkResult>("POST", "/api/v1/ari/bulk", input),
      undo: (operationId: string, propertyId: string) =>
        call<{ cellCount: number; redoId: string }>(
          "POST",
          `/api/v1/ari/bulk/${operationId}/undo`,
          undefined,
          { propertyId },
        ),
    },
    openapi: () => call<Record<string, unknown>>("GET", "/api/v1/openapi.json"),
  };
}

export type Client = ReturnType<typeof createClient>;

export {
  signPluginDelivery,
  verifyPluginDelivery,
  type PluginEvent,
  type PluginManifest,
  type PluginDeliveryHeaders,
} from "./plugins.js";
