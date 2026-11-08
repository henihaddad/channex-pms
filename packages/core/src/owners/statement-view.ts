/**
 * A statement read the way an owner reads it (spec 17 §17.2, Statement board): one row per
 * reservation with its nights in the period, accommodation, channel fee and net, then
 * every other line as it is. The statement itself stays per night (STMT-3); this only
 * groups what is already there, so the rows always add back up to the lines.
 *
 * Persona: the `finance` manager reviewing a draft before it goes to the owner.
 */

export interface StatementLineLike {
  kind: string;
  date: string;
  description: string;
  amountMinor: number;
  bookingId: string | null;
  basis: Record<string, unknown>;
}

export interface StatementReservation {
  bookingId: string;
  /** The guest label the statement printed (already redacted where the agreement wants it). */
  guest: string;
  channel: string;
  /** The whole stay, which may run past the period. */
  arrival: string | null;
  departure: string | null;
  /** Nights of the stay inside the period. */
  nights: number;
  firstNight: string;
  accommodationMinor: number;
  /** OTA commission and tax withheld by the channel, as a negative amount. */
  channelFeeMinor: number;
  netMinor: number;
}

const FEE_KINDS = new Set(["ota_commission", "withheld_tax"]);

/** "Ana Silva · Airbnb · night 2026-10-03" → guest and channel. */
function parseRevenueLabel(description: string): { guest: string; channel: string } {
  const head = description.replace(/ · night \S+$/, "");
  const cut = head.lastIndexOf(" · ");
  return cut < 0
    ? { guest: head, channel: "" }
    : { guest: head.slice(0, cut), channel: head.slice(cut + 3) };
}

/** Revenue and channel-fee lines grouped per reservation, earliest stay first. */
export function statementReservations(lines: readonly StatementLineLike[]): StatementReservation[] {
  const by = new Map<string, StatementReservation>();
  for (const l of lines) {
    if (!l.bookingId) continue;
    if (l.kind !== "booking_revenue" && !FEE_KINDS.has(l.kind)) continue;
    let r = by.get(l.bookingId);
    if (!r) {
      r = {
        bookingId: l.bookingId,
        guest: "",
        channel: "",
        arrival: null,
        departure: null,
        nights: 0,
        firstNight: l.date,
        accommodationMinor: 0,
        channelFeeMinor: 0,
        netMinor: 0,
      };
      by.set(l.bookingId, r);
    }
    if (l.kind === "booking_revenue") {
      const { guest, channel } = parseRevenueLabel(l.description);
      r.guest = guest;
      r.channel = channel;
      const stay = typeof l.basis.stay === "string" ? l.basis.stay.split("→") : [];
      if (stay.length === 2) {
        r.arrival = stay[0]!;
        r.departure = stay[1]!;
      }
      r.nights += 1;
      r.accommodationMinor += l.amountMinor;
      if (l.date < r.firstNight) r.firstNight = l.date;
    } else {
      r.channelFeeMinor += l.amountMinor;
    }
    r.netMinor += l.amountMinor;
  }
  return [...by.values()].sort((a, b) =>
    a.firstNight < b.firstNight ? -1 : a.firstNight > b.firstNight ? 1 : 0,
  );
}

/** Every line that is not a reservation's revenue or channel fee: expenses, fees, stays, adjustments. */
export function statementOtherLines<L extends StatementLineLike>(lines: readonly L[]): L[] {
  return lines.filter(
    (l) => !(l.bookingId && (l.kind === "booking_revenue" || FEE_KINDS.has(l.kind))),
  );
}
