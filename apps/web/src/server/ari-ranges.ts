/**
 * The nights a set of calendar cells covers, per rate plan: the first and last date of each plan,
 * so the cells' current values come back in one read per plan instead of one per cell. Dates are
 * ISO `YYYY-MM-DD`, which sort as strings.
 */
export function planRanges(
  cells: ReadonlyArray<{ ratePlanId: string; date: string }>,
): Map<string, { from: string; to: string }> {
  const out = new Map<string, { from: string; to: string }>();
  for (const c of cells) {
    const r = out.get(c.ratePlanId);
    if (!r) out.set(c.ratePlanId, { from: c.date, to: c.date });
    else {
      if (c.date < r.from) r.from = c.date;
      if (c.date > r.to) r.to = c.date;
    }
  }
  return out;
}
