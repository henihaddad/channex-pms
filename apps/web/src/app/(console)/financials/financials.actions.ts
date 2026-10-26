"use server";

import { moneyQueue, type MoneyQueue } from "@pms/jobs";
import { withPermission } from "@/server/with-permission";
import { container } from "@/server/container";

export type { MoneyQueue };

/** Spec 11 §11.6: what money needs from a person today, composed in `@pms/jobs`. */
export const loadFinancials = withPermission<[], MoneyQueue>(
  "statement:read",
  { scope: "organization", audit: false },
  async (ctx) => moneyQueue(await container(), ctx.tx, ctx.orgId),
);
