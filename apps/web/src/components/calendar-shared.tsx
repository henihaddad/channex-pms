import { Fragment, type ReactNode } from "react";
import { createTranslator } from "next-intl";

/** The wire shapes of `/api/v1/ari/grid` and the stays action, shared by every calendar view. */
export type Values = {
  rate?: number;
  minStay?: number;
  maxStay?: number;
  closedToArrival?: boolean;
  closedToDeparture?: boolean;
  stopSell?: boolean;
};
export type SyncState = "pending" | "in_flight" | "synced" | "failed" | "conflicted";
export type RateCell = [string, Values, SyncState, number];
export type AvailCell = [string, number, SyncState, number];
export interface GridRatePlan {
  id: string;
  title: string;
  parentRatePlanId: string | null;
  cells: RateCell[];
}
export interface GridRoomType {
  id: string;
  title: string;
  countOfRooms: number;
  isSystemManaged: boolean;
  cells: AvailCell[];
  ratePlans: GridRatePlan[];
}
export interface GridProperty {
  id: string;
  title: string;
  kind: string;
  currency: string;
  state: string;
  groups: string[];
  photoUrl: string | null;
  city: string | null;
  channels: string[];
  pricing: { markupBps: Record<string, number | undefined>; rounding: "none" | "unit" | "five" };
  notes: Record<string, string>;
  roomTypes: GridRoomType[];
}
export interface Stay {
  bookingId: string;
  propertyId: string;
  roomTypeId: string | null;
  from: string;
  to: string;
  guest: string;
  otaName: string | null;
}
export interface Block {
  propertyId: string;
  roomTypeId: string;
  from: string;
  to: string;
  reason: string;
}

export const fmt = (s: string, vars: Record<string, string | number>): string =>
  s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));

type Translate = (key: string, vars: Record<string, string | number>) => string;
const translators = new Map<string, Translate>();
/**
 * An ICU message the page handed over raw (`{n, plural, one {# night} other {# nights}}`),
 * formatted with the locale's plural rules; Arabic has six forms. One compiled translator
 * per message and locale, reused on every render.
 */
export function plural(message: string, vars: Record<string, string | number>, locale: string) {
  const id = `${locale}\u0000${message}`;
  let t = translators.get(id);
  if (!t) {
    let failed = false;
    const tr = createTranslator({
      locale,
      messages: { m: message },
      onError: () => {
        failed = true;
      },
    }) as unknown as Translate;
    t = (key, v) => {
      failed = false;
      const out = tr(key, v);
      return failed ? fmt(message, v) : out;
    };
    translators.set(id, t);
  }
  return t("m", vars);
}

/** One cell lookup per night: each cells array is indexed once and kept while it lives. */
const byDate = new WeakMap<readonly unknown[], Map<string, unknown>>();
export function cellOn<C extends readonly [string, ...unknown[]]>(
  cells: readonly C[],
  date: string,
): C | undefined {
  let m = byDate.get(cells) as Map<string, C> | undefined;
  if (!m) {
    m = new Map(cells.map((c) => [c[0], c]));
    byDate.set(cells, m);
  }
  return m.get(date);
}

/** The words for a night's sync state, from the calendar's labels. */
export function syncWord(
  state: SyncState,
  L: {
    syncSynced: string;
    legendPending: string;
    legendSending: string;
    legendFailed: string;
    legendConflicted: string;
  },
): string {
  return {
    synced: L.syncSynced,
    pending: L.legendPending,
    in_flight: L.legendSending,
    failed: L.legendFailed,
    conflicted: L.legendConflicted,
  }[state];
}

/**
 * A night's sync state as a shape as well as a colour (WCAG 1.4.1): a filled dot once sent,
 * a ring while waiting, an arrow while sending, "!" when it failed, "?" when it needs a look.
 */
export function SyncMark({ state, className }: { state: SyncState; className?: string }) {
  const base = `inline-grid size-2.5 shrink-0 place-items-center text-[10px] leading-none font-bold ${className ?? ""}`;
  if (state === "synced")
    return (
      <span aria-hidden="true" className={base}>
        <span className="size-1.5 rounded-full bg-success" />
      </span>
    );
  if (state === "pending")
    return (
      <span aria-hidden="true" className={base}>
        <span className="size-1.5 rounded-full border border-muted" />
      </span>
    );
  const [glyph, tone] =
    state === "in_flight"
      ? ["↑", "text-info"]
      : state === "failed"
        ? ["!", "text-danger"]
        : ["?", "text-warning-soft-foreground"];
  return (
    <span aria-hidden="true" className={`${base} ${tone}`}>
      {glyph}
    </span>
  );
}

/** A private note on a night: a small square, unlike the round sync marks. */
export function NoteMark() {
  return <span aria-hidden="true" className="size-1.5 shrink-0 rounded-[1px] bg-warning" />;
}

export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
/** 0 = Monday … 6 = Sunday, the way the calendar's columns and the design count a week. */
export const mondayIndex = (iso: string): number =>
  (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7;

/** The base plan a one-row listing shows: its only non-derived plan, when there is exactly one. */
export function heroPlan(p: GridProperty): { rt: GridRoomType; plan: GridRatePlan } | null {
  if (p.roomTypes.length !== 1) return null;
  const rt = p.roomTypes[0]!;
  const base = rt.ratePlans.filter((rp) => rp.parentRatePlanId === null);
  return base.length === 1 ? { rt, plan: base[0]! } : null;
}

/** Whether a night falls inside a half-open stay or block. */
export const covers = (x: { from: string; to: string }, date: string): boolean =>
  x.from <= date && date < x.to;

/**
 * Copy with two light marks, so translators keep the emphasis and the keys in place:
 * `**bold**` and `[key]` for a keycap.
 */
export function rich(text: string): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|\[[^\]]+\])/g);
  return parts.map((p, i) =>
    p.startsWith("**") ? (
      <strong key={i}>{p.slice(2, -2)}</strong>
    ) : p.startsWith("[") ? (
      <Kbd key={i}>{p.slice(1, -1)}</Kbd>
    ) : (
      <Fragment key={i}>{p}</Fragment>
    ),
  );
}

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={`inline-flex items-center rounded-md border border-b-2 border-border bg-surface px-1.5 py-px font-sans text-[11px] font-semibold whitespace-nowrap text-muted ${className ?? ""}`}
    >
      {children}
    </kbd>
  );
}

/** A listing's cover photo, or a soft tile with its initial. */
export function ListingThumb({ property }: { property: Pick<GridProperty, "photoUrl" | "title"> }) {
  return property.photoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element -- remote listing photo, no loader configured
    <img
      src={property.photoUrl}
      alt=""
      className="h-7 w-9 shrink-0 rounded-md object-cover"
      loading="lazy"
    />
  ) : (
    <span
      aria-hidden="true"
      className="flex h-7 w-9 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-accent-soft to-default text-xs font-semibold text-accent-soft-foreground"
    >
      {property.title.slice(0, 1).toUpperCase()}
    </span>
  );
}

/** Blocked and stop-sold nights read as unavailable at a glance: a light hatch. */
export const HATCH =
  "repeating-linear-gradient(135deg, transparent 0 6px, color-mix(in oklab, currentColor 12%, transparent) 6px 7px)";
