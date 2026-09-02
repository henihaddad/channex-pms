import { Money } from "../shared/money.js";
import type {
  AgreementModel,
  AgreementTerms,
  StatementInput,
  StatementLine,
  StatementLineKind,
  StatementNight,
  StatementResult,
  StatementSegmentSummary,
  StatementTotals,
} from "./types.js";

const BPS = 10_000;
const ORDER: Record<StatementLineKind, number> = {
  booking_revenue: 0,
  ota_commission: 1,
  withheld_tax: 2,
  cleaning: 3,
  management_fee: 4,
  fee_vat: 5,
  expense: 6,
  expense_markup: 7,
  owner_stay: 8,
  adjustment: 9,
  hold_back: 10,
};

/** Negate without producing -0 (which would make two equal statements differ under strict equality). */
const neg = (x: number): number => (x === 0 ? 0 : -x);
const pct = (minor: number, bps: number, currency: string): number =>
  Money.of(minor, currency).multiply(bps, BPS).minor;

/** Which agreement version governs a date (AGR-1); null when none does. */
export function segmentFor(
  segments: readonly AgreementTerms[],
  date: string,
): AgreementTerms | null {
  for (const s of segments)
    if (date >= s.effectiveFrom && (s.effectiveTo === null || date < s.effectiveTo)) return s;
  return null;
}

/** Nights in [from, to) only: a stay spanning the boundary splits by night (STMT-3). */
export function nightsInPeriod<T extends { date: string }>(
  nights: readonly T[],
  period: { from: string; to: string },
): T[] {
  return nights.filter((n) => n.date >= period.from && n.date < period.to);
}

/**
 * Split a booking-level amount (OTA commission, withheld tax) over its nights in
 * proportion to the nightly amounts, exactly, largest remainders first.
 */
export function allocateOverNights(
  totalMinor: number,
  nightAmounts: readonly number[],
  currency: string,
): number[] {
  if (nightAmounts.length === 0) return [];
  const ratios = nightAmounts.map((a) => Math.max(0, a));
  const all = ratios.every((r) => r === 0) ? nightAmounts.map(() => 1) : ratios;
  return Money.of(totalMinor, currency)
    .allocate(all)
    .map((m) => m.minor);
}

function feeFor(
  model: AgreementModel,
  basisMinor: number,
  grossMinor: number,
  share: { num: number; den: number },
  currency: string,
): { fee: number; how: string } {
  switch (model.kind) {
    case "commission_pct":
      return {
        fee: pct(basisMinor, model.rateBps, currency),
        how: `${String(model.rateBps / 100)}% of basis`,
      };
    case "fixed_fee": {
      const fee = Money.of(model.amountMinor, currency).multiply(share.num, share.den).minor;
      return { fee, how: `fixed fee × ${String(share.num)}/${String(share.den)} days` };
    }
    case "tiered": {
      const tier =
        model.tiers.find((t) => t.uptoMinor === null || basisMinor <= t.uptoMinor) ??
        model.tiers.at(-1);
      const rate = tier?.rateBps ?? 0;
      return {
        fee: pct(basisMinor, rate, currency),
        how: `tier ${String(rate / 100)}% (basis ${String(basisMinor)})`,
      };
    }
    case "guaranteed_rent": {
      const rent = Money.of(model.amountMinor, currency).multiply(share.num, share.den).minor;
      // the manager keeps everything above the guaranteed rent (and covers any shortfall)
      return {
        fee: grossMinor - rent,
        how: `guaranteed rent ${String(rent)} × ${String(share.num)}/${String(share.den)} days`,
      };
    }
  }
}

const daysBetween = (from: string, to: string): number =>
  Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0);

/**
 * The statement engine (spec 17 §17.2, STMT-1..3, OWN-1): pure, deterministic,
 * every line traces to a night, an expense, a block or an adjustment. The same
 * input always yields the same lines in the same order, so a regenerated draft
 * is byte-identical.
 */
export function computeStatement(input: StatementInput): StatementResult {
  const cur = input.currency;
  const warnings: string[] = [];
  const lines: StatementLine[] = [];
  const nights = nightsInPeriod(input.nights, input.period).slice().sort(byNight);
  const periodDays = Math.max(1, daysBetween(input.period.from, input.period.to));

  // group nights by governing segment
  const bySegment = new Map<AgreementTerms, StatementNight[]>();
  for (const n of nights) {
    const seg = segmentFor(input.segments, n.date);
    if (!seg) {
      warnings.push(
        `night ${n.date} of booking ${n.bookingId} has no agreement in force; excluded`,
      );
      continue;
    }
    bySegment.set(seg, [...(bySegment.get(seg) ?? []), n]);
  }
  const segments: StatementSegmentSummary[] = [];
  const totals: StatementTotals = {
    grossRevenue: 0,
    otaCommission: 0,
    withheldTax: 0,
    revenueBasis: 0,
    managementFee: 0,
    feeVat: 0,
    cleaning: 0,
    expenses: 0,
    ownerStays: 0,
    adjustments: 0,
    holdBackRetained: 0,
    holdBackReleased: 0,
    netDue: 0,
    payable: 0,
    carriedForward: 0,
    estimatedCommissionNights: 0,
  };
  const orderedSegments = input.segments
    .slice()
    .sort((a, b) =>
      a.effectiveFrom < b.effectiveFrom
        ? -1
        : a.effectiveFrom > b.effectiveFrom
          ? 1
          : a.version - b.version,
    );

  for (const seg of orderedSegments) {
    const segFrom = seg.effectiveFrom > input.period.from ? seg.effectiveFrom : input.period.from;
    const segTo =
      seg.effectiveTo !== null && seg.effectiveTo < input.period.to
        ? seg.effectiveTo
        : input.period.to;
    if (segFrom >= segTo) continue;
    const segNights = bySegment.get(seg) ?? [];
    const share = { num: daysBetween(segFrom, segTo), den: periodDays };
    let gross = 0;
    let commission = 0;
    let withheld = 0;
    let cleaningToOwner = 0;
    for (const n of segNights) {
      gross += n.amountMinor;
      lines.push(
        line(
          "booking_revenue",
          n.date,
          `${n.guestLabel} · ${n.channel} · night ${n.date}`,
          n.amountMinor,
          seg.version,
          { bookingId: n.bookingId },
          {
            roomKey: n.roomKey,
            unitId: n.unitId,
            stay: `${n.arrivalDate}→${n.departureDate}`,
          },
        ),
      );
      if (n.otaCommissionMinor !== 0) {
        commission += n.otaCommissionMinor;
        if (n.otaCommissionKind === "estimate") totals.estimatedCommissionNights += 1;
        lines.push(
          line(
            "ota_commission",
            n.date,
            `OTA commission (${n.otaCommissionKind}) · ${n.channel}`,
            neg(n.otaCommissionMinor),
            seg.version,
            { bookingId: n.bookingId },
            { kind: n.otaCommissionKind },
          ),
        );
      }
      if (n.withheldTaxMinor !== 0) {
        withheld += n.withheldTaxMinor;
        lines.push(
          line(
            "withheld_tax",
            n.date,
            `Tax withheld by ${n.channel}`,
            neg(n.withheldTaxMinor),
            seg.version,
            { bookingId: n.bookingId },
            {},
          ),
        );
      }
      if (n.cleaningFeeMinor !== 0 && seg.cleaningFees.kind !== "kept") {
        const ownerShare =
          seg.cleaningFees.kind === "passed"
            ? n.cleaningFeeMinor
            : pct(n.cleaningFeeMinor, seg.cleaningFees.ownerBps, cur);
        cleaningToOwner += ownerShare;
        lines.push(
          line(
            "cleaning",
            n.date,
            `Cleaning fee ${seg.cleaningFees.kind === "passed" ? "passed to owner" : `split ${String(seg.cleaningFees.ownerBps / 100)}%`}`,
            ownerShare,
            seg.version,
            { bookingId: n.bookingId },
            { fee: n.cleaningFeeMinor },
          ),
        );
      }
    }
    const basis =
      seg.commissionBasis === "gross"
        ? gross
        : seg.commissionBasis === "net_of_ota_commission"
          ? gross - commission
          : gross - withheld;
    const { fee, how } = feeFor(seg.model, basis, gross, share, cur);
    if (fee !== 0 || seg.model.kind !== "commission_pct")
      lines.push(
        line(
          "management_fee",
          segTo === input.period.to ? lastDay(input.period.to) : lastDay(segTo),
          `Management fee (${how}) on ${seg.commissionBasis.replace(/_/g, " ")} basis`,
          neg(fee),
          seg.version,
          {},
          { basis, gross, commission, withheld, model: seg.model.kind },
        ),
      );
    let vat = 0;
    if (seg.vat.onFee && fee !== 0) {
      vat = pct(fee, seg.vat.rateBps, cur);
      lines.push(
        line(
          "fee_vat",
          lastDay(segTo),
          `VAT ${String(seg.vat.rateBps / 100)}% on management fee`,
          neg(vat),
          seg.version,
          {},
          { fee },
        ),
      );
    }
    // rebillable expenses dated inside the segment (EXP-2: markup on its own line)
    for (const e of input.expenses
      .filter((x) => x.date >= segFrom && x.date < segTo)
      .sort(byExpense)) {
      const rule = seg.deductibles[e.category] ?? { kind: "at_cost" as const };
      if (rule.kind === "absorbed") continue;
      totals.expenses += e.amountMinor;
      lines.push(
        line(
          "expense",
          e.date,
          `${e.category}: ${e.description}${e.vendor ? ` (${e.vendor})` : ""}`,
          neg(e.amountMinor),
          seg.version,
          { expenseId: e.id },
          { receipt: e.hasReceipt, rule: rule.kind },
        ),
      );
      if (rule.kind === "marked_up") {
        const markup = pct(e.amountMinor, rule.markupBps, cur);
        totals.expenses += markup;
        lines.push(
          line(
            "expense_markup",
            e.date,
            `Markup ${String(rule.markupBps / 100)}% on ${e.category}`,
            neg(markup),
            seg.version,
            { expenseId: e.id },
            { markupBps: rule.markupBps },
          ),
        );
      }
    }
    // owner stays: allowance first, then the rule's nightly charge
    let used = input.ownerStayNightsUsedBefore;
    for (const s of input.ownerStays
      .filter((x) => x.date >= segFrom && x.date < segTo)
      .sort(byStay)) {
      used += 1;
      const withinAllowance =
        seg.ownerStayAllowanceNights === null
          ? seg.ownerStays.kind === "free"
          : used <= seg.ownerStayAllowanceNights;
      const charge =
        withinAllowance || seg.ownerStays.kind === "free" ? 0 : seg.ownerStays.nightlyMinor;
      totals.ownerStays += charge;
      lines.push(
        line(
          "owner_stay",
          s.date,
          withinAllowance
            ? `Owner stay night (allowance ${String(used)}${seg.ownerStayAllowanceNights !== null ? `/${String(seg.ownerStayAllowanceNights)}` : ""})`
            : `Owner stay night charged (${seg.ownerStays.kind.replace("_", " ")})`,
          neg(charge),
          seg.version,
          { blockId: s.blockId },
          { unitId: s.unitId },
        ),
      );
    }
    totals.grossRevenue += gross;
    totals.otaCommission += commission;
    totals.withheldTax += withheld;
    totals.revenueBasis += basis;
    totals.managementFee += fee;
    totals.feeVat += vat;
    totals.cleaning += cleaningToOwner;
    segments.push({
      version: seg.version,
      from: segFrom,
      to: segTo,
      commissionBasis: seg.commissionBasis,
      model: seg.model,
      nights: segNights.length,
    });
  }
  const lastSeg = orderedSegments.at(-1);
  for (const a of input.adjustments.slice().sort(byAdjustment)) {
    totals.adjustments += a.amountMinor;
    lines.push(
      line(
        "adjustment",
        a.date,
        a.description,
        a.amountMinor,
        lastSeg?.version ?? 0,
        { adjustmentId: a.id, bookingId: a.originBookingId },
        { kind: a.kind, originStatementId: a.originStatementId },
      ),
    );
  }
  if (input.holdBackReleasedMinor !== 0) {
    totals.holdBackReleased = input.holdBackReleasedMinor;
    lines.push(
      line(
        "hold_back",
        input.period.from,
        "Hold-back released from the previous statement",
        input.holdBackReleasedMinor,
        lastSeg?.version ?? 0,
        {},
        {},
      ),
    );
  }
  const beforeHoldBack = sum(lines.map((l) => l.amountMinor));
  if (lastSeg && lastSeg.payout.holdBackBps > 0 && beforeHoldBack > 0) {
    const retained = pct(beforeHoldBack, lastSeg.payout.holdBackBps, cur);
    totals.holdBackRetained = retained;
    lines.push(
      line(
        "hold_back",
        lastDay(input.period.to),
        `Hold-back ${String(lastSeg.payout.holdBackBps / 100)}% retained for future expenses`,
        neg(retained),
        lastSeg.version,
        {},
        { base: beforeHoldBack },
      ),
    );
  }
  lines.sort(byLine);
  totals.netDue = sum(lines.map((l) => l.amountMinor));
  const minimum = lastSeg?.payout.minimumMinor ?? 0;
  if (totals.netDue > 0 && totals.netDue < minimum) {
    totals.payable = 0;
    totals.carriedForward = totals.netDue;
    warnings.push(
      `net due ${String(totals.netDue)} is below the minimum payout ${String(minimum)}; carried forward`,
    );
  } else {
    totals.payable = totals.netDue;
  }
  if (totals.estimatedCommissionNights > 0)
    warnings.push(
      `${String(totals.estimatedCommissionNights)} night(s) carry an estimated OTA commission`,
    );
  return { currency: cur, period: input.period, segments, lines, totals, warnings };
}

function line(
  kind: StatementLineKind,
  date: string,
  description: string,
  amountMinor: number,
  agreementVersion: number,
  refs: {
    bookingId?: string | null;
    expenseId?: string | null;
    blockId?: string | null;
    adjustmentId?: string | null;
  },
  basis: StatementLine["basis"],
): StatementLine {
  return {
    kind,
    date,
    description,
    amountMinor,
    agreementVersion,
    bookingId: refs.bookingId ?? null,
    expenseId: refs.expenseId ?? null,
    blockId: refs.blockId ?? null,
    adjustmentId: refs.adjustmentId ?? null,
    basis,
  };
}

const lastDay = (exclusiveTo: string): string => {
  const d = new Date(`${exclusiveTo}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};
const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const byNight = (a: StatementNight, b: StatementNight): number =>
  cmp(a.date, b.date) ||
  cmp(a.bookingId, b.bookingId) ||
  cmp(a.roomKey, b.roomKey) ||
  a.amountMinor - b.amountMinor ||
  a.otaCommissionMinor - b.otaCommissionMinor ||
  a.withheldTaxMinor - b.withheldTaxMinor ||
  a.cleaningFeeMinor - b.cleaningFeeMinor;
const byExpense = (a: { date: string; id: string }, b: { date: string; id: string }): number =>
  cmp(a.date, b.date) || cmp(a.id, b.id);
const byStay = (
  a: { date: string; blockId: string },
  b: { date: string; blockId: string },
): number => cmp(a.date, b.date) || cmp(a.blockId, b.blockId);
const byAdjustment = byExpense;
const byLine = (a: StatementLine, b: StatementLine): number =>
  cmp(a.date, b.date) ||
  ORDER[a.kind] - ORDER[b.kind] ||
  cmp(a.bookingId ?? "", b.bookingId ?? "") ||
  cmp(a.expenseId ?? "", b.expenseId ?? "") ||
  cmp(a.blockId ?? "", b.blockId ?? "") ||
  cmp(a.adjustmentId ?? "", b.adjustmentId ?? "") ||
  cmp(a.description, b.description) ||
  a.amountMinor - b.amountMinor ||
  cmp(JSON.stringify(a.basis), JSON.stringify(b.basis));

/**
 * STMT-4 / OWN-2: nights billed on a sent statement that no longer stand
 * (cancelled, or re-priced) become adjustment lines on the next statement,
 * each linking to the origin. `billed` is the ledger of (night, amount) per
 * sent statement; `current` is what the bookings say now.
 */
export function restatementAdjustments(
  billed: ReadonlyArray<{
    statementId: string;
    bookingId: string;
    roomKey: string;
    date: string;
    amountMinor: number;
  }>,
  current: ReadonlyArray<{
    roomKey: string;
    date: string;
    amountMinor: number;
    status: "confirmed" | "cancelled";
  }>,
  asOf: string,
): Array<{
  id: string;
  kind: "restatement";
  date: string;
  description: string;
  amountMinor: number;
  originStatementId: string;
  originBookingId: string;
}> {
  const now = new Map(current.map((c) => [`${c.roomKey}:${c.date}`, c]));
  const out = [];
  for (const b of billed.slice().sort((x, y) => cmp(x.date, y.date) || cmp(x.roomKey, y.roomKey))) {
    const c = now.get(`${b.roomKey}:${b.date}`);
    const standing = c && c.status === "confirmed" ? c.amountMinor : 0;
    const delta = standing - b.amountMinor;
    if (delta === 0) continue;
    out.push({
      id: `restate:${b.statementId}:${b.roomKey}:${b.date}`,
      kind: "restatement" as const,
      date: asOf,
      description: `${standing === 0 ? "Cancelled after statement" : "Re-priced after statement"}: night ${b.date} (statement ${b.statementId.slice(-6)})`,
      amountMinor: delta,
      originStatementId: b.statementId,
      originBookingId: b.bookingId,
    });
  }
  return out;
}

/** PAY-1: four-eyes above the org threshold; PAY-3 threshold and hold-back are already in the totals. */
export function fourEyesRequired(amountMinor: number, thresholdMinor: number): boolean {
  return amountMinor >= thresholdMinor;
}

/** The statement period an agreement schedule produces for a given date (monthly or fortnightly). */
export function periodEndingBefore(
  frequency: "monthly" | "fortnightly",
  today: string,
): { from: string; to: string } {
  const d = new Date(`${today}T00:00:00Z`);
  if (frequency === "monthly") {
    const to = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
    const from = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth() - 1, 1));
    return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
  }
  const day = d.getUTCDate();
  const to =
    day >= 16
      ? new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 16))
      : new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const from =
    day >= 16
      ? new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
      : new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 16));
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}
