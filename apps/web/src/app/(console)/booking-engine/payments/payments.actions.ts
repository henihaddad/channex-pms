"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Id, planPayments, type PaymentRule } from "@pms/core";
import { DrizzlePaymentRuleRepository, DrizzlePropertyRepository } from "@pms/db";
import { withPermission } from "@/server/with-permission";

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

export interface PaymentRulesView {
  rules: PaymentRule[];
  properties: Array<{ id: string; title: string }>;
  /** A worked example on a 1000.00 stay, so the effect of the rules is visible. */
  example: Array<{ name: string; dueOn: string; amountMinor: number }>;
  currency: string;
}

export const loadPaymentRules = withPermission<[], PaymentRulesView>(
  "folio:read",
  { scope: "organization", audit: false },
  async (ctx) => {
    const repo = new DrizzlePaymentRuleRepository(ctx.tx, ctx.orgId);
    const rules = await repo.listRules();
    const properties = (await new DrizzlePropertyRepository(ctx.tx, ctx.orgId).list()).map((p) => ({
      id: p.id,
      title: p.title,
    }));
    const today = new Date().toISOString().slice(0, 10);
    const arrival = new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10);
    return {
      rules,
      properties,
      currency: "EUR",
      example: planPayments({
        rules,
        totalMinor: 100_000,
        currency: "EUR",
        propertyId: properties[0]?.id ?? "",
        channel: "direct",
        arrival,
        bookedOn: today,
      }),
    };
  },
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
    revalidatePath("/booking-engine/payments");
  },
);

export const deletePaymentRule = withPermission<[{ id: string }], void>(
  "payment:capture",
  { scope: "organization", subject: (i) => ({ kind: "payment_rule", id: i.id }) },
  async (ctx, { id }) => {
    await new DrizzlePaymentRuleRepository(ctx.tx, ctx.orgId).deleteRule(id);
    revalidatePath("/booking-engine/payments");
  },
);
