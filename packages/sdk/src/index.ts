/**
 * Channex PMS SDK (Apache-2.0). Hand-written against /api/v1/openapi.json so it
 * has no build-time dependency on the core; regenerate types from the document
 * when the API grows.
 */
export interface ClientOptions {
  baseUrl: string;
  /** Access token from POST /api/v1/auth/login (sent as Bearer) or omit to rely on cookies. */
  token?: string;
  /** Organization to act in; required with a token. */
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
    if (opts.orgId) headers["x-pms-org"] = opts.orgId;
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
    },
    ari: {
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
