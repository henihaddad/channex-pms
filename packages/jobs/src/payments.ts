import type { Clock, PaymentProvider } from "@pms/core";
import {
  asSystem,
  duePayments,
  DrizzleBillingRepository,
  DrizzlePaymentRuleRepository,
  rawRows,
  sql,
  withoutTenant,
  type Db,
} from "@pms/db";
import type { Logger } from "@pms/runtime";

export interface PaymentsDeps {
  db: Db;
  payments: PaymentProvider;
  clock: Clock;
  log: Logger;
}

/**
 * payments.collect: charge the instalments the rules scheduled (spec 10 §10.4), once
 * their day has come. A booking that no longer exists, or was cancelled, has its
 * remaining instalments cancelled instead of charged. A decline is recorded on the
 * instalment and retried, up to the attempt cap the query applies.
 */
export async function collectDuePayments(
  deps: PaymentsDeps,
): Promise<{ charged: number; failed: number; cancelled: number }> {
  const today = deps.clock.now().toString().slice(0, 10);
  const due = await withoutTenant(deps.db, (tx) => duePayments(tx, today));
  let charged = 0;
  let failed = 0;
  let cancelled = 0;
  for (const item of due) {
    const booking = await asSystem(deps.db, item.orgId, (tx) =>
      rawRows<{ status: string; instrument: string | null }>(
        tx,
        sql`select b.status, pi.provider_ref as instrument
          from booking b left join payment_instrument pi on pi.booking_id = b.id
          where b.id = ${item.bookingId} limit 1`,
      ),
    );
    const row = booking[0];
    if (!row || row.status === "cancelled") {
      await asSystem(deps.db, item.orgId, (tx) =>
        new DrizzlePaymentRuleRepository(tx, item.orgId).cancelSchedule(item.bookingId),
      );
      cancelled++;
      continue;
    }
    try {
      const intent = await deps.payments.createIntent({
        amountMinor: item.amountMinor,
        currency: item.currency,
        paymentMethodToken: row.instrument ?? "",
        capture: "automatic",
        description: item.name,
        // one charge per instalment, whatever happens to this job
        idempotencyKey: `schedule:${item.id}`,
        metadata: { booking_id: item.bookingId, schedule_id: item.id },
      });
      const ok = intent.status === "succeeded" || intent.status === "requires_capture";
      await asSystem(deps.db, item.orgId, async (tx) => {
        await tx.execute(sql`update payment_schedule set
          state = ${ok ? "paid" : "failed"}, attempts = attempts + 1,
          last_error = ${ok ? null : (intent.failureReason ?? "declined")},
          settled_at = ${ok ? sql`now()` : null}
          where id = ${item.id}`);
        if (ok) {
          const billing = new DrizzleBillingRepository(tx, item.orgId);
          const folioId = await billing.ensureFolio(item.bookingId);
          await billing.addPayment(folioId, {
            method: "card",
            amountMinor: item.amountMinor,
            state: intent.status === "requires_capture" ? "held" : "captured",
            providerRef: intent.intentId,
          });
        }
      });
      if (ok) charged++;
      else failed++;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await asSystem(deps.db, item.orgId, (tx) =>
        tx.execute(
          sql`update payment_schedule set attempts = attempts + 1, last_error = ${message} where id = ${item.id}`,
        ),
      );
      failed++;
      deps.log.warn({ scheduleId: item.id, err: message }, "payments.collect.error");
    }
  }
  if (due.length > 0) deps.log.info({ charged, failed, cancelled }, "payments.collect.done");
  return { charged, failed, cancelled };
}
