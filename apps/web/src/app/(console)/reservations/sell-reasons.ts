/**
 * The sellability check (core `checkSellable`) explains a "no" in plain English codes such as
 * "no availability on 2026-11-24". The console shows them in the host's language, one sentence per
 * kind with its dates listed, so a five-night gap reads as one line, not five.
 */

export type SellReasonKind =
  | "departure_before_arrival"
  | "closed_to_arrival"
  | "closed_to_departure"
  | "min_stay"
  | "min_stay_through"
  | "max_stay"
  | "no_rate"
  | "stop_sell"
  | "no_availability"
  | "other";

export interface SellReason {
  kind: SellReasonKind;
  /** The nights (or the arrival / departure day) it applies to, in order. */
  dates: string[];
  /** The stay length named by a minimum or maximum stay. */
  n: number | null;
  /** The original text, for a reason this parser does not know. */
  raw: string;
}

const PATTERNS: Array<[RegExp, SellReasonKind]> = [
  [/^departure must be after arrival$/, "departure_before_arrival"],
  [/^closed to arrival on (\d{4}-\d{2}-\d{2})$/, "closed_to_arrival"],
  [/^closed to departure on (\d{4}-\d{2}-\d{2})$/, "closed_to_departure"],
  [/^minimum stay through (\d+) on (\d{4}-\d{2}-\d{2})$/, "min_stay_through"],
  [/^minimum stay (\d+) nights$/, "min_stay"],
  [/^maximum stay (\d+) on (\d{4}-\d{2}-\d{2})$/, "max_stay"],
  [/^no rate for (\d{4}-\d{2}-\d{2})$/, "no_rate"],
  [/^stop sell on (\d{4}-\d{2}-\d{2})$/, "stop_sell"],
  [/^no availability on (\d{4}-\d{2}-\d{2})$/, "no_availability"],
];

/** Parse and group the check's reasons: one entry per kind (and stay length), dates collected. */
export function groupSellReasons(reasons: readonly string[]): SellReason[] {
  const out: SellReason[] = [];
  for (const raw of reasons) {
    let hit: SellReason = { kind: "other", dates: [], n: null, raw };
    for (const [re, kind] of PATTERNS) {
      const m = re.exec(raw.trim());
      if (!m) continue;
      const nums = m.slice(1).filter((x) => /^\d+$/.test(x));
      const dates = m.slice(1).filter((x) => /^\d{4}-/.test(x));
      hit = { kind, dates, n: nums[0] ? Number(nums[0]) : null, raw };
      break;
    }
    const same =
      hit.kind === "other" ? undefined : out.find((o) => o.kind === hit.kind && o.n === hit.n);
    if (same) same.dates.push(...hit.dates.filter((d) => !same.dates.includes(d)));
    else out.push(hit);
  }
  for (const o of out) o.dates.sort();
  return out;
}
