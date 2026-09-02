import type {
  CoverageWarning,
  MappingDiff,
  MappingError,
  MappingRow,
  OurRatePlan,
  Suggestion,
  TheirRoom,
} from "./types.js";

const tokens = (s: string): Set<string> =>
  new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 1),
  );

const bigrams = (s: string): Set<string> => {
  const n = s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const out = new Set<string>();
  for (let i = 0; i < n.length - 1; i++) out.add(n.slice(i, i + 2));
  return out;
};

const overlap = (a: Set<string>, b: Set<string>): number => {
  if (a.size === 0 || b.size === 0) return 0;
  let n = 0;
  for (const x of a) if (b.has(x)) n++;
  return (2 * n) / (a.size + b.size);
};

/** Name similarity in 0..1: token Dice blended with character-bigram Dice, so "Double Room" ≈ "Dbl Room". */
export function nameSimilarity(a: string, b: string): number {
  return 0.6 * overlap(tokens(a), tokens(b)) + 0.4 * overlap(bigrams(a), bigrams(b));
}

const key = (r: Pick<MappingRow, "roomCode" | "rateCode">): string =>
  `${r.roomCode}::${r.rateCode}`;

/**
 * MAP-1: suggestions with confidence from name similarity, occupancy match and
 * previously accepted mappings (history). Each of our rate plans gets at most one
 * suggestion; each channel rate is proposed at most once (best match wins).
 */
export function suggestMappings(
  ours: readonly OurRatePlan[],
  theirs: readonly TheirRoom[],
  history: readonly MappingRow[] = [],
): Suggestion[] {
  const candidates: Suggestion[] = [];
  const previous = new Map(history.map((h) => [h.ratePlanId, h]));
  for (const rp of ours) {
    const prior = previous.get(rp.id);
    if (prior) {
      candidates.push({ ...prior, confidence: 1, reasons: ["previously accepted mapping"] });
      continue;
    }
    for (const room of theirs) {
      const roomScore = nameSimilarity(rp.roomTypeTitle, room.title);
      for (const rate of room.rates) {
        const rateScore = nameSimilarity(rp.title, rate.title);
        const reasons: string[] = [];
        let score = 0.5 * roomScore + 0.35 * rateScore;
        if (roomScore > 0.5) reasons.push(`room name matches "${room.title}"`);
        if (rateScore > 0.5) reasons.push(`rate name matches "${rate.title}"`);
        if (rate.occupancy !== undefined) {
          if (rate.occupancy === rp.occupancy) {
            score += 0.15;
            reasons.push(`occupancy ${String(rp.occupancy)} matches`);
          } else score -= 0.1;
        }
        // a channel with a single room and a single rate is almost certainly this listing
        if (theirs.length === 1 && room.rates.length === 1 && ours.length === 1) {
          score = Math.max(score, 0.9);
          reasons.push("only candidate on both sides");
        }
        const s: Suggestion = {
          ratePlanId: rp.id,
          roomCode: room.code,
          rateCode: rate.code,
          confidence: Math.max(0, Math.min(1, score)),
          reasons,
        };
        if (rate.occupancy !== undefined) s.occupancy = rate.occupancy;
        candidates.push(s);
      }
    }
  }
  candidates.sort(
    (a, b) => b.confidence - a.confidence || a.ratePlanId.localeCompare(b.ratePlanId),
  );
  const takenPlan = new Set<string>();
  const takenTarget = new Set<string>();
  const out: Suggestion[] = [];
  for (const c of candidates) {
    if (takenPlan.has(c.ratePlanId) || takenTarget.has(key(c)) || c.confidence < 0.2) continue;
    takenPlan.add(c.ratePlanId);
    takenTarget.add(key(c));
    out.push(c);
  }
  return out;
}

/** MAP-2: what is not covered by the given rows. Loud on purpose: unmapped inventory causes unmapped bookings. */
export function coverageWarnings(
  ours: readonly OurRatePlan[],
  theirs: readonly TheirRoom[],
  rows: readonly MappingRow[],
): CoverageWarning[] {
  const out: CoverageWarning[] = [];
  const mappedPlans = new Set(rows.map((r) => r.ratePlanId));
  const mappedRooms = new Set(rows.map((r) => r.roomCode));
  const roomTypes = new Map<string, { title: string; mapped: boolean }>();
  for (const rp of ours) {
    const rt = roomTypes.get(rp.roomTypeId) ?? { title: rp.roomTypeTitle, mapped: false };
    if (mappedPlans.has(rp.id)) rt.mapped = true;
    roomTypes.set(rp.roomTypeId, rt);
    if (!mappedPlans.has(rp.id))
      out.push({
        code: "unmapped_rate_plan",
        ref: rp.id,
        message: `Rate plan "${rp.title}" (${rp.roomTypeTitle}) is not mapped; bookings on it would arrive unmapped.`,
      });
  }
  for (const [id, rt] of roomTypes)
    if (!rt.mapped)
      out.push({
        code: "unmapped_room_type",
        ref: id,
        message: `Room type "${rt.title}" has no mapped rate plan; it will not sell on this channel.`,
      });
  for (const room of theirs) {
    if (!mappedRooms.has(room.code))
      out.push({
        code: "channel_room_unmapped",
        ref: room.code,
        message: `Channel room "${room.title}" (${room.code}) is not linked to any of our rate plans.`,
      });
    for (const rate of room.rates) {
      if (rate.occupancy === undefined) continue;
      const mappedHere = rows.filter((r) => r.roomCode === room.code && r.rateCode === rate.code);
      const sellsOccupancy = mappedHere.some((r) => {
        const rp = ours.find((o) => o.id === r.ratePlanId);
        return rp ? rp.occupancy >= rate.occupancy! : false;
      });
      if (mappedHere.length > 0 && !sellsOccupancy)
        out.push({
          code: "occupancy_gap",
          ref: `${room.code}::${rate.code}`,
          message: `Channel rate "${rate.title}" expects occupancy ${String(rate.occupancy)}, which the mapped rate plan does not sell.`,
        });
    }
  }
  const seen = new Map<string, number>();
  for (const r of rows) seen.set(key(r), (seen.get(key(r)) ?? 0) + 1);
  for (const [k, n] of seen)
    if (n > 1)
      out.push({
        code: "duplicate_target",
        ref: k,
        message: `Channel rate ${k.replace("::", "/")} is targeted by ${String(n)} rate plans; the channel will take one and drop the rest.`,
      });
  return out;
}

/** MAP-3: hard errors. Cross-property references (INV-8) and derived plans where the channel expects a base rate. */
export function validateMappings(
  rows: readonly MappingRow[],
  ours: readonly OurRatePlan[],
  propertyId: string,
  theirs: readonly TheirRoom[],
  opts: { channelExpectsBaseRates?: boolean } = {},
): MappingError[] {
  const errors: MappingError[] = [];
  const plans = new Map(ours.map((o) => [o.id, o]));
  const targets = new Set(theirs.flatMap((r) => r.rates.map((x) => `${r.code}::${x.code}`)));
  for (const r of rows) {
    const rp = plans.get(r.ratePlanId);
    if (!rp) {
      errors.push({
        code: "unknown_rate_plan",
        ratePlanId: r.ratePlanId,
        message: `Unknown rate plan ${r.ratePlanId}`,
      });
      continue;
    }
    if (rp.propertyId !== propertyId)
      errors.push({
        code: "cross_property",
        ratePlanId: r.ratePlanId,
        message: `Rate plan "${rp.title}" belongs to another property (INV-8)`,
      });
    if (!targets.has(key(r)))
      errors.push({
        code: "unknown_channel_target",
        ratePlanId: r.ratePlanId,
        message: `Channel has no rate ${r.roomCode}/${r.rateCode}`,
      });
    if (opts.channelExpectsBaseRates && rp.isDerived && !r.derivedOption)
      errors.push({
        code: "derived_where_base_expected",
        ratePlanId: r.ratePlanId,
        message: `"${rp.title}" is a derived plan; this channel expects a base rate here`,
      });
  }
  return errors;
}

/** MAP-4: what starts and stops selling when a live connection's mappings change. */
export function mappingDiff(
  before: readonly MappingRow[],
  after: readonly MappingRow[],
): MappingDiff {
  const b = new Map(before.map((r) => [r.ratePlanId, r]));
  const a = new Map(after.map((r) => [r.ratePlanId, r]));
  const diff: MappingDiff = { startsSelling: [], stopsSelling: [], changed: [] };
  for (const [id, row] of a) {
    const prev = b.get(id);
    if (!prev) diff.startsSelling.push(row);
    else if (
      key(prev) !== key(row) ||
      prev.occupancy !== row.occupancy ||
      JSON.stringify(prev.derivedOption ?? null) !== JSON.stringify(row.derivedOption ?? null)
    )
      diff.changed.push({ before: prev, after: row });
  }
  for (const [id, row] of b) if (!a.has(id)) diff.stopsSelling.push(row);
  return diff;
}
