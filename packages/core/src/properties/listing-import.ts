/**
 * The Airbnb import preview (spec 07 CH-5, design "Import from Airbnb"): every field the
 * import would write, what Airbnb holds now beside what OTAbridge holds, and what the
 * property will hold after — before anything is written. The manager unticks what they
 * want to keep; only ticked fields are written.
 *
 * Persona: the property manager moving an existing Airbnb listing over (spec 02
 * `property_manager`), who has seen other tools overwrite good content on import.
 *
 * Pure: the action reads the listing and the property, this decides, the action writes.
 */

/** One night of the listing's calendar, prices already in minor units. */
export interface ImportNight {
  date: string;
  available: boolean;
  priceMinor: number | null;
  minNights?: number;
}

/** What Airbnb reports for the listing. Absent optional fields could not be read. */
export interface ListingSnapshot {
  title: string;
  city?: string;
  countryCode?: string;
  bedrooms?: number;
  capacity?: number;
  summary?: string;
  amenities: readonly string[];
  photos: readonly string[];
  currency: string;
  nights: readonly ImportNight[];
}

/** What the property holds today, or `null` when the import creates a new property. */
export interface LocalSnapshot {
  title: string;
  city?: string;
  country?: string;
  bedrooms?: number;
  sleeps?: number;
  summary?: string;
  amenities: readonly string[];
  photos: readonly string[];
  currency: string;
  /** The base plan's nights over the same horizon. */
  nights: readonly ImportNight[];
}

export type ImportFieldKey =
  | "title"
  | "city"
  | "country"
  | "bedrooms"
  | "sleeps"
  | "summary"
  | "amenities"
  | "photos"
  | "prices"
  | "minStay"
  | "ratePlan"
  | "bookings";

export type ImportValue =
  | { kind: "text"; value: string }
  | { kind: "number"; value: number }
  | { kind: "count"; value: number }
  | {
      kind: "prices";
      medianMinor: number;
      weekendMinor: number | null;
      nights: number;
      currency: string;
    }
  | { kind: "nights"; value: number }
  | { kind: "plan"; title: string }
  | { kind: "onActivation"; blockedNights: number };

/**
 * `same`: nothing changes. `change`: the property's value is replaced. `add`: the property
 * has nothing there yet. `unread`: Airbnb did not report it, so nothing is written.
 * `later`: written by a later step (bookings arrive when the connection is activated).
 */
export type ImportResult = "same" | "change" | "add" | "unread" | "later";

export interface ImportRow {
  key: ImportFieldKey;
  airbnb: ImportValue | null;
  local: ImportValue | null;
  /** What the property holds once this row is applied. */
  after: ImportValue | null;
  result: ImportResult;
  /** Whether the manager may untick it: a new property needs a name and a plan; bookings are not this step's. */
  optional: boolean;
}

export interface ImportPreview {
  rows: readonly ImportRow[];
  /** Rows Airbnb reported a value for. */
  fieldsRead: number;
  /** Rows Airbnb left empty. */
  unread: number;
  /** Rows that replace something the property already holds. */
  willChange: number;
  /** Rows that fill something the property does not have yet. */
  willAdd: number;
}

const median = (xs: readonly number[]): number | null => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
};
const mode = (xs: readonly number[]): number | null => {
  const counts = new Map<number, number>();
  for (const x of xs) counts.set(x, (counts.get(x) ?? 0) + 1);
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
  return best ? best[0] : null;
};
/** Friday and Saturday nights: the weekend a guest pays more for. */
const isWeekendNight = (iso: string): boolean => {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`).getUTCDay();
  return d === 5 || d === 6;
};

/** The prices a calendar carries: the median night, the median weekend night, how many nights are priced. */
export function nightlyPrices(
  nights: readonly ImportNight[],
  currency: string,
): Extract<ImportValue, { kind: "prices" }> | null {
  const priced = nights.filter((n) => n.priceMinor !== null && n.priceMinor > 0);
  const all = median(priced.map((n) => n.priceMinor!));
  if (all === null) return null;
  const weekend = median(priced.filter((n) => isWeekendNight(n.date)).map((n) => n.priceMinor!));
  return {
    kind: "prices",
    medianMinor: all,
    weekendMinor: weekend,
    nights: priced.length,
    currency,
  };
}

/** The minimum stay most nights ask for. */
export function usualMinStay(nights: readonly ImportNight[]): number | null {
  return mode(nights.filter((n) => n.minNights !== undefined).map((n) => n.minNights!));
}

const text = (v: string | undefined): ImportValue | null =>
  v !== undefined && v.trim() !== "" ? { kind: "text", value: v.trim() } : null;
const num = (v: number | undefined): ImportValue | null =>
  v !== undefined && Number.isFinite(v) ? { kind: "number", value: v } : null;

function same(a: ImportValue, b: ImportValue): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "text" && b.kind === "text")
    return a.value.toLowerCase() === b.value.toLowerCase();
  if (a.kind === "prices" && b.kind === "prices")
    return (
      a.medianMinor === b.medianMinor &&
      a.weekendMinor === b.weekendMinor &&
      a.currency === b.currency
    );
  return JSON.stringify(a) === JSON.stringify(b);
}

function row(
  key: ImportFieldKey,
  airbnb: ImportValue | null,
  local: ImportValue | null,
  optional = true,
): ImportRow {
  if (airbnb === null)
    return { key, airbnb, local, after: local, result: "unread", optional: false };
  if (local === null) return { key, airbnb, local, after: airbnb, result: "add", optional };
  return {
    key,
    airbnb,
    local,
    after: airbnb,
    result: same(airbnb, local) ? "same" : "change",
    optional,
  };
}

/**
 * The preview, field by field. Lists (amenities, photos) compare by count and content: the
 * import replaces the property's list with Airbnb's. Prices compare the median night and the
 * median weekend night over the horizon read; applying them writes every priced night.
 */
export function listingImportPreview(
  remote: ListingSnapshot,
  local: LocalSnapshot | null,
): ImportPreview {
  const isNew = local === null;
  const listCount = (xs: readonly string[] | undefined) =>
    xs && xs.length > 0 ? ({ kind: "count", value: xs.length } as const) : null;
  const listRow = (
    key: "amenities" | "photos",
    a: readonly string[],
    l: readonly string[] | undefined,
  ) => {
    const r = row(key, listCount(a), listCount(l));
    if (r.result === "same" && l && [...a].sort().join("\n") !== [...l].sort().join("\n"))
      return { ...r, result: "change" as const };
    return r;
  };
  const blocked = remote.nights.filter((n) => !n.available).length;
  const rows: ImportRow[] = [
    row("title", text(remote.title), local ? text(local.title) : null, !isNew),
    row("city", text(remote.city), local ? text(local.city) : null),
    row("country", text(remote.countryCode), local ? text(local.country) : null),
    row("bedrooms", num(remote.bedrooms), local ? num(local.bedrooms) : null),
    row("sleeps", num(remote.capacity), local ? num(local.sleeps) : null),
    row("summary", text(remote.summary), local ? text(local.summary) : null),
    listRow("amenities", remote.amenities, local?.amenities),
    listRow("photos", remote.photos, local?.photos),
    row(
      "prices",
      nightlyPrices(remote.nights, remote.currency),
      local ? nightlyPrices(local.nights, local.currency) : null,
    ),
    (() => {
      const a = usualMinStay(remote.nights);
      const l = local ? usualMinStay(local.nights) : null;
      return row(
        "minStay",
        a === null ? null : { kind: "nights", value: a },
        l === null ? null : { kind: "nights", value: l },
      );
    })(),
    isNew
      ? {
          key: "ratePlan",
          airbnb: null,
          local: null,
          after: { kind: "plan", title: "Standard" },
          result: "add",
          optional: false,
        }
      : {
          key: "ratePlan",
          airbnb: null,
          local: { kind: "plan", title: "Standard" },
          after: { kind: "plan", title: "Standard" },
          result: "same",
          optional: false,
        },
    {
      key: "bookings",
      airbnb: { kind: "onActivation", blockedNights: blocked },
      local: null,
      after: null,
      result: "later",
      optional: false,
    },
  ];
  const read = rows.filter((r) => r.key !== "ratePlan" && r.key !== "bookings");
  return {
    rows,
    fieldsRead: read.filter((r) => r.result !== "unread").length,
    unread: read.filter((r) => r.result === "unread").length,
    willChange: rows.filter((r) => r.result === "change").length,
    willAdd: rows.filter((r) => r.result === "add").length,
  };
}

/**
 * The fields to write: the ticked ones that change or add something, plus the ones a new
 * property cannot do without. A field Airbnb did not report is never written, ticked or not.
 */
export function fieldsToApply(
  preview: ImportPreview,
  ticked: ReadonlySet<string>,
): ReadonlySet<ImportFieldKey> {
  const out = new Set<ImportFieldKey>();
  for (const r of preview.rows) {
    if (r.result === "unread" || r.result === "later" || r.result === "same") continue;
    if (!r.optional || ticked.has(r.key)) out.add(r.key);
  }
  return out;
}
