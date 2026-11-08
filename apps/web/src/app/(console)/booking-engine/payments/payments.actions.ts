"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Id } from "@pms/core";
import { DrizzlePaymentRuleRepository } from "@pms/db";
import { paymentRulesView, type PaymentRulesView } from "@pms/jobs";
import { withPermission } from "@/server/with-permission";
import { container } from "@/server/container";

const ruleSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(120),
  trigger: z.enum(["confirmation", "before_arrival", "after_arrival"]),
  offsetDays: z.coerce.number().int().min(0).max(365),
  amountKind: z.enum(["percent", "fixed", "remainder"]),
  /** Percent as people write it (30 = 30%), or an amount in the plan's currency. */
  amountValue: z.coerce.number().min(0),
  propertyIds: z.array(z.string()).default([]),
  channels: z.array(z.string()).default([]),
  enabled: z.coerce.boolean().default(true),
  position: z.coerce.number().int().min(0).max(99).default(0),
});

export type { PaymentRulesView };

/** Spec 10 §10.4: the rules, what they collected and a worked example, composed in `@pms/jobs`. */
export const loadPaymentRules = withPermission<[], PaymentRulesView>(
  "folio:read",
  { scope: "organization", audit: false },
  async (ctx) =>
    paymentRulesView(
      { ...(await container()), stripeConfigured: Boolean(process.env.STRIPE_SECRET_KEY) },
      ctx.tx,
      ctx.orgId,
    ),
);

export const savePaymentRule = withPermission<[z.input<typeof ruleSchema>], void>(
  "payment:capture",
  {
    scope: "organization",
    schema: ruleSchema,
    subject: (i) => ({ kind: "payment_rule", id: i.id ?? "new" }),
  },
  async (ctx, input) => {
    const r = ruleSchema.parse(input);
    await new DrizzlePaymentRuleRepository(ctx.tx, ctx.orgId).saveRule({
      id: r.id || Id.next(),
      name: r.name,
      trigger: r.trigger,
      offsetDays: r.offsetDays,
      amount:
        r.amountKind === "percent"
          ? { kind: "percent", percentBps: Math.round(r.amountValue * 100) }
          : r.amountKind === "fixed"
            ? { kind: "fixed", amountMinor: Math.round(r.amountValue * 100) }
            : { kind: "remainder" },
      propertyIds: r.propertyIds,
      channels: r.channels,
      enabled: r.enabled,
      position: r.position,
    });
    revalidatePath("/financials/payment-rules");
  },
);

export const deletePaymentRule = withPermission<[{ id: string }], void>(
  "payment:capture",
  { scope: "organization", subject: (i) => ({ kind: "payment_rule", id: i.id }) },
  async (ctx, { id }) => {
    await new DrizzlePaymentRuleRepository(ctx.tx, ctx.orgId).deleteRule(id);
    revalidatePath("/financials/payment-rules");
  },
);
