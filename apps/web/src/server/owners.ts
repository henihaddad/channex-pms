import { Id, type AgreementTerms, type ExpenseCategory } from "@pms/core";
import {
  DrizzleMessagingRepository,
  DrizzleOwnerRepository,
  enqueueOutbox,
  rawRows,
  sql,
  type OwnerRow,
} from "@pms/db";
import { executePayout } from "@pms/jobs";
import type { ActorCtx } from "./with-permission";
import { container } from "./container";
import { HttpProblem } from "./errors";

export async function owners(ctx: ActorCtx): Promise<DrizzleOwnerRepository> {
  const c = await container();
  return new DrizzleOwnerRepository(ctx.tx, ctx.orgId, c.crypto);
}

/** OWN-3 / RBAC-9: a portal handler starts from the owner this login belongs to, or 403. */
export async function portalOwner(ctx: ActorCtx): Promise<OwnerRow> {
  const o = await (await owners(ctx)).ownerForUser(ctx.userId);
  if (!o) throw new HttpProblem(403, "not_an_owner", "This login is not linked to an owner");
  return o;
}

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  "cleaning",
  "consumables",
  "maintenance",
  "linen",
  "other",
];

/** Agreement terms from the agreement form (spec 17 §17.1). Numbers arrive as decimals and become minor units or basis points here. */
export function termsFromForm(
  fd: FormData,
  currency: string,
): Omit<AgreementTerms, "id" | "version"> {
  const str = (k: string) => String(fd.get(k) ?? "").trim();
  const pctBps = (k: string) => Math.round(Number(str(k) || 0) * 100);
  const minor = (k: string) => Math.round(Number(str(k) || 0) * 100);
  const modelKind = str("model");
  const model: AgreementTerms["model"] =
    modelKind === "fixed_fee"
      ? { kind: "fixed_fee", amountMinor: minor("fixedFee") }
      : modelKind === "guaranteed_rent"
        ? { kind: "guaranteed_rent", amountMinor: minor("guaranteedRent") }
        : modelKind === "tiered"
          ? {
              kind: "tiered",
              tiers: [
                { uptoMinor: minor("tier1Upto"), rateBps: pctBps("tier1Rate") },
                { uptoMinor: null, rateBps: pctBps("tier2Rate") },
              ],
            }
          : { kind: "commission_pct", rateBps: pctBps("commissionPct") };
  const deductibles: AgreementTerms["deductibles"] = {};
  for (const cat of EXPENSE_CATEGORIES) {
    const rule = str(`deductible_${cat}`);
    deductibles[cat] =
      rule === "absorbed"
        ? { kind: "absorbed" }
        : rule === "marked_up"
          ? { kind: "marked_up", markupBps: pctBps(`markup_${cat}`) }
          : { kind: "at_cost" };
  }
  const cleaning = str("cleaningFees");
  const stays = str("ownerStays");
  const unitIds = fd.getAll("unitIds").map(String).filter(Boolean);
  const allowance = str("ownerStayAllowanceNights");
  return {
    ownerId: str("ownerId"),
    propertyId: str("propertyId"),
    unitIds: unitIds.length ? unitIds : null,
    model,
    commissionBasis: (["gross", "net_of_ota_commission", "net_of_tax"].includes(
      str("commissionBasis"),
    )
      ? str("commissionBasis")
      : "net_of_ota_commission") as AgreementTerms["commissionBasis"],
    deductibles,
    cleaningFees:
      cleaning === "passed"
        ? { kind: "passed" }
        : cleaning === "split"
          ? { kind: "split", ownerBps: pctBps("cleaningOwnerPct") }
          : { kind: "kept" },
    ownerStays:
      stays === "at_cost"
        ? { kind: "at_cost", nightlyMinor: minor("ownerStayNightly") }
        : stays === "rate"
          ? { kind: "rate", nightlyMinor: minor("ownerStayNightly") }
          : { kind: "free" },
    ownerStayAllowanceNights: allowance === "" ? null : Number(allowance),
    payout: {
      frequency: str("payoutFrequency") === "fortnightly" ? "fortnightly" : "monthly",
      dayOfMonth: Number(str("payoutDay") || 5),
      minimumMinor: minor("payoutMinimum"),
      holdBackBps: pctBps("holdBackPct"),
    },
    vat: { onFee: fd.get("vatOnFee") === "on", rateBps: pctBps("vatRate") },
    currency,
    effectiveFrom: str("effectiveFrom"),
    effectiveTo: str("effectiveTo") || null,
  };
}

export async function propertyCurrency(ctx: ActorCtx, propertyId: string): Promise<string> {
  const [p] = await rawRows<{ currency: string }>(
    ctx.tx,
    sql`select currency from property where id = ${propertyId}`,
  );
  if (!p) throw new HttpProblem(404, "not_found", "Property not found");
  return p.currency;
}

/** PORT-2: owner actions notify the responsible manager through the outbox like any other actor's. */
export async function notifyManager(
  ctx: ActorCtx,
  kind: string,
  text: string,
  ref: Record<string, unknown>,
): Promise<void> {
  await enqueueOutbox(ctx.tx, {
    type: `notify.${kind}`,
    orgId: ctx.orgId as Id,
    aggregate: { kind: "notification", id: Id.next() },
    payload: { kind, to: null, text, ref },
    occurredAt: new Date().toISOString(),
    dedupeKey: `notify:${kind}:${JSON.stringify(ref)}:${String(Date.now())}`,
  });
}

export const money = (minor: number, currency: string): string =>
  `${(minor / 100).toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;

/** Test hooks and the drain: run a queued payout now. */
export async function runPayoutNow(orgId: string, payoutId: string): Promise<void> {
  const c = await container();
  await executePayout(
    {
      db: c.db.db,
      clock: c.clock,
      crypto: c.crypto,
      log: c.log,
      mailer: c.mailer,
      payouts: c.payouts,
    },
    orgId,
    payoutId,
  );
}

/** Dispute threads land in the inbox as a `owner` conversation (ADR-0003). */
export async function openDisputeThread(
  ctx: ActorCtx,
  statementId: string,
  ownerName: string,
  body: string,
): Promise<string> {
  const c = await container();
  const repo = await owners(ctx);
  const st = await repo.statement(statementId);
  if (!st) throw new HttpProblem(404, "not_found", "Statement not found");
  const msgs = new DrizzleMessagingRepository(ctx.tx, ctx.orgId, c.crypto);
  const { threadId } = await msgs.upsertFromProvider(
    st.propertyId,
    {
      id: `dispute:${statementId}`,
      provider: "owner",
      guestName: ownerName,
      kind: "inquiry",
      state: "open",
      updatedAt: new Date().toISOString(),
      messages: [
        {
          id: `dispute:${statementId}:${String(Date.now())}`,
          direction: "inbound",
          authorType: "guest",
          body: `Statement ${st.periodFrom.slice(0, 7)} disputed: ${body}`,
          sentAt: new Date().toISOString(),
        },
      ],
    },
    new Date().toISOString(),
  );
  await msgs.setTags(threadId, ["dispute", `statement:${statementId.slice(-6)}`]);
  await repo.setDispute(statementId, "open", threadId);
  return threadId;
}
