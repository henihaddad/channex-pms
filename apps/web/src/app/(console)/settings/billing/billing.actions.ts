"use server";

import { revalidatePath } from "next/cache";
import { DrizzlePlatformRepository, type InvoiceRow, type SubscriptionRow } from "@pms/db";
import { attachPaymentMethod, choosePlan, transitionTenant } from "@pms/jobs";
import type { Plan } from "@pms/core";
import { withPermission } from "@/server/with-permission";
import { container } from "@/server/container";

export interface BillingView {
  hosted: boolean;
  state: string;
  createdAt: string;
  plans: Plan[];
  subscription: SubscriptionRow | null;
  usage: { activeUnits: number; properties: number; users: number };
  peak: number;
  invoices: InvoiceRow[];
  exports: Array<{
    id: string;
    state: string;
    bytes: number | null;
    readyAt: string | null;
    createdAt: string;
  }>;
  quota: { warnings: string[]; exceeded: string | null };
}

const str = (fd: FormData, k: string): string => String(fd.get(k) ?? "").trim();

export const loadBilling = withPermission<[], BillingView>(
  "billing:read",
  { scope: "organization", audit: false },
  async (ctx) => {
    const c = await container();
    const repo = new DrizzlePlatformRepository(ctx.tx, ctx.orgId, c.crypto);
    const org = await repo.orgState();
    const subscription = await repo.subscription();
    const usage = await repo.usageSnapshot();
    const records = subscription
      ? await repo.usage(subscription.periodFrom, subscription.periodTo)
      : [];
    const peak = Math.max(usage.activeUnits, ...records.map((r) => r.activeUnits));
    const { quotaCheck } = await import("@pms/core");
    const q = subscription
      ? quotaCheck(
          subscription.plan.quotas,
          { ...usage, apiRequestsLastMinute: 0, storageMb: 0 },
          "report",
        )
      : { allow: true as const, warnings: [] };
    return {
      hosted: c.hosted,
      state: org.state,
      createdAt: org.createdAt,
      plans: await repo.plans(),
      subscription,
      usage: { activeUnits: usage.activeUnits, properties: usage.properties, users: usage.users },
      peak,
      invoices: await repo.invoices(),
      exports: await repo.exports(),
      quota: { warnings: q.warnings, exceeded: q.allow ? null : q.reason },
    };
  },
);

/** Self-service plan choice (§12.5). The provider call sits between two transactions of the same action. */
export const choosePlanAction = withPermission<[FormData], void>(
  "billing:manage",
  {
    scope: "organization",
    subject: () => ({ kind: "subscription", id: "current" }),
    auditInput: (fd) => ({ plan: fd.get("planKey") }),
  },
  async (ctx, fd) => {
    const c = await container();
    await choosePlan(
      {
        db: c.db.db,
        clock: c.clock,
        crypto: c.crypto,
        log: c.log,
        mailer: c.mailer,
        billing: c.billing,
        appUrl: c.config.NEXT_PUBLIC_APP_URL,
      },
      ctx.orgId,
      {
        planKey: str(fd, "planKey"),
        annual: fd.get("annual") === "on",
        addOns: fd.getAll("addOn").map(String),
        billingEmail: str(fd, "billingEmail"),
        billingName: str(fd, "billingName"),
        vatId: str(fd, "vatId") || null,
        userId: ctx.userId,
      },
      (fn) => fn(ctx.tx),
    );
    revalidatePath("/settings/billing");
  },
);

export const attachCardAction = withPermission<[FormData], void>(
  "billing:manage",
  {
    scope: "organization",
    subject: () => ({ kind: "subscription", id: "current" }),
    redact: ["cardToken"],
  },
  async (ctx, fd) => {
    const c = await container();
    await attachPaymentMethod(
      {
        db: c.db.db,
        clock: c.clock,
        crypto: c.crypto,
        log: c.log,
        mailer: c.mailer,
        billing: c.billing,
      },
      ctx.orgId,
      str(fd, "cardToken"),
      (fn) => fn(ctx.tx),
    );
    revalidatePath("/settings/billing");
  },
);

export const cancelSubscriptionAction = withPermission<[FormData], void>(
  "billing:manage",
  { scope: "organization", subject: () => ({ kind: "subscription", id: "current" }) },
  async (ctx) => {
    const c = await container();
    await new DrizzlePlatformRepository(ctx.tx, ctx.orgId, c.crypto).updateSubscription({
      cancelAtPeriodEnd: true,
    });
    revalidatePath("/settings/billing");
  },
);

/** Offboarding (§12.3): everything exportable, unaided. */
export const requestExportAction = withPermission<[FormData], void>(
  "export:execute",
  { scope: "organization", subject: () => ({ kind: "data_export", id: "new" }) },
  async (ctx) => {
    const c = await container();
    await new DrizzlePlatformRepository(ctx.tx, ctx.orgId, c.crypto).requestExport(ctx.userId);
    revalidatePath("/settings/billing");
  },
);

/** Leaving: the console closes, sync stops, purge after 30 days. Step-up: this is the one irreversible button. */
export const leavePlatformAction = withPermission<[FormData], void>(
  "org:delete",
  { scope: "organization", subject: () => ({ kind: "organization", id: "current" }) },
  async (ctx) => {
    const c = await container();
    await transitionTenant(c, ctx.tx, ctx.orgId, "offboarding_requested", {
      type: "user",
      id: ctx.userId,
    });
    revalidatePath("/settings/billing");
  },
);
