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

/** What the provider needs to start Airbnb's authorisation on our behalf (Channex: connection link). */
export interface AirbnbConnectionLinkSpec {
  propertyIds: string[];
  groupId?: string;
  /** Where Airbnb sends the host back on success; the provider appends `channel_id` and our `token`. */
  redirectUri: string;
  failureRedirectUri: string;
  /** Our opaque token, echoed back so the callback can bind the result to the session. */
  token: string;
  title: string;
  /** Re-authorise an existing connection instead of creating one. */
  channelId?: string;
  settings?: Record<string, unknown>;
}

/** An Airbnb listing as the connected host account exposes it through the provider. */
export interface RemoteListing {
  id: string;
  title: string;
  type?: string;
  city?: string;
  countryCode?: string;
  occupancies?: number[];
  qualityStatus?: string;
}

/** A channel connection as the provider holds it, for mirroring connections made in the provider's own UI. */
export interface RemoteChannel {
  id: string;
  adapterCode: string;
  title: string;
  isActive: boolean;
  status: "active" | "pending" | "temporal_error" | "permanent_error" | "unknown";
  /** Provider-side rate plan ids the connection maps, with the channel's codes where known. */
  mappings: Array<{
    /** The mapping's own id on the provider, needed to remove it. */
    id?: string;
    ratePlanId: string;
    roomCode?: string;
    rateCode?: string;
    occupancy?: number;
    /** Airbnb: the listing this mapping sells. */
    listingId?: string;
  }>;
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
  /**
   * A short-lived session for the provider's own channel screen, embedded for
   * the channels only the provider can connect (Airbnb's OAuth lives there).
   */
  createChannelSession(propertyId: string, meta: CallMeta): Promise<{ token: string }>;
  /** The connections the provider holds for a property, to mirror those made in its own UI. */
  listChannels(propertyId: string, meta: CallMeta): Promise<RemoteChannel[]>;
  /** Airbnb's OAuth URL for the host to authorise the provider (CH-5); the connection exists, inactive, when they return. */
  createAirbnbConnectionLink(
    spec: AirbnbConnectionLinkSpec,
    meta: CallMeta,
  ): Promise<{ url: string }>;
  /** The listings of the Airbnb account behind a connection. */
  listChannelListings(ref: ProviderRef, meta: CallMeta): Promise<RemoteListing[]>;
  /** Map one listing to one rate plan on an Airbnb connection (asynchronous on the provider side). */
  mapListing(
    ref: ProviderRef,
    mapping: { ratePlanId: string; listingId: string },
    meta: CallMeta,
  ): Promise<ProviderRef>;
  /** Remove one rate plan mapping from a connection (Airbnb: un-map a listing). */
  removeMapping(ref: ProviderRef, mappingId: string, meta: CallMeta): Promise<void>;
  /**
   * Import the account's future reservations after activation, without guest notifications.
   * Per listing when one is given (the provider's preferred form), else every mapped listing.
   */
  loadFutureReservations(ref: ProviderRef, meta: CallMeta, listingId?: string): Promise<void>;
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
