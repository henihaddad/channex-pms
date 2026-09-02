import type { AvailabilityEntry, RestrictionEntry } from "../inventory/ari.js";

/** Every provider call carries these (CX-2, CX-3). */
export interface CallMeta {
  dedupeKey: string;
  requestId: string;
}

export interface ProviderRef {
  id: string;
}

export interface GroupSpec {
  title: string;
}

export interface PropertySpec {
  title: string;
  currency: string;
  timezone: string;
  groupId?: string;
  address?: Record<string, string>;
  settings?: Record<string, unknown>;
}

export interface RoomTypeSpec {
  propertyId: string;
  title: string;
  countOfRooms: number;
  occAdults: number;
  occChildren: number;
  occInfants: number;
  defaultOccupancy: number;
}

export interface RatePlanSpec {
  propertyId: string;
  roomTypeId: string;
  title: string;
  currency: string;
  sellMode: "per_room" | "per_person";
  parentRatePlanId?: string;
  options: Array<{ occupancy: number; isPrimary: boolean; rate: number }>;
}

/** Webhook registration (PROV-4): exactly one endpoint per property with the full event mask. */
export interface WebhookSpec {
  propertyId: string;
  callbackUrl: string;
  eventMask: string;
  secret: string;
  sendData: boolean;
}

/** A provider-side property read back for adoption (Q7: adopt an existing Channex property). */
export interface ImportedProperty {
  property: { id: string; title: string; currency: string; timezone: string; groupId?: string };
  roomTypes: Array<{
    id: string;
    title: string;
    countOfRooms: number;
    occAdults: number;
    occChildren: number;
    occInfants: number;
  }>;
  ratePlans: Array<{
    id: string;
    roomTypeId: string;
    title: string;
    currency: string;
    parentRatePlanId: string | null;
  }>;
}

/** One request: entries in FIFO order, for one property. */
export interface AvailabilityBatch {
  propertyId: string;
  entries: AvailabilityEntry[];
}
export interface RestrictionBatch {
  propertyId: string;
  entries: RestrictionEntry[];
}

/** Result of a push. A 200 is not blanket success: rejected entries are itemised (spec 05 §5.10 "partial"). */
export interface PushResult {
  accepted: number;
  rejected: Array<{ index: number; reason: string; field?: string }>;
  warnings: string[];
  taskIds: string[];
}

export interface AriQuery {
  propertyId: string;
  dateFrom: string;
  dateTo: string;
}

export interface AriSnapshot {
  availability: Array<{ roomTypeId: string; date: string; availability: number }>;
  restrictions: Array<{
    ratePlanId: string;
    date: string;
    rate?: number;
    rates?: Record<number, number>;
    minStay?: number;
    minStayArrival?: number;
    minStayThrough?: number;
    maxStay?: number;
    closedToArrival?: boolean;
    closedToDeparture?: boolean;
    stopSell?: boolean;
  }>;
}

/** Channex booking revision, normalised (spec 03 §3.5, spec 05 §5.6). */
export interface BookingRevisionPayload {
  revisionId: string;
  bookingId: string;
  systemId: string;
  propertyId: string;
  status: "new" | "modified" | "cancelled";
  arrivalDate: string;
  departureDate: string;
  currency: string;
  /** Minor units. */
  amount: number;
  otaName: string;
  otaReservationCode: string;
  insertedAt: string;
  rooms: Array<{
    roomTypeId: string | null;
    ratePlanId: string | null;
    checkinDate: string;
    checkoutDate: string;
    /** date → minor units */
    days: Record<string, number>;
    occupancy: { adults: number; children: number; infants: number; ages?: number[] };
    guests: Array<{ name: string; surname: string }>;
    meta?: { parentRatePlanId?: string };
  }>;
  customer: {
    name: string;
    surname: string;
    email?: string;
    phone?: string;
    country?: string;
    language?: string;
  };
  services: Array<{ name: string; amount: number; isInclusive: boolean }>;
  taxes: Array<{ name: string; amount: number; isInclusive: boolean; withheldByOta?: boolean }>;
  otaCommission?: number;
  /** Masked card metadata only, never a PAN (BK-7). */
  guarantee?: { cardType: string; maskedNumber: string; expiry: string; cardholder: string };
  raw: unknown;
}

export interface BookingRevisionPage {
  revisions: BookingRevisionPayload[];
  nextCursor?: string;
}

export interface AdapterDescriptor {
  code: string;
  title: string;
  fields: Array<{
    name: string;
    type: string;
    label: string;
    required: boolean;
    help?: string;
    options?: string[];
  }>;
  capabilities: string[];
}

export interface ConnectionSettings {
  adapterCode: string;
  propertyId: string;
  settings: Record<string, unknown>;
}

export interface TestResult {
  ok: boolean;
  message?: string;
}

export interface MappingOptions {
  rooms: Array<{
    code: string;
    title: string;
    rates: Array<{ code: string; title: string; occupancy?: number }>;
  }>;
}

export interface ChannelSpec extends ConnectionSettings {
  mappings: Array<{ ratePlanId: string; roomCode: string; rateCode: string; occupancy?: number }>;
}

export interface Readiness {
  ready: boolean;
  issues: string[];
}

export interface ThreadQuery {
  propertyId: string;
  updatedSince?: string;
  cursor?: string;
}
export interface ThreadPage {
  threads: Array<{
    id: string;
    bookingId?: string;
    provider: string;
    /** Provider-side last change; drives incremental sync (CXMSG-2). */
    updatedAt?: string;
    guestName?: string;
    guestLanguage?: string;
    /** Airbnb pre-booking inquiries have no booking (CXMSG-6). */
    kind?: "booking" | "inquiry";
    state?: "open" | "closed";
    messages: Array<{
      id: string;
      direction: "inbound" | "outbound";
      /** `system` carries OTA notices such as Airbnb inquiry cards. */
      authorType?: "guest" | "staff" | "system";
      body: string;
      sentAt: string;
      attachments?: Array<{ id: string; filename: string; contentType: string }>;
    }>;
  }>;
  nextCursor?: string;
}
export interface OutboundMessage {
  threadId: string;
  body: string;
  attachmentIds?: string[];
}
export interface AttachmentUpload {
  threadId: string;
  filename: string;
  contentType: string;
  bytes: Uint8Array;
}
export type CloseReason = "resolved" | "no_reply_needed";
export interface ReviewQuery {
  propertyId: string;
  since?: string;
}
export interface ReviewPage {
  reviews: Array<{
    id: string;
    bookingId?: string;
    rating: number;
    text: string;
    ota: string;
    insertedAt: string;
    guestName?: string;
    /** Whether the OTA accepts a response, and ours when one was posted. */
    canRespond?: boolean;
    response?: string;
  }>;
}

/**
 * The connectivity port (spec 04 §4.3). Channex is the reference provider;
 * FakeProvider simulates it, including the failures that matter (CX-1..CX-8).
 */
export interface ConnectivityProvider {
  // provisioning
  ensureGroup(g: GroupSpec, meta: CallMeta): Promise<ProviderRef>;
  ensureProperty(p: PropertySpec, meta: CallMeta): Promise<ProviderRef>;
  ensureRoomType(rt: RoomTypeSpec, meta: CallMeta): Promise<ProviderRef>;
  ensureRatePlan(rp: RatePlanSpec, meta: CallMeta): Promise<ProviderRef>;
  ensureWebhook(w: WebhookSpec, meta: CallMeta): Promise<ProviderRef>;
  importProperty(ref: ProviderRef, meta: CallMeta): Promise<ImportedProperty>;
  // ARI
  pushAvailability(batch: AvailabilityBatch, meta: CallMeta): Promise<PushResult>;
  pushRatesAndRestrictions(batch: RestrictionBatch, meta: CallMeta): Promise<PushResult>;
  readAri(query: AriQuery, meta: CallMeta): Promise<AriSnapshot>;
  // channels
  getAdapterDescriptor(code: string, meta: CallMeta): Promise<AdapterDescriptor>;
  testConnection(s: ConnectionSettings, meta: CallMeta): Promise<TestResult>;
  readChannelMappingOptions(s: ConnectionSettings, meta: CallMeta): Promise<MappingOptions>;
  createChannel(c: ChannelSpec, meta: CallMeta): Promise<ProviderRef>;
  checkReadiness(ref: ProviderRef, meta: CallMeta): Promise<Readiness>;
  setChannelActive(ref: ProviderRef, active: boolean, meta: CallMeta): Promise<void>;
  // reservations
  listBookingRevisions(
    propertyId: string,
    cursor: string | undefined,
    meta: CallMeta,
  ): Promise<BookingRevisionPage>;
  ackBookingRevisions(ids: string[], meta: CallMeta): Promise<void>;
  getBooking(ref: ProviderRef, meta: CallMeta): Promise<BookingRevisionPayload>;
  // messaging + reviews
  listThreads(q: ThreadQuery, meta: CallMeta): Promise<ThreadPage>;
  sendMessage(m: OutboundMessage, meta: CallMeta): Promise<ProviderRef>;
  uploadAttachment(a: AttachmentUpload, meta: CallMeta): Promise<ProviderRef>;
  closeThread(ref: ProviderRef, reason: CloseReason, meta: CallMeta): Promise<void>;
  listReviews(q: ReviewQuery, meta: CallMeta): Promise<ReviewPage>;
  respondToReview(ref: ProviderRef, body: string, meta: CallMeta): Promise<void>;
}
