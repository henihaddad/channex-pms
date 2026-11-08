"use server";

import {
  financialOverview,
  moneyQueue,
  transactions,
  type FinancialOverview,
  type MoneyQueue,
  type TransactionRow,
} from "@pms/jobs";
import { withPermission } from "@/server/with-permission";
import { container } from "@/server/container";

export type { FinancialOverview, MoneyQueue, TransactionRow };

/** Spec 11 §11.6: what money needs from a person today, composed in `@pms/jobs`. */
export const loadFinancials = withPermission<[], MoneyQueue>(
  "statement:read",
  { scope: "organization", audit: false },
  async (ctx) => moneyQueue(await container(), ctx.tx, ctx.orgId),
);

/** Spec 11 §11.5b: this month's money, revenue by month and the latest transactions. */
export const loadFinancialOverview = withPermission<[], FinancialOverview>(
  "statement:read",
  { scope: "organization", audit: false },
  async (ctx) => financialOverview(await container(), ctx.tx, ctx.orgId),
);

/** Every payment, refund, expense and owner payout, newest first. */
export const loadTransactions = withPermission<[], TransactionRow[]>(
  "statement:read",
  { scope: "organization", audit: false },
  async (ctx) => transactions(ctx.tx, 200),
);
