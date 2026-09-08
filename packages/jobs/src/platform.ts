import {
  draftInvoice,
  dunningStep,
  nextTenantState,
  pluginRetryDelayMs,
  pluginWants,
  quotaCheck,
  trialEndsOn,
  DEFAULT_PLUGIN_POLICY,
  LocalDate,
  type BillingProvider,
  type Clock,
  type Crypto,
  type Mailer,
  type Plan,
  type PluginManifest,
  type QuotaDecision,
  type TenantEvent,
  type WorkKind,
} from "@pms/core";
import {
  asSystem,
  DrizzleAuditWriter,
  DrizzleOperatorRepository,
  DrizzlePlatformRepository,
  rawRows,
  sql,
  withoutTenant,
  type Db,
  type Tx,
} from "@pms/db";
import type { Logger } from "@pms/runtime";
import type { TxRunner } from "./channels.js";

export interface PlatformDeps {
  db: Db;
  clock: Clock;
  crypto: Crypto;
  log: Logger;
  mailer: Mailer;
  billing: BillingProvider;
  /** The operator's own country for VAT (§12.5); defaults to PT. */
  sellerCountry?: string;
  /** Outbound HTTP for plugin deliveries; injectable for tests. */
  fetchImpl?: typeof fetch;
  appUrl?: string;
}

const repoFor = (deps: { crypto: Crypto }, tx: Tx, orgId: string) =>
  new DrizzlePlatformRepository(tx, orgId, deps.crypto);

// ---- lifecycle (§12.3) ------------------------------------------------------------------------------------

/** Apply a lifecycle event; illegal transitions are refused, never coerced. */
export async function transitionTenant(
  deps: { crypto: Crypto; clock: Clock },
  tx: Tx,
  orgId: string,
  event: TenantEvent,
  by: { type: "user" | "system" | "automation"; id: string },
): Promise<{ from: string; to: string } | null> {
  const repo = repoFor(deps, tx, orgId);
  const { state } = await repo.orgState();
  const to = nextTenantState(state, event);
  if (!to) return null;
  await repo.setOrgState(to);
  await new DrizzleAuditWriter(tx, (x) => deps.crypto.sha256Hex(x)).append({
    orgId: orgId as never,
    actor: by,
    action: `tenant:${event}`,
    subject: { kind: "organization", id: orgId },
    before: { state },
    after: { state: to },
    surface: "platform",
    occurredAt: deps.clock.now().toString(),
  });
  return { from: state, to };
}

/** Self-service plan choice (§12.5): the subscription row, the period, trial → active. */
export async function choosePlan(
  deps: PlatformDeps,
  orgId: string,
  input: {
    planKey: string;
    annual: boolean;
    addOns: string[];
    billingEmail: string;
    billingName: string;
    vatId: string | null;
    userId: string;
  },
  run: TxRunner,
): Promise<{ planId: string; periodTo: string }> {
  const today = deps.clock.today("UTC").toString();
  const chosen = await run(async (tx) => {
    const repo = repoFor(deps, tx, orgId);
    const plan = (await repo.plans()).find((p) => p.key === input.planKey);
    if (!plan) throw new Error(`unknown plan ${input.planKey}`);
    const org = await repo.orgState();
    const existing = await repo.subscription();
    const periodFrom = existing?.periodFrom ?? today;
    const periodTo =
      existing?.periodTo ?? LocalDate.parse(periodFrom).plusDays(monthDays(periodFrom)).toString();
    await repo.saveSubscription({
      planId: plan.id,
      annual: input.annual,
      addOns: input.addOns,
      country: org.country,
      periodFrom,
      periodTo,
      trialEndsOn: existing?.trialEndsOn ?? trialEndsOn(org.createdAt, plan.trialDays),
      billingEmail: input.billingEmail,
      billingName: input.billingName,
      vatId: input.vatId,
    });
    return { plan, org, periodTo };
  });
  // the provider call sits outside the transaction (ADR-0007); a failure here never touches data (BILL-1)
  const customer = await deps.billing.ensureCustomer({
    orgId,
    name: input.billingName,
    email: input.billingEmail,
    country: chosen.org.country,
    vatId: input.vatId,
    customerRef: null,
  });
  await run(async (tx) => {
    const repo = repoFor(deps, tx, orgId);
    await repo.updateSubscription({ customerRef: customer.customerRef });
    await transitionTenant(deps, tx, orgId, "plan_chosen", { type: "user", id: input.userId });
  });
  return { planId: chosen.plan.id, periodTo: chosen.periodTo };
}

/**
 * The customer at the billing provider we are actually talking to. A tenant that chose its
 * plan while the fake provider was wired (a demo, a self-hosted install before Stripe was
 * configured) carries a `cus_fake_…` reference no real provider knows: create the customer
 * for real and keep the new reference, rather than failing every card and every invoice.
 */
async function customerFor(deps: PlatformDeps, orgId: string, run: TxRunner): Promise<string> {
  const sub = await run((tx) => repoFor(deps, tx, orgId).subscription());
  if (!sub?.customerRef) throw new Error("choose a plan first");
  if (deps.billing.kind === "fake" || !sub.customerRef.startsWith("cus_fake_"))
    return sub.customerRef;
  const customer = await deps.billing.ensureCustomer({
    orgId,
    name: sub.billingName ?? orgId,
    email: sub.billingEmail ?? "",
    country: sub.country,
    vatId: sub.vatId,
    customerRef: null,
  });
  await run((tx) =>
    repoFor(deps, tx, orgId).updateSubscription({ customerRef: customer.customerRef }),
  );
  return customer.customerRef;
}

/**
 * The client secret the browser needs to set the card up: the one 3-D Secure challenge a
 * European card answers happens here, at the desk, not on an invoice charged off-session.
 */
export async function startCardSetup(
  deps: PlatformDeps,
  orgId: string,
  run: TxRunner,
): Promise<{ clientSecret: string }> {
  return deps.billing.startCardSetup(await customerFor(deps, orgId, run));
}

export async function attachPaymentMethod(
  deps: PlatformDeps,
  orgId: string,
  methodToken: string,
  run: TxRunner,
): Promise<{ brand: string; last4: string }> {
  const customerRef = await customerFor(deps, orgId, run);
  const method = await deps.billing.attachPaymentMethod(customerRef, methodToken);
  await run((tx) => repoFor(deps, tx, orgId).updateSubscription({ paymentMethod: method }));
  // a fresh card pays the open invoice straight away (dunning recovery)
  await collectOpenInvoice(deps, orgId, run);
  return { brand: method.brand, last4: method.last4 };
}

/**
 * Collect the open invoice: retry it at the provider when it exists there, or create it from
 * the stored draft when an outage kept it from ever reaching the provider (BILL-1). Returns
 * true when it is paid; a paid invoice clears dunning and reactivates the tenant.
 */
async function collectOpenInvoice(
  deps: PlatformDeps,
  orgId: string,
  run: TxRunner,
): Promise<boolean> {
  const open = await run(async (tx) => {
    const repo = repoFor(deps, tx, orgId);
    return { invoice: await repo.openInvoice(), sub: await repo.subscription() };
  });
  if (!open.invoice || !open.sub?.customerRef) return false;
  let result: { invoiceRef: string; state: string; pdfUrl: string | null; failureReason?: string };
  try {
    result = open.invoice.providerRef
      ? await deps.billing.retry(open.invoice.providerRef)
      : await deps.billing.charge({
          customerRef: open.sub.customerRef,
          draft: open.invoice.draft as never,
          idempotencyKey: `invoice:${orgId}:${open.invoice.periodFrom}`,
          description: `Channex PMS ${open.invoice.periodFrom} → ${open.invoice.periodTo}`,
        });
  } catch (e) {
    deps.log.warn(
      { orgId, err: e instanceof Error ? e.message : String(e) },
      "billing.collect.unavailable",
    );
    return false;
  }
  const paid = result.state === "paid";
  await run(async (tx) => {
    const repo = repoFor(deps, tx, orgId);
    await repo.markInvoice(open.invoice!.id, result.state, result.failureReason ?? null);
    if (result.invoiceRef && !open.invoice!.providerRef)
      await tx.execute(
        sql`update billing_invoice set provider_ref = ${result.invoiceRef}, pdf_url = ${result.pdfUrl} where id = ${open.invoice!.id}`,
      );
    if (paid) {
      await repo.updateSubscription({ paymentFailedOn: null, dunningRetries: 0 });
      await transitionTenant(deps, tx, orgId, "payment_recovered", {
        type: "system",
        id: "billing",
      });
    }
  });
  return paid;
}

function monthDays(from: string): number {
  const d = new Date(`${from}T00:00:00Z`);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
}

// ---- metering (§12.5) --------------------------------------------------------------------------------------

/** Nightly: one usage record per organization for today. */
export async function meterUsage(deps: PlatformDeps, orgId?: string): Promise<number> {
  const date = deps.clock.today("UTC").toString();
  const orgs = orgId
    ? [orgId]
    : await withoutTenant(deps.db, (tx) => new DrizzleOperatorRepository(tx).syncingOrgIds());
  let n = 0;
  for (const org of orgs) {
    await asSystem(deps.db, org, (tx) => repoFor(deps, tx, org).recordUsage(date));
    n++;
  }
  return n;
}

/** Quota decision for a piece of work in an org (QUOTA-1). Self-hosted (no subscription) has no quotas. */
export async function quotaFor(
  deps: { crypto: Crypto },
  tx: Tx,
  orgId: string,
  kind: WorkKind,
): Promise<QuotaDecision> {
  const repo = repoFor(deps, tx, orgId);
  const sub = await repo.subscription();
  if (!sub) return { allow: true, warnings: [] };
  const u = await repo.usageSnapshot();
  return quotaCheck(sub.plan.quotas, { ...u, apiRequestsLastMinute: 0, storageMb: 0 }, kind);
}

// ---- billing periods and dunning (§12.5) -------------------------------------------------------------------

/** Daily: close every period that ended, invoice it from usage, collect, and start the next period. */
export async function closeBillingPeriods(
  deps: PlatformDeps,
  orgId?: string,
): Promise<{ invoiced: number; failed: number }> {
  const today = deps.clock.today("UTC").toString();
  const orgs = orgId
    ? [orgId]
    : await withoutTenant(deps.db, (tx) => new DrizzleOperatorRepository(tx).syncingOrgIds());
  const out = { invoiced: 0, failed: 0 };
  for (const org of orgs) {
    const sub = await asSystem(deps.db, org, (tx) => repoFor(deps, tx, org).subscription());
    if (!sub || sub.periodTo > today) continue;
    const r = await invoicePeriod(
      deps,
      org,
      sub.plan,
      { from: sub.periodFrom, to: sub.periodTo },
      (fn) => asSystem(deps.db, org, fn),
    );
    if (r.state === "paid" || r.state === "open") out.invoiced++;
    else out.failed++;
    const nextFrom = sub.periodTo;
    const nextTo = LocalDate.parse(nextFrom).plusDays(monthDays(nextFrom)).toString();
    await asSystem(deps.db, org, (tx) =>
      repoFor(deps, tx, org).updateSubscription({ periodFrom: nextFrom, periodTo: nextTo }),
    );
  }
  return out;
}

export async function invoicePeriod(
  deps: PlatformDeps,
  orgId: string,
  plan: Plan,
  period: { from: string; to: string },
  run: TxRunner,
): Promise<{ invoiceId: string; state: string; totalMinor: number }> {
  const built = await run(async (tx) => {
    const repo = repoFor(deps, tx, orgId);
    const sub = await repo.subscription();
    if (!sub) throw new Error("no subscription");
    const records = (await repo.usage(period.from, period.to)).map((u) => ({ orgId, ...u }));
    const draft = draftInvoice({
      plan,
      records,
      period,
      addOns: sub.addOns,
      annual: sub.annual,
      sellerCountry: deps.sellerCountry ?? "PT",
      customer: { country: sub.country, vatId: sub.vatId },
    });
    return { draft, sub };
  });
  let result: { invoiceRef: string; state: string; pdfUrl: string | null; failureReason?: string };
  try {
    result = built.sub.customerRef
      ? await deps.billing.charge({
          customerRef: built.sub.customerRef,
          draft: built.draft,
          idempotencyKey: `invoice:${orgId}:${period.from}`,
          description: `Channex PMS ${period.from} → ${period.to}`,
        })
      : { invoiceRef: "", state: "open", pdfUrl: null, failureReason: "no_payment_method" };
  } catch (e) {
    // BILL-1: a billing outage leaves the invoice open and the tenant untouched
    deps.log.error(
      { orgId, err: e instanceof Error ? e.message : String(e) },
      "billing.charge.unavailable",
    );
    result = {
      invoiceRef: "",
      state: "open",
      pdfUrl: null,
      failureReason: "billing provider unavailable",
    };
  }
  return run(async (tx) => {
    const repo = repoFor(deps, tx, orgId);
    const invoiceId = await repo.saveInvoice({
      periodFrom: period.from,
      periodTo: period.to,
      currency: built.draft.currency,
      draft: built.draft as unknown as Record<string, unknown>,
      subtotalMinor: built.draft.subtotalMinor,
      vatMinor: built.draft.vat.amountMinor,
      totalMinor: built.draft.totalMinor,
      state: result.state,
      providerRef: result.invoiceRef || null,
      pdfUrl: result.pdfUrl,
      failureReason: result.failureReason ?? null,
    });
    if (result.state === "paid" || built.draft.totalMinor === 0) {
      await repo.updateSubscription({ paymentFailedOn: null, dunningRetries: 0 });
    } else if (result.state === "open" && !built.sub.paymentFailedOn) {
      await repo.updateSubscription({
        paymentFailedOn: deps.clock.today("UTC").toString(),
        dunningRetries: 0,
      });
      await transitionTenant(deps, tx, orgId, "payment_failed", { type: "system", id: "billing" });
      if (built.sub.billingEmail)
        await deps.mailer.send({
          to: built.sub.billingEmail,
          template: "billing_payment_failed",
          locale: "en",
          params: {
            amount: String(built.draft.totalMinor / 100),
            currency: built.draft.currency,
            url: `${deps.appUrl ?? ""}/settings/billing`,
          },
        });
    }
    return { invoiceId, state: result.state, totalMinor: built.draft.totalMinor };
  });
}

/** Daily dunning: retries on the schedule, escalating notices, suspension after the grace period. Sync never stops. */
export async function runDunning(
  deps: PlatformDeps,
  orgId?: string,
): Promise<{ retried: number; recovered: number; suspended: number; notified: number }> {
  const today = deps.clock.today("UTC").toString();
  const orgs = orgId
    ? [orgId]
    : await withoutTenant(deps.db, (tx) => new DrizzleOperatorRepository(tx).syncingOrgIds());
  const out = { retried: 0, recovered: 0, suspended: 0, notified: 0 };
  for (const org of orgs) {
    const sub = await asSystem(deps.db, org, (tx) => repoFor(deps, tx, org).subscription());
    if (!sub?.paymentFailedOn) continue;
    const step = dunningStep(sub.paymentFailedOn, sub.dunningRetries, today);
    if (step.kind === "none") continue;
    if (step.kind === "retry") {
      const paid = await collectOpenInvoice(deps, org, (fn) => asSystem(deps.db, org, fn));
      out.retried++;
      if (paid) out.recovered++;
      else {
        await asSystem(deps.db, org, (tx) =>
          repoFor(deps, tx, org).updateSubscription({ dunningRetries: step.attempt }),
        );
        if (sub.billingEmail) {
          await deps.mailer.send({
            to: sub.billingEmail,
            template: "billing_dunning",
            locale: "en",
            params: { attempt: String(step.attempt), url: `${deps.appUrl ?? ""}/settings/billing` },
          });
          out.notified++;
        }
      }
    } else if (step.kind === "suspend") {
      const t = await asSystem(deps.db, org, (tx) =>
        transitionTenant(deps, tx, org, "dunning_exhausted", { type: "system", id: "billing" }),
      );
      if (t) {
        out.suspended++;
        if (sub.billingEmail)
          await deps.mailer.send({
            to: sub.billingEmail,
            template: "billing_suspended",
            locale: "en",
            params: { url: `${deps.appUrl ?? ""}/settings/billing` },
          });
      }
    }
  }
  return out;
}

/** Trials that ran out become `expired` (console closed, sync running) until a plan is chosen. */
export async function expireTrials(deps: PlatformDeps): Promise<number> {
  const today = deps.clock.today("UTC").toString();
  const rows = await withoutTenant(deps.db, (tx) =>
    rawRows<{ id: string; ends: string | null }>(
      tx,
      sql`select o.id, s.trial_ends_on::text as ends from organization o left join subscription s on s.org_id = o.id where o.state = 'trial' and o.archived_at is null`,
    ),
  );
  let n = 0;
  for (const r of rows) {
    const [plan] = await withoutTenant(deps.db, (tx) =>
      rawRows<{ trial_days: number }>(tx, sql`select trial_days from plan where key = 'starter'`),
    );
    const org = await asSystem(deps.db, r.id, (tx) => repoFor(deps, tx, r.id).orgState());
    const ends = r.ends ?? trialEndsOn(org.createdAt, Number(plan?.trial_days ?? 14));
    if (ends > today) continue;
    if (
      await asSystem(deps.db, r.id, (tx) =>
        transitionTenant(deps, tx, r.id, "trial_ended", { type: "system", id: "billing" }),
      )
    )
      n++;
  }
  return n;
}

// ---- plugins (§12.7, ADR-0004) -----------------------------------------------------------------------------

/** Move each plugin's outbox cursor forward and queue deliveries for the events it wants; then deliver what is due. */
export async function deliverPluginEvents(
  deps: PlatformDeps,
  orgId?: string,
): Promise<{ queued: number; delivered: number; failed: number }> {
  const nowIso = deps.clock.now().toString();
  const orgs = orgId
    ? [orgId]
    : (
        await withoutTenant(deps.db, (tx) =>
          rawRows<{ org_id: string }>(tx, sql`select distinct org_id from plugin where enabled`),
        )
      ).map((r) => r.org_id);
  const out = { queued: 0, delivered: 0, failed: 0 };
  for (const org of orgs) {
    out.queued += await asSystem(deps.db, org, async (tx) => {
      const repo = repoFor(deps, tx, org);
      let queued = 0;
      for (const plugin of (await repo.plugins()).filter((p) => p.enabled)) {
        const events = await repo.eventsAfterCursor(plugin);
        for (const e of events) {
          if (pluginWants(plugin.manifest, e.type)) {
            await repo.queueDelivery(plugin.id, e.id, e.type, nowIso);
            queued++;
          }
        }
        const last = events.at(-1);
        if (last) await repo.moveCursor(plugin.id, last.occurredAt, last.id);
      }
      return queued;
    });
    const due = await asSystem(deps.db, org, (tx) => repoFor(deps, tx, org).dueDeliveries(nowIso));
    for (const d of due) {
      const r = await deliverOne(deps, org, d);
      if (r) out.delivered++;
      else out.failed++;
    }
  }
  return out;
}

async function deliverOne(
  deps: PlatformDeps,
  orgId: string,
  d: { id: string; pluginId: string; eventId: string; eventType: string; attempts: number },
): Promise<boolean> {
  const policy = DEFAULT_PLUGIN_POLICY;
  const prepared = await asSystem(deps.db, orgId, async (tx) => {
    const repo = repoFor(deps, tx, orgId);
    const plugin = (await repo.plugins()).find((p) => p.id === d.pluginId);
    const event = await repo.eventById(d.eventId);
    const secret = await repo.pluginSecret(d.pluginId);
    return plugin && event && secret ? { plugin, event, secret } : null;
  });
  if (!prepared) {
    await asSystem(deps.db, orgId, (tx) =>
      repoFor(deps, tx, orgId).markDelivery(d.id, {
        state: "dead",
        status: null,
        error: "plugin or event missing",
        nextAttemptAt: null,
      }),
    );
    return false;
  }
  const body = JSON.stringify(prepared.event);
  const timestamp = String(Math.floor(Date.parse(deps.clock.now().toString()) / 1000));
  const signature = `v1=${await hmacSha256Hex(prepared.secret, `v1.${timestamp}.${body}`)}`;
  const fetchImpl = deps.fetchImpl ?? fetch;
  let status: number | null = null;
  let error: string | null = null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), policy.timeoutMs);
    const res = await fetchImpl(prepared.plugin.endpointUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-pms-signature": signature,
        "x-pms-timestamp": timestamp,
        "x-pms-delivery": d.id,
        "x-pms-event": d.eventType,
      },
      body,
      signal: controller.signal,
    });
    clearTimeout(timer);
    status = res.status;
    if (res.status >= 400) error = `HTTP ${String(res.status)}`;
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  const ok = error === null;
  const attempts = d.attempts + 1;
  const dead = !ok && attempts >= policy.maxAttempts;
  await asSystem(deps.db, orgId, async (tx) => {
    const repo = repoFor(deps, tx, orgId);
    await repo.markDelivery(d.id, {
      state: ok ? "delivered" : dead ? "dead" : "failed",
      status,
      error,
      nextAttemptAt:
        ok || dead
          ? null
          : new Date(
              Date.parse(deps.clock.now().toString()) + pluginRetryDelayMs(attempts),
            ).toISOString(),
    });
    const failures = ok ? 0 : prepared.plugin.consecutiveFailures + 1;
    await repo.pluginOutcome(
      d.pluginId,
      ok,
      failures >= policy.breakerThreshold
        ? new Date(Date.parse(deps.clock.now().toString()) + policy.breakerCooldownMs).toISOString()
        : null,
    );
  });
  if (!ok) deps.log.warn({ orgId, pluginId: d.pluginId, status, error }, "plugin.deliver.failed");
  return ok;
}

async function hmacSha256Hex(secret: string, input: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(input));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Install from a manifest the plugin serves at `<endpoint>/manifest`, or one pasted in. */
export async function installPlugin(
  deps: { crypto: Crypto; clock: Clock },
  tx: Tx,
  orgId: string,
  input: {
    manifest: PluginManifest;
    endpointUrl: string;
    config: Record<string, unknown>;
    installedBy: string;
  },
): Promise<{ id: string; secret: string }> {
  const secret = deps.crypto.randomToken(32);
  const id = await repoFor(deps, tx, orgId).installPlugin({
    ...input,
    secret,
    cursorAt: deps.clock.now().toString(),
  });
  return { id, secret };
}

// ---- offboarding (§12.3) -----------------------------------------------------------------------------------

/** Build every requested export: the documented JSON bundle, ready for 30 days. */
export async function runExports(deps: PlatformDeps, orgId?: string): Promise<number> {
  const orgs = orgId
    ? [orgId]
    : (
        await withoutTenant(deps.db, (tx) =>
          rawRows<{ org_id: string }>(
            tx,
            sql`select distinct org_id from data_export where state = 'requested'`,
          ),
        )
      ).map((r) => r.org_id);
  let n = 0;
  for (const org of orgs)
    n += await asSystem(deps.db, org, async (tx) => {
      const repo = repoFor(deps, tx, org);
      let done = 0;
      for (const id of await repo.pendingExports()) {
        const tables = await repo.exportTables();
        const counts = Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, v.length]));
        const bundle = JSON.stringify(
          {
            format: "channex-pms-export/1",
            exportedAt: deps.clock.now().toString(),
            organization: org,
            counts,
            tables,
          },
          null,
          1,
        );
        await repo.completeExport(
          id,
          bundle,
          counts,
          new Date(Date.parse(deps.clock.now().toString()) + 30 * 86_400_000).toISOString(),
        );
        done++;
      }
      return done;
    });
  return n;
}

/** Tenants offboarding for longer than the grace period are purged; the certificate is the audit row on the operator log. */
export async function purgeOffboardedTenants(deps: PlatformDeps, graceDays = 30): Promise<number> {
  const cutoff = new Date(
    Date.parse(deps.clock.now().toString()) - graceDays * 86_400_000,
  ).toISOString();
  const rows = await withoutTenant(deps.db, (tx) =>
    rawRows<{ id: string }>(
      tx,
      sql`select id from organization where state = 'offboarding' and archived_at is null and updated_at <= ${cutoff}::timestamptz`,
    ),
  );
  let n = 0;
  for (const r of rows) {
    const done = await withoutTenant(deps.db, (tx) =>
      new DrizzleOperatorRepository(tx).purgeTenant(r.id),
    );
    await withoutTenant(deps.db, (tx) =>
      new DrizzleOperatorRepository(tx).audit({
        operatorId: "00000000-0000-0000-0000-000000000000",
        orgId: r.id,
        action: "tenant:purged",
        subject: { kind: "organization", id: r.id },
        detail: { tables: done.tables, certificate: `deleted ${deps.clock.now().toString()}` },
      }),
    );
    n++;
  }
  return n;
}

// ---- operator job requests (§12.1) ---------------------------------------------------------------------------

/** The worker drains operator-requested jobs; the handlers are injected so this file stays free of every other module. */
export async function processJobRequests(
  deps: PlatformDeps,
  handlers: Record<
    string,
    (orgId: string | null, args: Record<string, unknown>) => Promise<Record<string, unknown>>
  >,
): Promise<number> {
  let n = 0;
  for (;;) {
    const job = await withoutTenant(deps.db, (tx) =>
      new DrizzleOperatorRepository(tx).claimJobRequest(),
    );
    if (!job) return n;
    const handler = handlers[job.kind];
    let ok = true;
    let result: Record<string, unknown>;
    try {
      result = handler ? await handler(job.orgId, job.args) : { error: `unknown job ${job.kind}` };
      ok = Boolean(handler);
    } catch (e) {
      ok = false;
      result = { error: e instanceof Error ? e.message : String(e) };
    }
    await withoutTenant(deps.db, (tx) =>
      new DrizzleOperatorRepository(tx).finishJobRequest(job.id, ok, result),
    );
    n++;
  }
}

/** Impersonation caps (spec 02 §2.7): 60 minutes, read-only unless approved, break-glass needs two operators. */
export const IMPERSONATION = { capMinutes: 60 };
