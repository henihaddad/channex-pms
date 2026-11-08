/**
 * The portfolio at a glance (spec 03 §3.2a): what a manager reads on the property list and
 * at the top of a property before opening anything — how full it is, what it earns a
 * night, whether the channel manager is in step, and what still needs a human.
 *
 * Persona: the property manager (spec 02 `property_manager`), who runs several listings
 * and wants the one that needs them to say so.
 *
 * Pure arithmetic over counts the repository reads; money stays integer minor units and
 * ratios are basis points, so nothing here rounds a price.
 */

/** Sold nights over sellable nights, in basis points; `null` when nothing was sellable. */
export function occupancyBps(nightsSold: number, nightsAvailable: number): number | null {
  if (!(nightsAvailable > 0)) return null;
  const sold = Math.max(0, Math.min(nightsSold, nightsAvailable));
  return Math.round((sold * 10_000) / nightsAvailable);
}

/** Average daily rate: room revenue per sold night, in minor units; `null` with no nights sold. */
export function averageDailyRateMinor(roomRevenueMinor: number, nightsSold: number): number | null {
  if (!(nightsSold > 0)) return null;
  return Math.round(roomRevenueMinor / nightsSold);
}

/** Why a property needs a human, most urgent first. A booking without a room is the worst. */
export type PropertyAttention =
  | { kind: "unmapped_bookings"; count: number }
  | { kind: "setup_failed"; error: string }
  | { kind: "sync_failed"; cells: number }
  | { kind: "suspended" }
  | null;

export interface PropertyVitalsInput {
  state: string;
  /** Bookings that arrived for a room or rate the property does not know (spec 08 the mapping queue). */
  unmappedBookings: number;
  /** Calendar cells the channel manager refused or that disagree with it. */
  failedCells: number;
  provisioningError: string | null;
}

/**
 * The one thing on a property that needs a human, or `null`. Order matters: a booking
 * with no room loses a guest (rule 7), a failed setup means nothing is sold, a failed
 * push means a channel shows the wrong price or availability.
 */
export function propertyAttention(v: PropertyVitalsInput): PropertyAttention {
  if (v.unmappedBookings > 0) return { kind: "unmapped_bookings", count: v.unmappedBookings };
  if (v.provisioningError && v.state !== "live")
    return { kind: "setup_failed", error: v.provisioningError };
  if (v.failedCells > 0) return { kind: "sync_failed", cells: v.failedCells };
  if (v.state === "suspended") return { kind: "suspended" };
  return null;
}

/** The fewest photos a listing should carry before it reads as complete (Airbnb and Booking.com both ask for five). */
export const MIN_LISTING_PHOTOS = 5;

export interface ContentInput {
  title: string;
  photos: number;
  /** Any locale of the guest guide is published. */
  guidePublished: boolean;
  /** The house-rules section of the guide is written in some locale. */
  houseRulesWritten: boolean;
  /** Both a floor and a ceiling are set for imported prices (spec 06 §6.5b). */
  pricingRailsSet: boolean;
}

export interface ContentMeasure {
  done: number;
  total: number;
  /** Titles of the properties still missing it, in input order. */
  missing: readonly string[];
}

export interface ContentCompleteness {
  photos: ContentMeasure & { fewest: { title: string; photos: number } | null };
  guide: ContentMeasure;
  houseRules: ContentMeasure;
  pricingRails: ContentMeasure;
}

function measure(rows: readonly ContentInput[], ok: (r: ContentInput) => boolean): ContentMeasure {
  const missing = rows.filter((r) => !ok(r)).map((r) => r.title);
  return { done: rows.length - missing.length, total: rows.length, missing };
}

/**
 * How much of the portfolio's guest-facing content is finished: photos, the guide, the
 * house rules and the price guard rails. Guests book more when these are complete, and
 * a missing guide is questions the inbox answers by hand.
 */
export function contentCompleteness(rows: readonly ContentInput[]): ContentCompleteness {
  const short = rows.filter((r) => r.photos < MIN_LISTING_PHOTOS);
  const fewest = short.reduce<ContentInput | null>(
    (a, r) => (a === null || r.photos < a.photos ? r : a),
    null,
  );
  return {
    photos: {
      ...measure(rows, (r) => r.photos >= MIN_LISTING_PHOTOS),
      fewest: fewest ? { title: fewest.title, photos: fewest.photos } : null,
    },
    guide: measure(rows, (r) => r.guidePublished),
    houseRules: measure(rows, (r) => r.houseRulesWritten),
    pricingRails: measure(rows, (r) => r.pricingRailsSet),
  };
}

/** The most amenities a property keeps; Airbnb lists about 150 in all. */
export const MAX_AMENITIES = 200;

/**
 * A property's amenity list as the manager typed it (one per line or comma-separated) or as
 * an import carried it: trimmed, blanks dropped, duplicates removed ignoring case, the first
 * spelling kept, in the order given.
 */
export function normaliseAmenities(input: string | readonly string[]): string[] {
  const parts = typeof input === "string" ? input.split(/[\n,]/) : input;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of parts) {
    const a = String(raw).replace(/\s+/g, " ").trim().slice(0, 80);
    const key = a.toLowerCase();
    if (!a || seen.has(key)) continue;
    seen.add(key);
    out.push(a);
    if (out.length === MAX_AMENITIES) break;
  }
  return out;
}
