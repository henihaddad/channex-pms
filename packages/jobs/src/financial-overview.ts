import {
  dominantCurrency,
  planPayments,
  monthsEnding,
  revenueByMonth,
  shiftDate,
  sumByCurrency,
  type Clock,
  type CurrencyAmount,
  type Crypto,
  type MonthRevenue,
  type PaymentRule,
} from "@pms/core";
import {
  DrizzleOwnerRepository,
  DrizzlePaymentRuleRepository,
  DrizzlePropertyRepository,
  rawRows,
  sql,
  type Tx,
} from "@pms/db";

/**
 * The Financials overview (spec 11 §11.5b, design board "Financials"): how money is doing
 * this month, where it came from, and the money moving in and out. Every figure is read
 * from the table that owns it: revenue from the room-night facts the KPIs use, money
 * received from folio payments, balances from folios, expenses and owner payables from the
 * owner ledger. Sums are kept per currency and never added across currencies (rule 4).
 */

export interface TransactionRow {
  id: string;
  kind: "payment" | "refund" | "expense" | "owner_payout";
  /** A calendar day for expenses, the day of the instant for payments and payouts. */
  date: string;
  /** "card", "cash", "ota_collected"…; the expense category; the payout method. */
  method: string;
  /** Who: the vendor of an expense, the owner of a payout. */
  party: string | null;
  propertyTitle: string | null;
  reference: string | null;
  bookingId: string | null;
  /** Signed: money in positive, money out negative. */
  amountMinor: number;
  currency: string;
  state: string;
}

export interface BalanceDueRow {
  bookingId: string;
  reference: string;
  guest: string | null;
  propertyTitle: string;
  arrival: string;
  departure: string;
  balanceMinor: number;
  currency: string;
}

export interface FinancialOverview {
  today: string;
  month: string;
  currency: string;
  revenueMtd: CurrencyAmount[];
  /** The same days of the previous month, for "+18% vs Oct same days". */
  revenuePrevSameDays: CurrencyAmount[];
  receivedMtd: CurrencyAmount[];
  receivedCount: number;
  instalmentsScheduled: number;
  balanceDue: CurrencyAmount[];
  balanceDueCount: number;
  expensesMtd: CurrencyAmount[];
  expensesCount: number;
  ownerPayable: CurrencyAmount[];
  draftStatements: number;
  revenueByMonth: MonthRevenue[];
  transactions: TransactionRow[];
  balanceDueRows: BalanceDueRow[];
  touristTax: { amounts: CurrencyAmount[]; stays: number };
  fees: Array<{ channel: string; currency: string; commissionMinor: number }>;
}

const monthStart = (iso: string): string => `${iso.slice(0, 7)}-01`;
const nextMonth = (iso: string): string => {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  return m === 12 ? `${String(y + 1)}-01-01` : `${String(y)}-${String(m + 1).padStart(2, "0")}-01`;
};
const prevMonth = (iso: string): string => monthStart(shiftDate(monthStart(iso), -1));

/** Payments, refunds, expenses and owner payouts, newest first. */
export async function transactions(tx: Tx, limit: number): Promise<TransactionRow[]> {
  return rawRows<TransactionRow>(
    tx,
    sql`select * from (
          select p.id, case when p.amount_minor < 0 or p.state = 'refunded' then 'refund' else 'payment' end as kind,
                 p.received_at::date::text as date, p.method, null::text as party,
                 pr.title as "propertyTitle",
                 coalesce(b.ota_reservation_code, b.channex_booking_id) as reference,
                 b.id as "bookingId", p.amount_minor::int as "amountMinor", f.currency, p.state,
                 p.received_at as at
          from payment p join folio f on f.id = p.folio_id
            join property pr on pr.id = f.property_id
            left join booking b on b.id = f.booking_id
          union all
          select e.id, 'expense', e.date::text, e.category, e.vendor, pr.title, e.description, null,
                 -e.amount_minor::int, e.currency, e.state, e.date::timestamptz
          from owner_expense e join property pr on pr.id = e.property_id
          where e.state <> 'rejected'
          union all
          select op.id, 'owner_payout', coalesce(op.paid_at, op.created_at)::date::text, op.method,
                 o.name, pr.title, op.reference, null, -op.amount_minor::int, op.currency, op.state,
                 coalesce(op.paid_at, op.created_at)
          from owner_payout op join owner o on o.id = op.owner_id
            join owner_statement st on st.id = op.statement_id
            join property pr on pr.id = st.property_id
        ) t order by at desc, id limit ${limit}`,
  );
}

export async function financialOverview(
  deps: { crypto: Crypto; clock: Clock },
  tx: Tx,
  orgId: string,
): Promise<FinancialOverview> {
  const today = deps.clock.today("UTC").toString();
  const from = monthStart(today);
  const to = nextMonth(today);
  const prevFrom = prevMonth(today);
  // "same days": the 1st up to today's day-of-month, capped at the previous month's end
  const prevTo = [shiftDate(prevFrom, Number(today.slice(8, 10))), from].sort()[0]!;
  const months = monthsEnding(today.slice(0, 7), 7);
  const [org] = await rawRows<{ currency: string }>(
    tx,
    sql`select default_currency as currency from organization where id = ${orgId}`,
  );

  const monthly = await rawRows<{
    month: string;
    channel: string;
    currency: string;
    revenueMinor: number;
  }>(
    tx,
    sql`select to_char(date, 'YYYY-MM') as month, channel, currency,
               sum(room_revenue_minor)::int as "revenueMinor"
        from fact_room_night
        where status <> 'cancelled' and date >= ${`${months[0]!}-01`} and date < ${to}
        group by 1, 2, 3`,
  );
  const prevRows = await rawRows<{ currency: string; minor: number }>(
    tx,
    sql`select currency, sum(room_revenue_minor)::int as minor from fact_room_night
        where status <> 'cancelled' and date >= ${prevFrom} and date < ${prevTo} group by 1`,
  );
  const received = await rawRows<{ currency: string; minor: number; n: number }>(
    tx,
    sql`select f.currency, sum(p.amount_minor)::int as minor, count(*)::int as n
        from payment p join folio f on f.id = p.folio_id
        where p.state = 'captured' and p.amount_minor > 0 and p.received_at >= ${from}::date
          and p.received_at < ${to}::date
        group by 1`,
  );
  const [scheduled] = await rawRows<{ n: number }>(
    tx,
    sql`select count(*)::int as n from payment_schedule where state = 'scheduled'`,
  );
  const due = await rawRows<{
    bookingId: string;
    reference: string;
    nameEnc: string | null;
    surnameEnc: string | null;
    propertyTitle: string;
    arrival: string;
    departure: string;
    currency: string;
    balanceMinor: number;
  }>(
    tx,
    // charged minus received, the arithmetic of the guest portal and the money queue
    sql`select f.booking_id as "bookingId",
               coalesce(b.ota_reservation_code, b.channex_booking_id) as reference,
               g.name_enc as "nameEnc", g.surname_enc as "surnameEnc", pr.title as "propertyTitle",
               b.arrival_date::text as arrival, b.departure_date::text as departure, f.currency,
               (coalesce(li.total, 0) - coalesce(pm.total, 0))::int as "balanceMinor"
        from folio f
          join booking b on b.id = f.booking_id
          join property pr on pr.id = f.property_id
          left join guest g on g.id = b.guest_id
          left join lateral (
            select sum(amount_minor)::int as total from folio_line l where l.folio_id = f.id
          ) li on true
          left join lateral (
            select sum(amount_minor)::int as total from payment p
            where p.folio_id = f.id and p.state in ('captured', 'refunded')
          ) pm on true
        where b.status <> 'cancelled' and coalesce(li.total, 0) - coalesce(pm.total, 0) > 0
        order by b.arrival_date, "balanceMinor" desc`,
  );
  const expenses = await rawRows<{ currency: string; minor: number; n: number }>(
    tx,
    sql`select currency, sum(amount_minor)::int as minor, count(*)::int as n from owner_expense
        where state <> 'rejected' and date >= ${from} and date < ${to} group by 1`,
  );
  const owners = new DrizzleOwnerRepository(tx, orgId, deps.crypto);
  const [drafts, approved] = await Promise.all([
    owners.statements({ state: "draft" }),
    owners.statements({ state: "approved" }),
  ]);
  const tax = await rawRows<{ currency: string; minor: number; stays: number }>(
    tx,
    sql`select f.currency, sum(l.amount_minor)::int as minor, count(distinct f.id)::int as stays
        from folio_line l join folio f on f.id = l.folio_id
        where l.kind = 'tourist_tax' and l.date >= ${from} and l.date < ${to} group by 1`,
  );
  const fees = await rawRows<{ channel: string; currency: string; commissionMinor: number }>(
    tx,
    sql`select channel, currency, sum(commission_minor)::int as "commissionMinor"
        from fact_room_night
        where status <> 'cancelled' and date >= ${from} and date < ${to} and commission_minor <> 0
        group by 1, 2 order by 3 desc`,
  );

  const thisMonth = monthly.filter((r) => r.month === today.slice(0, 7));
  const currency = dominantCurrency(
    monthly.map((r) => ({ currency: r.currency, minor: r.revenueMinor })),
    org?.currency ?? "EUR",
  );
  const open = (v: string | null) => (v ? deps.crypto.open(v) : Promise.resolve(""));
  return {
    today,
    month: today.slice(0, 7),
    currency,
    revenueMtd: sumByCurrency(
      thisMonth.map((r) => ({ currency: r.currency, minor: r.revenueMinor })),
    ),
    revenuePrevSameDays: sumByCurrency(prevRows),
    receivedMtd: sumByCurrency(received),
    receivedCount: received.reduce((a, r) => a + r.n, 0),
    instalmentsScheduled: scheduled?.n ?? 0,
    balanceDue: sumByCurrency(due.map((d) => ({ currency: d.currency, minor: d.balanceMinor }))),
    balanceDueCount: due.length,
    expensesMtd: sumByCurrency(expenses),
    expensesCount: expenses.reduce((a, r) => a + r.n, 0),
    ownerPayable: sumByCurrency(
      [...drafts, ...approved].map((s) => ({
        currency: s.currency,
        minor: Number(s.totals.payable ?? s.totals.netDue ?? 0),
      })),
    ),
    draftStatements: drafts.length,
    revenueByMonth: revenueByMonth(monthly, months, currency),
    transactions: await transactions(tx, 8),
    balanceDueRows: await Promise.all(
      due.slice(0, 5).map(async (d) => {
        const name = await open(d.nameEnc);
        const surname = await open(d.surnameEnc);
        return {
          bookingId: d.bookingId,
          reference: d.reference,
          guest: name ? `${name} ${surname}`.trim() : null,
          propertyTitle: d.propertyTitle,
          arrival: d.arrival,
          departure: d.departure,
          balanceMinor: d.balanceMinor,
          currency: d.currency,
        };
      }),
    ),
    touristTax: {
      amounts: sumByCurrency(tax),
      stays: tax.reduce((a, r) => a + r.stays, 0),
    },
    fees,
  };
}

export interface PaymentRuleStats {
  collected30d: CurrencyAmount[];
  collectedCount: number;
  failed: number;
  retrying: number;
  depositsHeld: CurrencyAmount[];
  depositsHeldCount: number;
  refunds30d: CurrencyAmount[];
  refundsCount: number;
}

/** The four tiles above the payment rules: what the rules collected, failed, hold and refunded. */
export async function paymentRuleStats(deps: { clock: Clock }, tx: Tx): Promise<PaymentRuleStats> {
  const since = shiftDate(deps.clock.today("UTC").toString(), -30);
  const collected = await rawRows<{ currency: string; minor: number; n: number }>(
    tx,
    sql`select currency, sum(amount_minor)::int as minor, count(*)::int as n from payment_schedule
        where state = 'paid' and settled_at >= ${since}::date group by 1`,
  );
  const [failures] = await rawRows<{ failed: number; retrying: number }>(
    tx,
    sql`select count(*) filter (where state = 'failed')::int as failed,
               count(*) filter (where state = 'scheduled' and attempts > 0)::int as retrying
        from payment_schedule`,
  );
  const held = await rawRows<{ currency: string; minor: number; n: number }>(
    tx,
    sql`select f.currency, sum(p.amount_minor)::int as minor, count(*)::int as n
        from payment p join folio f on f.id = p.folio_id where p.state = 'held' group by 1`,
  );
  const refunds = await rawRows<{ currency: string; minor: number; n: number }>(
    tx,
    sql`select f.currency, sum(abs(p.amount_minor))::int as minor, count(*)::int as n
        from payment p join folio f on f.id = p.folio_id
        where (p.state = 'refunded' or p.amount_minor < 0) and p.received_at >= ${since}::date
        group by 1`,
  );
  return {
    collected30d: sumByCurrency(collected),
    collectedCount: collected.reduce((a, r) => a + r.n, 0),
    failed: failures?.failed ?? 0,
    retrying: failures?.retrying ?? 0,
    depositsHeld: sumByCurrency(held),
    depositsHeldCount: held.reduce((a, r) => a + r.n, 0),
    refunds30d: sumByCurrency(refunds),
    refundsCount: refunds.reduce((a, r) => a + r.n, 0),
  };
}

export interface PaymentRulesView {
  rules: PaymentRule[];
  properties: Array<{ id: string; title: string }>;
  /** A worked example on a 1000.00 stay arriving in 60 days, so the effect of the rules is visible. */
  example: Array<{ name: string; dueOn: string; amountMinor: number }>;
  /** The same stay grown by half: what a change in the total does to each instalment. */
  exampleAfter: Array<{ name: string; dueOn: string; amountMinor: number }>;
  exampleTotals: { before: number; after: number };
  currency: string;
  stats: PaymentRuleStats;
  /** Whether card charges reach a real processor here or the test stand-in. */
  processor: { name: string; configured: boolean };
}

/** The payment rules board (spec 10 §10.4): the rules, their worked example and what they did. */
export async function paymentRulesView(
  deps: { clock: Clock; stripeConfigured: boolean },
  tx: Tx,
  orgId: string,
): Promise<PaymentRulesView> {
  const rules = await new DrizzlePaymentRuleRepository(tx, orgId).listRules();
  const properties = (await new DrizzlePropertyRepository(tx, orgId).list()).map((p) => ({
    id: p.id,
    title: p.title,
  }));
  const today = deps.clock.today("UTC").toString();
  const [org] = await rawRows<{ currency: string }>(
    tx,
    sql`select default_currency as currency from organization where id = ${orgId}`,
  );
  const currency = org?.currency ?? "EUR";
  const plan = (totalMinor: number) =>
    planPayments({
      rules,
      totalMinor,
      currency,
      propertyId: properties[0]?.id ?? "",
      channel: "direct",
      arrival: shiftDate(today, 60),
      bookedOn: today,
    });
  return {
    rules,
    properties,
    currency,
    example: plan(100_000),
    exampleAfter: plan(150_000),
    exampleTotals: { before: 100_000, after: 150_000 },
    stats: await paymentRuleStats(deps, tx),
    processor: { name: "Stripe", configured: deps.stripeConfigured },
  };
}
