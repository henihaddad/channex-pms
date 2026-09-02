import {
  computeStatement,
  fourEyesRequired,
  Money,
  periodEndingBefore,
  restatementAdjustments,
  type Clock,
  type Crypto,
  type Mailer,
  type PayoutProvider,
  type StatementInput,
  type StatementResult,
} from "@pms/core";
import {
  asSystem,
  DrizzleOwnerRepository,
  rawRows,
  sql,
  withoutTenant,
  type Db,
  type Tx,
} from "@pms/db";
import type { Logger } from "@pms/runtime";
import type { TxRunner } from "./channels.js";
import { pdfDataUri, textPdf } from "./statement-pdf.js";

export interface OwnerDeps {
  db: Db;
  clock: Clock;
  crypto: Crypto;
  log: Logger;
  mailer: Mailer;
  payouts: PayoutProvider;
  /** Base URL of the owner portal in statement mails. */
  appUrl?: string;
}

const repoFor = (deps: OwnerDeps, tx: Tx, orgId: string) =>
  new DrizzleOwnerRepository(tx, orgId, deps.crypto);
const money = (minor: number, currency: string): string =>
  `${Money.of(minor, currency).toDecimalString()} ${currency}`;

/**
 * Build the engine's input for one agreement key and period, entirely from the
 * recorded terms and the ledgers (AGR-3): nights, approved expenses, owner
 * stays, restatements of nights billed on sent statements, and the previous
 * statement's hold-back. Pure data out; the caller runs `computeStatement`.
 */
export async function statementInput(
  repo: DrizzleOwnerRepository,
  agreementKey: string,
  period: { from: string; to: string },
  asOf: string,
  currentDraftId: string | null,
): Promise<{
  input: StatementInput;
  ownerId: string;
  propertyId: string;
  previousId: string | null;
} | null> {
  const segments = await repo.segmentsFor(agreementKey, period);
  const latest = segments.at(-1);
  if (!latest) return null;
  const nights = (await Promise.all(segments.map((s) => repo.nightsFor(s, period)))).flat();
  // a night belongs to one segment: the terms in force on its date; dedupe across segments by (room, date)
  const seen = new Set<string>();
  const uniqueNights = nights.filter((n) => {
    const k = `${n.roomKey}:${n.date}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const expenses = (
    await Promise.all(segments.map((s) => repo.approvedExpensesFor(s, period, currentDraftId)))
  ).flat();
  const uniqueExpenses = expenses.filter((e, i) => expenses.findIndex((x) => x.id === e.id) === i);
  const ownerStays = await repo.ownerStayNightsFor(latest, period);
  const billed = await repo.billedNights(agreementKey);
  const current = await repo.currentNightStates([...new Set(billed.map((b) => b.bookingId))]);
  const already = await repo.billedAdjustmentIds(agreementKey, currentDraftId);
  const adjustments = restatementAdjustments(billed, current, asOf).filter(
    (a) => !already.has(a.id),
  );
  const previous = await repo.previousStatement(agreementKey, period.from);
  return {
    input: {
      period,
      currency: latest.currency,
      segments,
      nights: uniqueNights,
      expenses: uniqueExpenses,
      ownerStays,
      adjustments,
      holdBackReleasedMinor: previous ? Number(previous.totals.holdBackRetained ?? 0) : 0,
      ownerStayNightsUsedBefore: await repo.ownerStayNightsUsedBefore(
        latest.ownerId,
        latest.propertyId,
        period.from,
      ),
    },
    ownerId: latest.ownerId,
    propertyId: latest.propertyId,
    previousId: previous?.id ?? null,
  };
}

/** Review aids (STMT-5): what looks different from last period. */
export function anomalies(
  result: StatementResult,
  previous: { totals: Record<string, number> } | null,
): string[] {
  const out: string[] = [];
  const t = result.totals;
  if (t.netDue < 0) out.push("net due is negative: the owner owes the manager this period");
  if (previous) {
    const prevGross = Number(previous.totals.grossRevenue ?? 0);
    if (prevGross > 0 && Math.abs(t.grossRevenue - prevGross) / prevGross > 0.5)
      out.push(
        `gross revenue moved ${String(Math.round(((t.grossRevenue - prevGross) / prevGross) * 100))}% against the previous statement`,
      );
  }
  if (t.estimatedCommissionNights > 0)
    out.push(`${String(t.estimatedCommissionNights)} night(s) use an estimated OTA commission`);
  if (t.adjustments !== 0)
    out.push(`adjustments of ${String(t.adjustments)} minor units restate earlier statements`);
  if (result.lines.some((l) => l.kind === "expense" && l.basis.receipt === false))
    out.push("an expense without a receipt is billed");
  return out;
}

/** Generate (or regenerate) the draft for one agreement key and period. Idempotent: the same inputs write the same statement. */
export async function generateStatement(
  deps: OwnerDeps,
  orgId: string,
  agreementKey: string,
  period: { from: string; to: string },
  run: TxRunner = (fn) => asSystem(deps.db, orgId, fn),
): Promise<{ id: string; changed: boolean; netDue: number } | null> {
  const asOf = deps.clock.today("UTC").toString();
  return run(async (tx) => {
    const repo = repoFor(deps, tx, orgId);
    const [draft] = (await repo.statements({ agreementKey })).filter(
      (s) => s.periodFrom === period.from && s.state === "draft",
    );
    const built = await statementInput(repo, agreementKey, period, asOf, draft?.id ?? null);
    if (!built) return null;
    const result = computeStatement(built.input);
    const inputHash = deps.crypto.sha256Hex(JSON.stringify(built.input));
    const previous = built.previousId
      ? ((await repo.statements({ agreementKey })).find((s) => s.id === built.previousId) ?? null)
      : null;
    const saved = await repo.saveDraft({
      ownerId: built.ownerId,
      agreementKey,
      propertyId: built.propertyId,
      result,
      inputHash,
      nights: built.input.nights,
      anomalies: anomalies(result, previous),
      previousStatementId: built.previousId,
    });
    return { id: saved.id, changed: saved.changed, netDue: result.totals.netDue };
  });
}

/** The scheduled run (spec 17 §17.2): every agreement whose latest period has ended gets a draft; existing drafts are refreshed. */
export async function generateDueStatements(
  deps: OwnerDeps,
  orgId?: string,
): Promise<{ generated: number; refreshed: number }> {
  const orgs = orgId
    ? [orgId]
    : (
        await withoutTenant(deps.db, (tx) =>
          rawRows<{ org_id: string }>(tx, sql`select distinct org_id from owner_agreement`),
        )
      ).map((r) => r.org_id);
  const today = deps.clock.today("UTC").toString();
  const out = { generated: 0, refreshed: 0 };
  for (const org of orgs) {
    const keys = await asSystem(deps.db, org, async (tx) => {
      const repo = repoFor(deps, tx, org);
      const monthly = await repo.agreementKeysActive(periodEndingBefore("monthly", today));
      const fortnightly = await repo.agreementKeysActive(periodEndingBefore("fortnightly", today));
      return [
        ...monthly.filter((k) => k.frequency === "monthly"),
        ...fortnightly.filter((k) => k.frequency === "fortnightly"),
      ];
    });
    for (const k of keys) {
      const period = periodEndingBefore(k.frequency, today);
      const existing = await asSystem(deps.db, org, (tx) =>
        repoFor(deps, tx, org).statements({ agreementKey: k.agreementKey }),
      );
      const forPeriod = existing.find((s) => s.periodFrom === period.from);
      if (forPeriod && forPeriod.state !== "draft") continue;
      try {
        const r = await generateStatement(deps, org, k.agreementKey, period);
        if (!r) continue;
        if (forPeriod) {
          if (r.changed) out.refreshed++;
        } else out.generated++;
      } catch (e) {
        deps.log.warn(
          {
            orgId: org,
            agreementKey: k.agreementKey,
            err: e instanceof Error ? e.message : String(e),
          },
          "statement.generate.failed",
        );
      }
    }
  }
  return out;
}

/** Statement text for the PDF and the mail: every line, the segments and the basis printed (STMT-1, STMT-6). */
export function renderStatementText(
  st: {
    ownerName: string;
    propertyTitle: string;
    periodFrom: string;
    periodTo: string;
    currency: string;
    totals: Record<string, number>;
    segments: unknown[];
    warnings: string[];
  },
  lines: Array<{
    date: string;
    kind: string;
    description: string;
    amountMinor: number;
    agreementVersion: number;
  }>,
): string[] {
  const out: string[] = [];
  const to = new Date(Date.parse(st.periodTo) - 86_400_000).toISOString().slice(0, 10);
  out.push(
    `Owner: ${st.ownerName}`,
    `Property: ${st.propertyTitle}`,
    `Period: ${st.periodFrom} to ${to}`,
    `Currency: ${st.currency}`,
    "",
  );
  for (const seg of st.segments as Array<{
    version: number;
    from: string;
    to: string;
    commissionBasis: string;
    model: { kind: string; rateBps?: number; amountMinor?: number };
  }>) {
    const m = seg.model;
    const how =
      m.kind === "commission_pct"
        ? `${String((m.rateBps ?? 0) / 100)}% commission`
        : m.kind === "fixed_fee"
          ? `fixed fee ${money(m.amountMinor ?? 0, st.currency)}`
          : m.kind === "guaranteed_rent"
            ? `guaranteed rent ${money(m.amountMinor ?? 0, st.currency)}`
            : "tiered commission";
    out.push(
      `Agreement v${String(seg.version)} (${seg.from} to ${seg.to}): ${how} on ${seg.commissionBasis.replace(/_/g, " ")} basis`,
    );
  }
  out.push("", "Lines");
  for (const l of lines)
    out.push(
      `  ${l.date}  ${l.kind.padEnd(16)} ${l.description.slice(0, 60).padEnd(60)} ${money(l.amountMinor, st.currency).padStart(16)}`,
    );
  const t = st.totals;
  out.push(
    "",
    `Gross booking revenue          ${money(t.grossRevenue ?? 0, st.currency)}`,
    `- OTA commission               ${money(t.otaCommission ?? 0, st.currency)}`,
    `- Taxes withheld by OTA        ${money(t.withheldTax ?? 0, st.currency)}`,
    `= Revenue basis                ${money(t.revenueBasis ?? 0, st.currency)}`,
    `- Management fee               ${money(t.managementFee ?? 0, st.currency)}`,
    `- VAT on fee                   ${money(t.feeVat ?? 0, st.currency)}`,
    `- Rebillable expenses          ${money(t.expenses ?? 0, st.currency)}`,
    `+ Cleaning fees to owner       ${money(t.cleaning ?? 0, st.currency)}`,
    `- Owner stay charges           ${money(t.ownerStays ?? 0, st.currency)}`,
    `+/- Adjustments                ${money(t.adjustments ?? 0, st.currency)}`,
    `+ Hold-back released           ${money(t.holdBackReleased ?? 0, st.currency)}`,
    `- Hold-back retained           ${money(t.holdBackRetained ?? 0, st.currency)}`,
    `= Net due to owner             ${money(t.netDue ?? 0, st.currency)}`,
    `Payable now                    ${money(t.payable ?? 0, st.currency)}`,
  );
  if (st.warnings.length) out.push("", ...st.warnings.map((w) => `Note: ${w}`));
  return out;
}

/** STMT-5 send: PDF, portal (the row itself) and email; the state moves to `sent` and the statement freezes (INV-13). */
export async function sendStatement(
  deps: OwnerDeps,
  orgId: string,
  statementId: string,
  run: TxRunner = (fn) => asSystem(deps.db, orgId, fn),
): Promise<{ pdfBytes: number; mailedTo: string | null }> {
  return run(async (tx) => {
    const repo = repoFor(deps, tx, orgId);
    const st = await repo.statement(statementId);
    if (!st) throw new Error("statement not found");
    const owner = await repo.owner(st.ownerId);
    const text = renderStatementText(st, st.lines);
    const pdf = textPdf(text, { title: `Owner statement ${st.periodFrom.slice(0, 7)}` });
    await repo.markSent(statementId, pdfDataUri(pdf));
    let mailedTo: string | null = null;
    if (owner?.email) {
      mailedTo = owner.email;
      await deps.mailer.send({
        to: owner.email,
        template: "owner_statement",
        locale: owner.locale,
        params: {
          period: st.periodFrom.slice(0, 7),
          property: st.propertyTitle,
          netDue: money(Number(st.totals.netDue ?? 0), st.currency),
          portalUrl: `${deps.appUrl ?? ""}/owner/statements/${statementId}`,
        },
      });
    }
    return { pdfBytes: pdf.length, mailedTo };
  });
}

/** STMT-5: approved statements go out by themselves after N days when the org enables it (default 7). */
export async function autoSendStatements(deps: OwnerDeps, orgId?: string): Promise<number> {
  const orgs = orgId
    ? [orgId]
    : (
        await withoutTenant(deps.db, (tx) =>
          rawRows<{ org_id: string }>(
            tx,
            sql`select distinct org_id from owner_statement where state = 'approved'`,
          ),
        )
      ).map((r) => r.org_id);
  let sent = 0;
  for (const org of orgs) {
    const ids = await asSystem(deps.db, org, async (tx) => {
      const repo = repoFor(deps, tx, org);
      const enabled = (await repo.orgSetting("statement_auto_send")) !== "off";
      if (!enabled) return [];
      return repo.approvedOlderThan(
        Number((await repo.orgSetting("statement_auto_send_days")) ?? 7),
      );
    });
    for (const id of ids) {
      await sendStatement(deps, org, id);
      sent++;
    }
  }
  return sent;
}

/**
 * PAY-1/2: a payout moves money through the port (or records a manual transfer).
 * The provider call happens outside the transaction; the state lands afterwards.
 */
export async function executePayout(
  deps: OwnerDeps,
  orgId: string,
  payoutId: string,
): Promise<{ state: string; providerRef: string | null }> {
  const p = await asSystem(deps.db, orgId, async (tx) => {
    const repo = repoFor(deps, tx, orgId);
    const [row] = (await repo.payouts({})).filter((x) => x.id === payoutId);
    if (!row) throw new Error("payout not found");
    if (row.state !== "pending") throw new Error(`payout is ${row.state}`);
    const destination = await repo.payoutDestination(row.ownerId);
    return { ...row, destination };
  });
  if (p.method === "manual") {
    await asSystem(deps.db, orgId, (tx) =>
      repoFor(deps, tx, orgId).updatePayout(payoutId, { state: "paid", providerRef: p.reference }),
    );
    return { state: "paid", providerRef: p.reference };
  }
  if (!p.destination) {
    await asSystem(deps.db, orgId, (tx) =>
      repoFor(deps, tx, orgId).updatePayout(payoutId, {
        state: "failed",
        failureReason: "owner has no payout destination",
      }),
    );
    return { state: "failed", providerRef: null };
  }
  const outcome = await deps.payouts.createTransfer({
    payoutId,
    ownerId: p.ownerId,
    destinationRef: p.destination,
    amountMinor: p.amountMinor,
    currency: p.currency,
    description: `Owner statement ${p.statementId.slice(-6)}`,
    idempotencyKey: `payout:${payoutId}`,
  });
  await asSystem(deps.db, orgId, (tx) =>
    repoFor(deps, tx, orgId).updatePayout(payoutId, {
      state: outcome.state,
      providerRef: outcome.providerRef,
      failureReason: outcome.failureReason ?? null,
    }),
  );
  if (outcome.state === "failed")
    deps.log.error({ orgId, payoutId, reason: outcome.failureReason }, "payout.failed");
  return { state: outcome.state, providerRef: outcome.providerRef };
}

/** PAY-2: in-transit payouts are polled until the provider settles or fails them. */
export async function pollPayouts(
  deps: OwnerDeps,
  orgId?: string,
): Promise<{ paid: number; failed: number }> {
  const rows = await withoutTenant(deps.db, (tx) =>
    rawRows<{ id: string; org_id: string; provider_ref: string }>(
      tx,
      sql`select id, org_id, provider_ref from owner_payout where state = 'in_transit' and provider_ref is not null ${orgId ? sql`and org_id = ${orgId}` : sql``}`,
    ),
  );
  const out = { paid: 0, failed: 0 };
  for (const r of rows) {
    const o = await deps.payouts.getTransfer(r.provider_ref);
    if (o.state === "in_transit" || o.state === "pending") continue;
    await asSystem(deps.db, r.org_id, (tx) =>
      repoFor(deps, tx, r.org_id).updatePayout(r.id, {
        state: o.state,
        failureReason: o.failureReason ?? null,
      }),
    );
    if (o.state === "paid") out.paid++;
    else out.failed++;
  }
  return out;
}

/** Start a payout for a sent statement: four-eyes above the org threshold parks it as awaiting_approval (PAY-1). */
export async function initiatePayout(
  tx: Tx,
  orgId: string,
  crypto: Crypto,
  input: {
    statementId: string;
    method: "manual" | "provider";
    initiatedBy: string;
    reference: string | null;
    providerKind: string;
  },
): Promise<{ payoutId: string; awaitingApproval: boolean; amountMinor: number }> {
  const repo = new DrizzleOwnerRepository(tx, orgId, crypto);
  const st = await repo.statement(input.statementId);
  if (!st) throw new Error("statement not found");
  if (st.state !== "sent")
    throw new Error(`statement is ${st.state}; only a sent statement is paid`);
  if (st.payouts.some((p) => p.state !== "failed"))
    throw new Error("a payout already exists for this statement");
  const amount = Number(st.totals.payable ?? 0);
  if (amount <= 0) throw new Error("nothing payable on this statement");
  const awaitingApproval = fourEyesRequired(amount, await repo.fourEyesThreshold());
  const payoutId = await repo.createPayout({
    statementId: st.id,
    ownerId: st.ownerId,
    amountMinor: amount,
    currency: st.currency,
    method: input.method === "manual" ? "manual" : input.providerKind,
    initiatedBy: input.initiatedBy,
    awaitingApproval,
    reference: input.reference,
  });
  return { payoutId, awaitingApproval, amountMinor: amount };
}

/** Spec 08 §8.8 hook: a closed maintenance issue flagged for rebill becomes a submitted expense once. */
export async function expenseFromIssue(
  tx: Tx,
  orgId: string,
  crypto: Crypto,
  issueId: string,
  submittedBy: string | null,
): Promise<string | null> {
  const [i] = await rawRows<{
    property_id: string;
    unit_id: string | null;
    description: string;
    vendor: string | null;
    cost_minor: number | null;
    currency: string;
    owner_expense_id: string | null;
    closed_at: string | null;
  }>(
    tx,
    sql`select m.property_id, m.unit_id, m.description, m.vendor, m.cost_minor, p.currency, m.owner_expense_id, m.closed_at::text from maintenance_issue m join property p on p.id = m.property_id where m.id = ${issueId} and m.rebill_to_owner`,
  );
  if (!i || i.owner_expense_id || i.cost_minor === null) return null;
  const repo = new DrizzleOwnerRepository(tx, orgId, crypto);
  const date = (i.closed_at ?? new Date().toISOString()).slice(0, 10);
  return repo.createExpense({
    propertyId: i.property_id,
    unitId: i.unit_id,
    date,
    category: "maintenance",
    vendor: i.vendor,
    description: i.description,
    amountMinor: Number(i.cost_minor),
    currency: i.currency,
    receiptRef: null,
    rebillable: await repo.suggestRebillable(i.property_id, "maintenance", date),
    rebillReason: null,
    submittedBy,
    maintenanceIssueId: issueId,
  });
}
