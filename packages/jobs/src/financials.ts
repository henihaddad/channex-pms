import type { Clock, Crypto } from "@pms/core";
import { DrizzleOwnerRepository, rawRows, sql, type Tx } from "@pms/db";

/**
 * Everything about money that is waiting on a person (spec 11 §11.5b).
 *
 * Composed from the repositories the owner and reservation pages already read, so a
 * figure here can never disagree with the page it links to. Nothing is computed twice:
 * the statement net is the statement's own `netDue`, and a folio balance is charged minus
 * received, the same arithmetic the guest portal uses.
 */

interface StatementSummary {
  id: string;
  owner: string;
  period: string;
  netMinor: number;
  currency: string;
}
export interface MoneyQueue {
  /** Drafts a human still has to read (STMT-4). */
  statementsToApprove: StatementSummary[];
  /** Approved and not yet sent to the owner. */
  statementsToSend: StatementSummary[];
  /** An owner is owed: a payout to start, to second-approve, that failed, or nothing recorded at all. */
  payoutsToRecord: Array<{
    id: string;
    owner: string;
    amountMinor: number;
    currency: string;
    state: string;
  }>;
  /** Expenses that cannot reach a statement until approved (EXP-1). */
  expensesToApprove: Array<{
    id: string;
    property: string;
    description: string;
    amountMinor: number;
    currency: string;
  }>;
  /** Direct-booking instalments the payment rules want charged today or earlier. */
  instalmentsDue: Array<{
    id: string;
    reference: string;
    dueOn: string;
    amountMinor: number;
    currency: string;
    attempts: number;
  }>;
  /** Stays whose folio still owes, most owed first. */
  unpaidFolios: Array<{
    bookingId: string;
    reference: string;
    currency: string;
    balanceMinor: number;
  }>;
}

const netDue = (s: { totals: Record<string, number> }): number => Number(s.totals.netDue ?? 0);
const summarise = (s: {
  id: string;
  ownerName: string;
  periodFrom: string;
  totals: Record<string, number>;
  currency: string;
}): StatementSummary => ({
  id: s.id,
  owner: s.ownerName,
  period: s.periodFrom.slice(0, 7),
  netMinor: netDue(s),
  currency: s.currency,
});

export async function moneyQueue(
  deps: { crypto: Crypto; clock: Clock },
  tx: Tx,
  orgId: string,
): Promise<MoneyQueue> {
  const owners = new DrizzleOwnerRepository(tx, orgId, deps.crypto);
  const today = deps.clock.today("UTC").toString();
  const [drafts, approved, sent, expenses, paidPayouts] = await Promise.all([
    owners.statements({ state: "draft" }),
    owners.statements({ state: "approved" }),
    owners.statements({ state: "sent" }),
    owners.listExpenses({ state: "submitted" }),
    owners.payouts({ state: "paid" }),
  ]);
  const openPayouts = (
    await Promise.all(
      ["pending", "awaiting_approval", "failed"].map((state) => owners.payouts({ state })),
    )
  ).flat();
  // a statement the owner has seen with no payout row at all is owed money just as loudly
  const settled = new Set([...paidPayouts, ...openPayouts].map((p) => p.statementId));
  return {
    statementsToApprove: drafts.map(summarise),
    statementsToSend: approved.map(summarise),
    payoutsToRecord: [
      ...openPayouts.map((p) => ({
        id: p.statementId,
        owner: p.ownerName,
        amountMinor: p.amountMinor,
        currency: p.currency,
        state: p.state,
      })),
      ...sent
        .filter((s) => !settled.has(s.id))
        .map((s) => ({
          id: s.id,
          owner: s.ownerName,
          amountMinor: netDue(s),
          currency: s.currency,
          state: "unrecorded",
        })),
    ],
    expensesToApprove: expenses.map((e) => ({
      id: e.id,
      property: e.propertyTitle,
      description: e.vendor ? `${e.vendor} — ${e.description}` : e.description,
      amountMinor: e.amountMinor,
      currency: e.currency,
    })),
    instalmentsDue: await rawRows(
      tx,
      // the instalment's own currency, not the booking's: a rule states the amount it takes
      sql`select ps.id, coalesce(b.ota_reservation_code, b.channex_booking_id) as reference,
                 ps.due_on::text as "dueOn", ps.amount_minor as "amountMinor",
                 ps.currency, ps.attempts
          from payment_schedule ps join booking b on b.id = ps.booking_id
          where ps.state = 'scheduled' and ps.due_on <= ${today}
          order by ps.due_on limit 25`,
    ),
    // charged minus received; a refund row is negative, so counting it subtracts
    unpaidFolios: await rawRows(
      tx,
      sql`select f.booking_id as "bookingId",
                 coalesce(b.ota_reservation_code, b.channex_booking_id) as reference,
                 f.currency,
                 (coalesce(li.total, 0) - coalesce(pm.total, 0))::int as "balanceMinor"
          from folio f
            join booking b on b.id = f.booking_id
            left join lateral (
              select sum(amount_minor)::int as total from folio_line l where l.folio_id = f.id
            ) li on true
            left join lateral (
              select sum(amount_minor)::int as total from payment p
              where p.folio_id = f.id and p.state in ('captured', 'refunded')
            ) pm on true
          where b.status <> 'cancelled' and coalesce(li.total, 0) - coalesce(pm.total, 0) > 0
          order by "balanceMinor" desc limit 25`,
    ),
  };
}
