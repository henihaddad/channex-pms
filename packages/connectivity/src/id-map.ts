import type {
  AriQuery,
  AriSnapshot,
  AvailabilityBatch,
  BookingRevisionPage,
  BookingRevisionPayload,
  CallMeta,
  ConnectivityProvider,
  ProviderRef,
  PushResult,
  RestrictionBatch,
  RemoteChannel,
  AirbnbConnectionLinkSpec,
} from "@pms/core";

/** Local id ↔ provider id for one property (property.channex_property_id, room_type.channex_room_type_id, rate_plan.channex_rate_plan_id). */
export interface IdMap {
  property: { local: string; remote: string };
  roomTypes: Array<{ local: string; remote: string }>;
  ratePlans: Array<{ local: string; remote: string }>;
}

/**
 * Translates ids on the ARI and reservation surfaces so the domain only ever
 * sees local ids (PROV-2). Unknown ids pass through unchanged: a property that
 * was never provisioned (FakeProvider in tests) keeps identity mapping.
 */
export function withIdMap(inner: ConnectivityProvider, map: IdMap): ConnectivityProvider {
  const toRemote = new Map<string, string>([
    [map.property.local, map.property.remote],
    ...map.roomTypes.map((r) => [r.local, r.remote] as [string, string]),
    ...map.ratePlans.map((r) => [r.local, r.remote] as [string, string]),
  ]);
  const toLocal = new Map<string, string>([...toRemote.entries()].map(([l, r]) => [r, l]));
  const out = (id: string): string => toRemote.get(id) ?? id;
  const back = (id: string): string => toLocal.get(id) ?? id;
  const backRevision = (r: BookingRevisionPayload): BookingRevisionPayload => ({
    ...r,
    propertyId: back(r.propertyId),
    rooms: r.rooms.map((room) => ({
      ...room,
      roomTypeId: room.roomTypeId ? back(room.roomTypeId) : room.roomTypeId,
      ratePlanId: room.ratePlanId ? back(room.ratePlanId) : room.ratePlanId,
    })),
  });
  const translated: Partial<ConnectivityProvider> = {
    pushAvailability(batch: AvailabilityBatch, meta: CallMeta): Promise<PushResult> {
      return inner.pushAvailability(
        {
          propertyId: out(batch.propertyId),
          entries: batch.entries.map((e) => ({ ...e, roomTypeId: out(e.roomTypeId) })),
        },
        meta,
      );
    },
    pushRatesAndRestrictions(batch: RestrictionBatch, meta: CallMeta): Promise<PushResult> {
      return inner.pushRatesAndRestrictions(
        {
          propertyId: out(batch.propertyId),
          entries: batch.entries.map((e) => ({ ...e, ratePlanId: out(e.ratePlanId) })),
        },
        meta,
      );
    },
    async readAri(q: AriQuery, meta: CallMeta): Promise<AriSnapshot> {
      const s = await inner.readAri({ ...q, propertyId: out(q.propertyId) }, meta);
      return {
        availability: s.availability.map((a) => ({ ...a, roomTypeId: back(a.roomTypeId) })),
        restrictions: s.restrictions.map((r) => ({ ...r, ratePlanId: back(r.ratePlanId) })),
      };
    },
    async listBookingRevisions(
      propertyId: string,
      cursor: string | undefined,
      meta: CallMeta,
    ): Promise<BookingRevisionPage> {
      const page = await inner.listBookingRevisions(out(propertyId), cursor, meta);
      return { ...page, revisions: page.revisions.map(backRevision) };
    },
    async getBooking(ref: ProviderRef, meta: CallMeta): Promise<BookingRevisionPayload> {
      return backRevision(await inner.getBooking(ref, meta));
    },
    createChannelSession(propertyId: string, meta: CallMeta): Promise<{ token: string }> {
      return inner.createChannelSession(out(propertyId), meta);
    },
    createAirbnbConnectionLink(
      spec: AirbnbConnectionLinkSpec,
      meta: CallMeta,
    ): Promise<{ url: string }> {
      return inner.createAirbnbConnectionLink(
        { ...spec, propertyIds: spec.propertyIds.map(out) },
        meta,
      );
    },
    mapListing(
      ref: ProviderRef,
      mapping: { ratePlanId: string; listingId: string },
      meta: CallMeta,
    ): Promise<ProviderRef> {
      return inner.mapListing(ref, { ...mapping, ratePlanId: out(mapping.ratePlanId) }, meta);
    },
    async listChannels(propertyId: string, meta: CallMeta): Promise<RemoteChannel[]> {
      const rows = await inner.listChannels(out(propertyId), meta);
      return rows.map((c) => ({
        ...c,
        mappings: c.mappings.map((m) => ({ ...m, ratePlanId: back(m.ratePlanId) })),
      }));
    },
  };
  return new Proxy(inner, {
    get(target, prop, receiver) {
      if (prop in translated) return translated[prop as keyof ConnectivityProvider];
      const v = Reflect.get(target, prop, receiver) as unknown;
      return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(target) : v;
    },
  });
}
