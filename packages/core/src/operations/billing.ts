import { Id } from "../shared/id.js";
import { LocalDate } from "../shared/local-date.js";
import { DomainError, err, ok, type Result } from "../shared/result.js";
import type { FolioLine, Payment, TouristTaxRule } from "./types.js";

/** Room revenue lines for the nights in `days`, idempotent by posting key (spec 08 §8.9 daily close). */
export function roomLines(input: {
  bookingRoomId: string;
  days: Record<string, number>;
  description: string;
}): FolioLine[] {
  return Object.entries(input.days)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, amountMinor]) => ({
      id: Id.next(),
      kind: "room" as const,
      description: `${input.description} ${date}`,
      date,
      amountMinor,
      postingKey: `room:${input.bookingRoomId}:${date}`,
    }));
}

/** Tourist / city tax with per-jurisdiction rules: per person per night, age exemptions, night caps. */
export function touristTax(
  rule: TouristTaxRule,
  stay: { arrivalDate: string; departureDate: string; guestAges: readonly (number | null)[] },
): { amountMinor: number; nightsCharged: number; personsCharged: number } {
  const nights = Math.max(
    0,
    LocalDate.parse(stay.arrivalDate).daysUntil(LocalDate.parse(stay.departureDate)),
  );
  const nightsCharged = rule.maxNights !== undefined ? Math.min(nights, rule.maxNights) : nights;
  const personsCharged = stay.guestAges.filter(
    (age) => rule.exemptUnderAge === undefined || age === null || age >= rule.exemptUnderAge,
  ).length;
  return {
    amountMinor: rule.perPersonPerNightMinor * nightsCharged * personsCharged,
    nightsCharged,
    personsCharged,
  };
}

export function folioBalance(
  lines: readonly FolioLine[],
  payments: readonly Payment[],
): { chargesMinor: number; paidMinor: number; heldMinor: number; balanceMinor: number } {
  const chargesMinor = lines.reduce((a, l) => a + l.amountMinor, 0);
  const paidMinor =
    payments.filter((p) => p.state === "captured").reduce((a, p) => a + p.amountMinor, 0) -
    payments.filter((p) => p.state === "refunded").reduce((a, p) => a + p.amountMinor, 0);
  const heldMinor = payments
    .filter((p) => p.state === "held")
    .reduce((a, p) => a + p.amountMinor, 0);
  return { chargesMinor, paidMinor, heldMinor, balanceMinor: chargesMinor - paidMinor };
}

/** Deposits: a hold can be released or captured (with a reason) once; nothing else (spec 08 §8.9). */
export function settleDeposit(
  p: Payment,
  action: "capture" | "release",
  reason: string,
): Result<Payment> {
  if (p.state !== "held")
    return err(new DomainError("deposit.state", `deposit is ${p.state}, not held`));
  if (!reason.trim()) return err(new DomainError("deposit.reason", "a reason is required"));
  return ok({ ...p, state: action === "capture" ? "captured" : "released", reason });
}

/** Cancellation fee from a policy: none, first night, a percentage, or everything, by how late it is. */
export type CancellationPolicy =
  | { type: "flexible"; freeUntilDaysBefore: number; lateFeePercent: number }
  | { type: "non_refundable" }
  | { type: "first_night" };
export function cancellationFee(
  policy: CancellationPolicy,
  stay: { arrivalDate: string; totalMinor: number; firstNightMinor: number },
  cancelledOn: string,
): number {
  if (policy.type === "non_refundable") return stay.totalMinor;
  if (policy.type === "first_night") return stay.firstNightMinor;
  const daysBefore = LocalDate.parse(cancelledOn).daysUntil(LocalDate.parse(stay.arrivalDate));
  return daysBefore >= policy.freeUntilDaysBefore
    ? 0
    : Math.round((stay.totalMinor * policy.lateFeePercent) / 100);
}

/** Invoice numbers are gapless per property and year (a legal requirement in most of Europe). The store takes the row lock; this formats. */
export const invoiceNumber = (prefix: string, year: number, seq: number): string =>
  `${prefix}-${String(year)}-${String(seq).padStart(6, "0")}`;

/** Daily close (spec 08 §8.9): what to post for a business date, idempotent through posting keys already present. */
export function planDailyClose(input: {
  businessDate: string;
  nights: Array<{
    bookingRoomId: string;
    bookingId: string;
    date: string;
    amountMinor: number;
    description: string;
  }>;
  existingPostingKeys: ReadonlySet<string>;
  departedUnbalanced: Array<{ bookingId: string; balanceMinor: number }>;
}): {
  postings: Array<{ bookingId: string; line: FolioLine }>;
  flags: Array<{ bookingId: string; balanceMinor: number }>;
} {
  const postings: Array<{ bookingId: string; line: FolioLine }> = [];
  for (const n of input.nights) {
    if (n.date !== input.businessDate) continue;
    const key = `room:${n.bookingRoomId}:${n.date}`;
    if (input.existingPostingKeys.has(key)) continue;
    postings.push({
      bookingId: n.bookingId,
      line: {
        id: Id.next(),
        kind: "room",
        description: `${n.description} ${n.date}`,
        date: n.date,
        amountMinor: n.amountMinor,
        postingKey: key,
      },
    });
  }
  return { postings, flags: input.departedUnbalanced.filter((d) => d.balanceMinor !== 0) };
}
