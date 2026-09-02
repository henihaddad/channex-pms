import { and, desc, eq, sql } from "drizzle-orm";
import { Id, type Crypto, type Plan, type PluginManifest, type TenantState } from "@pms/core";
import * as s from "../schema/index.js";
import { rawRows, type Tx } from "../tenant.js";
import type { Db } from "../client.js";
import { ORG_TABLES } from "../schema/registry.js";

const num = (v: unknown): number => Number(v ?? 0);

export interface SubscriptionRow {
  orgId: string;
  planId: string;
  plan: Plan;
  annual: boolean;
  addOns: string[];
  customerRef: string | null;
  paymentMethod: { methodRef: string; brand: string; last4: string } | null;
  billingEmail: string | null;
  billingName: string | null;
  vatId: string | null;
  country: string;
  periodFrom: string;
  periodTo: string;
  trialEndsOn: string | null;
  paymentFailedOn: string | null;
  dunningRetries: number;
  cancelAtPeriodEnd: boolean;
}

export interface InvoiceRow {
  id: string;
  periodFrom: string;
  periodTo: string;
  currency: string;
  draft: Record<string, unknown>;
  subtotalMinor: number;
  vatMinor: number;
  totalMinor: number;
  state: string;
  providerRef: string | null;
  pdfUrl: string | null;
  failureReason: string | null;
  issuedAt: string;
  paidAt: string | null;
}

export interface PluginRow {
  id: string;
  key: string;
  manifest: PluginManifest;
  endpointUrl: string;
  config: Record<string, unknown>;
  enabled: boolean;
  cursorAt: string | null;
  cursorId: string | null;
  consecutiveFailures: number;
  breakerOpenUntil: string | null;
  createdAt: string;
}

export interface ImpersonationRow {
  id: string;
  orgId: string;
  orgName: string;
  operatorId: string;
  reason: string;
  state: string;
  writeApproved: boolean;
  breakGlass: boolean;
  secondOperatorId: string | null;
  approvedBy: string | null;
  startedAt: string | null;
  expiresAt: string | null;
  endedAt: string | null;
  transcript: Array<{ at: string; action: string; subject: string }>;
  createdAt: string;
}

function planFrom(r: typeof s.plan.$inferSelect): Plan {
  return {
    id: r.id,
    key: r.key,
    name: r.name,
    currency: r.currency,
    tiers: r.tiers,
    addOns: r.addOns,
    annualDiscountBps: r.annualDiscountBps,
    quotas: r.quotas as unknown as Plan["quotas"],
    trialDays: r.trialDays,
  };
}

/** Tenant-side platform storage (spec 12): subscription, usage, invoices, plugins, support access, exports. */
export class DrizzlePlatformRepository {
  constructor(
    private readonly tx: Tx,
    private readonly orgId: string,
    private readonly crypto: Crypto,
  ) {}

  // ---- plans and subscription (§12.5) -------------------------------------------------------------

  async plans(): Promise<Plan[]> {
    const rows = await this.tx.select().from(s.plan).where(eq(s.plan.active, true));
    return rows.map(planFrom).sort((a, b) => a.tiers[0]!.unitMinor - b.tiers[0]!.unitMinor);
  }

  async subscription(): Promise<SubscriptionRow | null> {
    const [r] = await this.tx
      .select()
      .from(s.subscription)
      .innerJoin(s.plan, eq(s.plan.id, s.subscription.planId))
      .where(eq(s.subscription.orgId, this.orgId));
    if (!r) return null;
    const sub = r.subscription;
    return {
      orgId: sub.orgId,
      planId: sub.planId,
      plan: planFrom(r.plan),
      annual: sub.annual,
      addOns: sub.addOns,
      customerRef: sub.customerRef,
      paymentMethod: sub.paymentMethod ?? null,
      billingEmail: sub.billingEmail,
      billingName: sub.billingName,
      vatId: sub.vatId,
      country: sub.country,
      periodFrom: sub.periodFrom,
      periodTo: sub.periodTo,
      trialEndsOn: sub.trialEndsOn,
      paymentFailedOn: sub.paymentFailedOn,
      dunningRetries: sub.dunningRetries,
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
    };
  }

  async saveSubscription(input: {
    planId: string;
    annual: boolean;
    addOns: string[];
    country: string;
    periodFrom: string;
    periodTo: string;
    trialEndsOn: string | null;
    billingEmail?: string | null;
    billingName?: string | null;
    vatId?: string | null;
  }): Promise<void> {
    await this.tx
      .insert(s.subscription)
      .values({ orgId: this.orgId, ...input })
      .onConflictDoUpdate({
        target: s.subscription.orgId,
        set: {
          planId: input.planId,
          annual: input.annual,
          addOns: input.addOns,
          country: input.country,
          ...(input.billingEmail !== undefined ? { billingEmail: input.billingEmail } : {}),
          ...(input.billingName !== undefined ? { billingName: input.billingName } : {}),
          ...(input.vatId !== undefined ? { vatId: input.vatId } : {}),
          cancelAtPeriodEnd: false,
          updatedAt: sql`now()`,
        },
      });
  }

  async updateSubscription(
    patch: Partial<{
      customerRef: string;
      paymentMethod: { methodRef: string; brand: string; last4: string } | null;
      periodFrom: string;
      periodTo: string;
      paymentFailedOn: string | null;
      dunningRetries: number;
      cancelAtPeriodEnd: boolean;
      billingEmail: string | null;
      vatId: string | null;
    }>,
  ): Promise<void> {
    await this.tx
      .update(s.subscription)
      .set({ ...patch, updatedAt: sql`now()` })
      .where(eq(s.subscription.orgId, this.orgId));
  }

  async orgState(): Promise<{
    state: TenantState;
    name: string;
    country: string;
    createdAt: string;
  }> {
    const [r] = await rawRows<{
      state: TenantState;
      name: string;
      country: string;
      created_at: string;
    }>(
      this.tx,
      sql`select state, name, country, created_at::text from organization where id = ${this.orgId}`,
    );
    if (!r) throw new Error("organization missing");
    return {
      state: r.state,
      name: r.name,
      country: r.country,
      createdAt: new Date(r.created_at).toISOString(),
    };
  }

  async setOrgState(state: TenantState): Promise<void> {
    await this.tx.execute(
      sql`update organization set state = ${state}, updated_at = now() where id = ${this.orgId}`,
    );
  }

  // ---- metering (§12.5) --------------------------------------------------------------------------------

  /** Active units today: rooms of live properties; properties and users alongside for the quota view. */
  async usageSnapshot(): Promise<{
    activeUnits: number;
    properties: number;
    rooms: number;
    users: number;
    webhookEndpoints: number;
  }> {
    const [r] = await rawRows<{
      units: number;
      properties: number;
      users: number;
      endpoints: number;
    }>(
      this.tx,
      sql`select
            coalesce((select sum(rt.count_of_rooms) from room_type rt join property p on p.id = rt.property_id
              where p.org_id = ${this.orgId} and p.archived_at is null and p.state = 'live' and rt.archived_at is null), 0)::int as units,
            (select count(*)::int from property p where p.org_id = ${this.orgId} and p.archived_at is null) as properties,
            (select count(distinct subject_id)::int from "grant" g where g.org_id = ${this.orgId} and g.subject_type = 'user') as users,
            (select count(*)::int from plugin pl where pl.org_id = ${this.orgId} and pl.enabled) as endpoints`,
    );
    return {
      activeUnits: num(r?.units),
      properties: num(r?.properties),
      rooms: num(r?.units),
      users: num(r?.users),
      webhookEndpoints: num(r?.endpoints),
    };
  }

  async recordUsage(date: string): Promise<{ activeUnits: number }> {
    const u = await this.usageSnapshot();
    await this.tx
      .insert(s.usageRecord)
      .values({
        id: Id.next(),
        orgId: this.orgId,
        date,
        activeUnits: u.activeUnits,
        properties: u.properties,
        rooms: u.rooms,
        users: u.users,
      })
      .onConflictDoUpdate({
        target: [s.usageRecord.orgId, s.usageRecord.date],
        set: {
          activeUnits: u.activeUnits,
          properties: u.properties,
          rooms: u.rooms,
          users: u.users,
        },
      });
    return { activeUnits: u.activeUnits };
  }

  async usage(
    from: string,
    to: string,
  ): Promise<Array<{ date: string; activeUnits: number; properties: number; users: number }>> {
    const rows = await rawRows<{
      date: string;
      active_units: number;
      properties: number;
      users: number;
    }>(
      this.tx,
      sql`select date::text, active_units, properties, users from usage_record where org_id = ${this.orgId} and date >= ${from} and date < ${to} order by date`,
    );
    return rows.map((r) => ({
      date: r.date,
      activeUnits: num(r.active_units),
      properties: num(r.properties),
      users: num(r.users),
    }));
  }

  // ---- invoices (BILL-2) -------------------------------------------------------------------------------

  async saveInvoice(i: {
    periodFrom: string;
    periodTo: string;
    currency: string;
    draft: Record<string, unknown>;
    subtotalMinor: number;
    vatMinor: number;
    totalMinor: number;
    state: string;
    providerRef: string | null;
    pdfUrl: string | null;
    failureReason: string | null;
  }): Promise<string> {
    const id = Id.next();
    await this.tx
      .insert(s.billingInvoice)
      .values({ id, orgId: this.orgId, ...i, paidAt: i.state === "paid" ? sql`now()` : null })
      .onConflictDoUpdate({
        target: [s.billingInvoice.orgId, s.billingInvoice.periodFrom],
        set: {
          state: i.state,
          providerRef: i.providerRef,
          pdfUrl: i.pdfUrl,
          failureReason: i.failureReason,
          ...(i.state === "paid" ? { paidAt: sql`now()` } : {}),
        },
      });
    const [row] = await rawRows<{ id: string }>(
      this.tx,
      sql`select id from billing_invoice where org_id = ${this.orgId} and period_from = ${i.periodFrom}`,
    );
    return row?.id ?? id;
  }

  async invoices(): Promise<InvoiceRow[]> {
    const rows = await this.tx
      .select()
      .from(s.billingInvoice)
      .where(eq(s.billingInvoice.orgId, this.orgId))
      .orderBy(desc(s.billingInvoice.periodFrom));
    return rows.map((r) => ({
      id: r.id,
      periodFrom: r.periodFrom,
      periodTo: r.periodTo,
      currency: r.currency,
      draft: r.draft,
      subtotalMinor: r.subtotalMinor,
      vatMinor: r.vatMinor,
      totalMinor: r.totalMinor,
      state: r.state,
      providerRef: r.providerRef,
      pdfUrl: r.pdfUrl,
      failureReason: r.failureReason,
      issuedAt: new Date(r.issuedAt).toISOString(),
      paidAt: r.paidAt ? new Date(r.paidAt).toISOString() : null,
    }));
  }

  async openInvoice(): Promise<InvoiceRow | null> {
    return (await this.invoices()).find((i) => i.state === "open") ?? null;
  }

  async markInvoice(id: string, state: string, failureReason: string | null): Promise<void> {
    await this.tx
      .update(s.billingInvoice)
      .set({ state, failureReason, ...(state === "paid" ? { paidAt: sql`now()` } : {}) })
      .where(and(eq(s.billingInvoice.id, id), eq(s.billingInvoice.orgId, this.orgId)));
  }

  // ---- plugins (§12.7) ----------------------------------------------------------------------------------

  async plugins(): Promise<PluginRow[]> {
    const rows = await this.tx.select().from(s.plugin).where(eq(s.plugin.orgId, this.orgId));
    return rows.map((r) => ({
      id: r.id,
      key: r.key,
      manifest: r.manifest as unknown as PluginManifest,
      endpointUrl: r.endpointUrl,
      config: r.config,
      enabled: r.enabled,
      cursorAt: r.cursorAt ? new Date(r.cursorAt).toISOString() : null,
      cursorId: r.cursorId,
      consecutiveFailures: r.consecutiveFailures,
      breakerOpenUntil: r.breakerOpenUntil ? new Date(r.breakerOpenUntil).toISOString() : null,
      createdAt: new Date(r.createdAt).toISOString(),
    }));
  }

  async installPlugin(p: {
    manifest: PluginManifest;
    endpointUrl: string;
    secret: string;
    config: Record<string, unknown>;
    installedBy: string;
    /** Start delivering from now, never the backlog. */
    cursorAt: string;
  }): Promise<string> {
    const id = Id.next();
    await this.tx
      .insert(s.plugin)
      .values({
        id,
        orgId: this.orgId,
        key: p.manifest.key,
        manifest: p.manifest as unknown as Record<string, unknown>,
        endpointUrl: p.endpointUrl,
        secretEnc: await this.crypto.seal(p.secret),
        config: p.config,
        installedBy: p.installedBy,
        cursorAt: p.cursorAt,
      })
      .onConflictDoUpdate({
        target: [s.plugin.orgId, s.plugin.key],
        set: {
          manifest: p.manifest as unknown as Record<string, unknown>,
          endpointUrl: p.endpointUrl,
          secretEnc: await this.crypto.seal(p.secret),
          config: p.config,
          enabled: true,
        },
      });
    const [row] = await rawRows<{ id: string }>(
      this.tx,
      sql`select id from plugin where org_id = ${this.orgId} and key = ${p.manifest.key}`,
    );
    return row?.id ?? id;
  }

  async setPluginEnabled(id: string, enabled: boolean): Promise<void> {
    await this.tx
      .update(s.plugin)
      .set({ enabled, ...(enabled ? { consecutiveFailures: 0, breakerOpenUntil: null } : {}) })
      .where(and(eq(s.plugin.id, id), eq(s.plugin.orgId, this.orgId)));
  }

  async pluginSecret(id: string): Promise<string | null> {
    const [r] = await this.tx
      .select({ v: s.plugin.secretEnc })
      .from(s.plugin)
      .where(eq(s.plugin.id, id));
    return r ? this.crypto.open(r.v) : null;
  }

  /** Outbox events after the plugin's cursor, oldest first; the cursor moves as deliveries are queued. */
  async eventsAfterCursor(
    plugin: PluginRow,
    limit = 100,
  ): Promise<
    Array<{
      id: string;
      type: string;
      aggregate: { kind: string; id: string };
      payload: unknown;
      occurredAt: string;
      dedupeKey: string;
    }>
  > {
    const rows = await rawRows<{
      id: string;
      type: string;
      aggregate: { kind: string; id: string };
      payload: unknown;
      occurred_at: string;
      dedupe_key: string;
    }>(
      this.tx,
      sql`select id, type, aggregate, payload, occurred_at::text, dedupe_key from outbox_event
          where org_id = ${this.orgId} and published_at is not null
            and (${plugin.cursorAt ?? null}::timestamptz is null or occurred_at > ${plugin.cursorAt ?? null}::timestamptz
                 or (occurred_at = ${plugin.cursorAt ?? null}::timestamptz and id > ${plugin.cursorId ?? "00000000-0000-0000-0000-000000000000"}::uuid))
          order by occurred_at, id limit ${limit}`,
    );
    return rows.map((r) => ({
      id: r.id,
      type: r.type,
      aggregate: r.aggregate,
      payload: r.payload,
      occurredAt: new Date(r.occurred_at).toISOString(),
      dedupeKey: r.dedupe_key,
    }));
  }

  async moveCursor(pluginId: string, at: string, id: string): Promise<void> {
    await this.tx
      .update(s.plugin)
      .set({ cursorAt: at, cursorId: id })
      .where(eq(s.plugin.id, pluginId));
  }

  async queueDelivery(
    pluginId: string,
    eventId: string,
    eventType: string,
    nowIso: string,
  ): Promise<void> {
    await this.tx
      .insert(s.pluginDelivery)
      .values({
        id: Id.next(),
        orgId: this.orgId,
        pluginId,
        eventId,
        eventType,
        nextAttemptAt: nowIso,
      })
      .onConflictDoNothing();
  }

  async dueDeliveries(
    nowIso: string,
    limit = 50,
  ): Promise<
    Array<{ id: string; pluginId: string; eventId: string; eventType: string; attempts: number }>
  > {
    const rows = await rawRows<{
      id: string;
      plugin_id: string;
      event_id: string;
      event_type: string;
      attempts: number;
    }>(
      this.tx,
      sql`select d.id, d.plugin_id, d.event_id, d.event_type, d.attempts from plugin_delivery d join plugin p on p.id = d.plugin_id
          where d.org_id = ${this.orgId} and d.state in ('pending', 'failed') and d.next_attempt_at <= ${nowIso} and p.enabled
            and (p.breaker_open_until is null or p.breaker_open_until <= ${nowIso})
          order by d.next_attempt_at limit ${limit}`,
    );
    return rows.map((r) => ({
      id: r.id,
      pluginId: r.plugin_id,
      eventId: r.event_id,
      eventType: r.event_type,
      attempts: num(r.attempts),
    }));
  }

  async eventById(id: string): Promise<{
    id: string;
    type: string;
    aggregate: { kind: string; id: string };
    payload: unknown;
    occurredAt: string;
    dedupeKey: string;
  } | null> {
    const [r] = await rawRows<{
      id: string;
      type: string;
      aggregate: { kind: string; id: string };
      payload: unknown;
      occurred_at: string;
      dedupe_key: string;
    }>(
      this.tx,
      sql`select id, type, aggregate, payload, occurred_at::text, dedupe_key from outbox_event where id = ${id}`,
    );
    return r
      ? {
          id: r.id,
          type: r.type,
          aggregate: r.aggregate,
          payload: r.payload,
          occurredAt: new Date(r.occurred_at).toISOString(),
          dedupeKey: r.dedupe_key,
        }
      : null;
  }

  async markDelivery(
    id: string,
    outcome: {
      state: "delivered" | "failed" | "dead";
      status: number | null;
      error: string | null;
      nextAttemptAt: string | null;
    },
  ): Promise<void> {
    await this.tx.execute(
      sql`update plugin_delivery set state = ${outcome.state}, attempts = attempts + 1, last_status = ${outcome.status}, last_error = ${outcome.error},
          next_attempt_at = coalesce(${outcome.nextAttemptAt}::timestamptz, next_attempt_at), delivered_at = case when ${outcome.state} = 'delivered' then now() else delivered_at end
          where id = ${id}`,
    );
  }

  async pluginOutcome(
    pluginId: string,
    ok: boolean,
    breakerOpenUntil: string | null,
  ): Promise<void> {
    await this.tx.execute(
      ok
        ? sql`update plugin set consecutive_failures = 0, breaker_open_until = null where id = ${pluginId}`
        : sql`update plugin set consecutive_failures = consecutive_failures + 1, breaker_open_until = ${breakerOpenUntil} where id = ${pluginId}`,
    );
  }

  async deliveries(limit = 50): Promise<
    Array<{
      id: string;
      pluginKey: string;
      eventType: string;
      state: string;
      attempts: number;
      lastStatus: number | null;
      lastError: string | null;
      createdAt: string;
    }>
  > {
    const rows = await rawRows<{
      id: string;
      key: string;
      event_type: string;
      state: string;
      attempts: number;
      last_status: number | null;
      last_error: string | null;
      created_at: string;
    }>(
      this.tx,
      sql`select d.id, p.key, d.event_type, d.state, d.attempts, d.last_status, d.last_error, d.created_at::text from plugin_delivery d join plugin p on p.id = d.plugin_id
          where d.org_id = ${this.orgId} order by d.created_at desc limit ${limit}`,
    );
    return rows.map((r) => ({
      id: r.id,
      pluginKey: r.key,
      eventType: r.event_type,
      state: r.state,
      attempts: num(r.attempts),
      lastStatus: r.last_status,
      lastError: r.last_error,
      createdAt: new Date(r.created_at).toISOString(),
    }));
  }

  async retryDeliveries(pluginId: string): Promise<number> {
    const rows = await rawRows<{ n: number }>(
      this.tx,
      sql`with u as (update plugin_delivery set state = 'pending', next_attempt_at = now() where plugin_id = ${pluginId} and org_id = ${this.orgId} and state in ('failed', 'dead') returning 1) select count(*)::int as n from u`,
    );
    return num(rows[0]?.n);
  }

  // ---- support access and impersonation (spec 02 §2.7) ------------------------------------------------

  async supportAccess(): Promise<{ writeAllowed: boolean; expiresAt: string } | null> {
    const [r] = await this.tx
      .select()
      .from(s.supportAccessGrant)
      .where(eq(s.supportAccessGrant.orgId, this.orgId));
    return r
      ? { writeAllowed: r.writeAllowed, expiresAt: new Date(r.expiresAt).toISOString() }
      : null;
  }

  async grantSupportAccess(
    grantedBy: string,
    hours: number,
    writeAllowed: boolean,
    nowIso: string,
  ): Promise<void> {
    const expiresAt = new Date(Date.parse(nowIso) + hours * 3_600_000).toISOString();
    await this.tx
      .insert(s.supportAccessGrant)
      .values({ orgId: this.orgId, grantedBy, writeAllowed, expiresAt })
      .onConflictDoUpdate({
        target: s.supportAccessGrant.orgId,
        set: { grantedBy, writeAllowed, expiresAt },
      });
  }

  async revokeSupportAccess(): Promise<void> {
    await this.tx.delete(s.supportAccessGrant).where(eq(s.supportAccessGrant.orgId, this.orgId));
  }

  async impersonations(): Promise<ImpersonationRow[]> {
    return impersonationRows(this.tx, sql`where i.org_id = ${this.orgId}`);
  }

  async approveImpersonation(
    id: string,
    approvedBy: string,
    writeApproved: boolean,
  ): Promise<void> {
    await this.tx.execute(
      sql`update impersonation_session set state = 'approved', approved_by = ${approvedBy}, approved_at = now(), write_approved = ${writeApproved}
          where id = ${id} and org_id = ${this.orgId} and state = 'requested'`,
    );
  }

  async denyImpersonation(id: string, by: string): Promise<void> {
    await this.tx.execute(
      sql`update impersonation_session set state = 'denied', approved_by = ${by}, ended_at = now() where id = ${id} and org_id = ${this.orgId} and state in ('requested', 'approved', 'active')`,
    );
  }

  // ---- offboarding (§12.3) --------------------------------------------------------------------------------

  async requestExport(requestedBy: string | null): Promise<string> {
    const id = Id.next();
    await this.tx.insert(s.dataExport).values({ id, orgId: this.orgId, requestedBy });
    return id;
  }

  async exports(): Promise<
    Array<{
      id: string;
      state: string;
      bytes: number | null;
      counts: Record<string, number> | null;
      readyAt: string | null;
      createdAt: string;
    }>
  > {
    const rows = await this.tx
      .select()
      .from(s.dataExport)
      .where(eq(s.dataExport.orgId, this.orgId))
      .orderBy(desc(s.dataExport.createdAt));
    return rows.map((r) => ({
      id: r.id,
      state: r.state,
      bytes: r.bytes,
      counts: r.counts ?? null,
      readyAt: r.readyAt ? new Date(r.readyAt).toISOString() : null,
      createdAt: new Date(r.createdAt).toISOString(),
    }));
  }

  async exportBundle(id: string): Promise<string | null> {
    const [r] = await this.tx
      .select({ b: s.dataExport.bundle })
      .from(s.dataExport)
      .where(and(eq(s.dataExport.id, id), eq(s.dataExport.orgId, this.orgId)));
    return r?.b ?? null;
  }

  async pendingExports(): Promise<string[]> {
    const rows = await this.tx
      .select({ id: s.dataExport.id })
      .from(s.dataExport)
      .where(and(eq(s.dataExport.orgId, this.orgId), eq(s.dataExport.state, "requested")));
    return rows.map((r) => r.id);
  }

  async completeExport(
    id: string,
    bundle: string,
    counts: Record<string, number>,
    expiresAt: string,
  ): Promise<void> {
    await this.tx
      .update(s.dataExport)
      .set({
        state: "ready",
        bundle,
        bytes: Buffer.byteLength(bundle),
        counts,
        readyAt: sql`now()`,
        expiresAt,
      })
      .where(eq(s.dataExport.id, id));
  }

  /** The documented JSON export (§12.3): bookings, guests, ARI history, messages, invoices; the tenant owns all of it. */
  async exportTables(): Promise<Record<string, unknown[]>> {
    const q = async (name: string, query: ReturnType<typeof sql>) =>
      [name, await rawRows<Record<string, unknown>>(this.tx, query)] as const;
    const parts = await Promise.all([
      q(
        "organization",
        sql`select id, name, slug, country, default_currency, locale, created_at from organization where id = ${this.orgId}`,
      ),
      q(
        "properties",
        sql`select id, title, kind, currency, timezone, address, state, created_at from property where org_id = ${this.orgId}`,
      ),
      q(
        "room_types",
        sql`select id, property_id, title, count_of_rooms, created_at from room_type where org_id = ${this.orgId}`,
      ),
      q(
        "rate_plans",
        sql`select id, property_id, room_type_id, title, currency, created_at from rate_plan where org_id = ${this.orgId}`,
      ),
      q(
        "bookings",
        sql`select id, property_id, channex_booking_id, ota_name, ota_reservation_code, status, arrival_date, departure_date, currency, total_amount_minor, created_at from booking where org_id = ${this.orgId}`,
      ),
      q(
        "booking_revisions",
        sql`select id, booking_id, revision_type, system_id, normalised, inserted_at from booking_revision where org_id = ${this.orgId}`,
      ),
      q(
        "guests",
        sql`select id, name_enc, surname_enc, email_enc, phone_enc, language, country from guest where org_id = ${this.orgId}`,
      ),
      q(
        "availability_history",
        sql`select property_id, room_type_id, date, available, updated_at from availability_day where org_id = ${this.orgId}`,
      ),
      q(
        "rate_history",
        sql`select property_id, rate_plan_id, date, values, updated_at from rate_day where org_id = ${this.orgId}`,
      ),
      q(
        "threads",
        sql`select id, property_id, provider, booking_id, kind, state, created_at from message_thread where org_id = ${this.orgId}`,
      ),
      q(
        "messages",
        sql`select id, thread_id, kind, direction, author_type, body_enc, sent_at from message where org_id = ${this.orgId}`,
      ),
      q(
        "folios",
        sql`select id, booking_id, property_id, label, currency, state from folio where org_id = ${this.orgId}`,
      ),
      q(
        "folio_lines",
        sql`select id, folio_id, kind, description, date, amount_minor from folio_line where org_id = ${this.orgId}`,
      ),
      q(
        "invoices",
        sql`select id, folio_id, number, kind, total_minor, issued_at from invoice where org_id = ${this.orgId}`,
      ),
      q(
        "owner_statements",
        sql`select id, owner_id, property_id, period_from, period_to, state, totals from owner_statement where org_id = ${this.orgId}`,
      ),
      q(
        "audit_log",
        sql`select seq, actor, action, subject, occurred_at from audit_log where org_id = ${this.orgId} order by seq`,
      ),
    ]);
    const out: Record<string, unknown[]> = {};
    for (const [name, rows] of parts) out[name] = rows;
    // sealed columns are opened so the tenant leaves with readable data, not ciphertext
    for (const g of out.guests as Array<Record<string, unknown>>)
      for (const k of ["name_enc", "surname_enc", "email_enc", "phone_enc"])
        if (typeof g[k] === "string") {
          g[k.replace("_enc", "")] = await this.crypto.open(g[k]);
          delete g[k];
        }
    for (const m of out.messages as Array<Record<string, unknown>>)
      if (typeof m.body_enc === "string") {
        m.body = await this.crypto.open(m.body_enc);
        delete m.body_enc;
      }
    return out;
  }
}

async function impersonationRows(
  tx: Tx,
  where: ReturnType<typeof sql>,
): Promise<ImpersonationRow[]> {
  const rows = await rawRows<{
    id: string;
    org_id: string;
    org_name: string;
    operator_id: string;
    reason: string;
    state: string;
    write_approved: boolean;
    break_glass: boolean;
    second_operator_id: string | null;
    approved_by: string | null;
    started_at: string | null;
    expires_at: string | null;
    ended_at: string | null;
    transcript: Array<{ at: string; action: string; subject: string }>;
    created_at: string;
  }>(
    tx,
    sql`select i.id, i.org_id, o.name as org_name, i.operator_id, i.reason, i.state, i.write_approved, i.break_glass, i.second_operator_id, i.approved_by,
          i.started_at::text, i.expires_at::text, i.ended_at::text, i.transcript, i.created_at::text
        from impersonation_session i join organization o on o.id = i.org_id ${where} order by i.created_at desc limit 100`,
  );
  const iso = (v: string | null) => (v ? new Date(v).toISOString() : null);
  return rows.map((r) => ({
    id: r.id,
    orgId: r.org_id,
    orgName: r.org_name,
    operatorId: r.operator_id,
    reason: r.reason,
    state: r.state,
    writeApproved: r.write_approved,
    breakGlass: r.break_glass,
    secondOperatorId: r.second_operator_id,
    approvedBy: r.approved_by,
    startedAt: iso(r.started_at),
    expiresAt: iso(r.expires_at),
    endedAt: iso(r.ended_at),
    transcript: r.transcript,
    createdAt: new Date(r.created_at).toISOString(),
  }));
}

// ---- operator side (spec 12 §12.1): outside tenancy, mediated by the application ---------------------------

export interface TenantRow {
  id: string;
  name: string;
  slug: string;
  country: string;
  state: string;
  planKey: string | null;
  properties: number;
  activeUnits: number;
  lastActivityAt: string | null;
  pendingCells: number;
  unackedBookings: number;
  openIncidents: number;
  createdAt: string;
}

export interface FleetHealth {
  outboxUnpublished: number;
  syncQueued: number;
  syncFailed: number;
  syncDead: number;
  webhooksPending: number;
  webhooksFailed: number;
  webhookLagSeconds: number;
  unackedBookings: number;
  pendingCells: number;
  provider429Last24h: number;
  providerErrorsLast24h: number;
  pluginDeliveriesDead: number;
  worstProperties: Array<{
    propertyId: string;
    title: string;
    orgName: string;
    pendingCells: number;
    unacked: number;
  }>;
}

/** Reads and writes for the operator console. Every call runs without a tenant (asSystem for one org, withoutTenant across). */
export class DrizzleOperatorRepository {
  constructor(private readonly tx: Tx) {}

  async isOperator(userId: string): Promise<boolean> {
    const [r] = await this.tx
      .select({ u: s.platformOperator.userId })
      .from(s.platformOperator)
      .where(eq(s.platformOperator.userId, userId));
    return Boolean(r);
  }

  async operators(): Promise<
    Array<{ userId: string; email: string; name: string; createdAt: string }>
  > {
    const rows = await rawRows<{
      user_id: string;
      email: string;
      name: string;
      created_at: string;
    }>(
      this.tx,
      sql`select po.user_id, u.email, u.name, po.created_at::text from platform_operator po join "user" u on u.id = po.user_id order by po.created_at`,
    );
    return rows.map((r) => ({
      userId: r.user_id,
      email: r.email,
      name: r.name,
      createdAt: new Date(r.created_at).toISOString(),
    }));
  }

  async grantOperator(userId: string, grantedBy: string | null): Promise<void> {
    await this.tx.insert(s.platformOperator).values({ userId, grantedBy }).onConflictDoNothing();
  }

  async audit(entry: {
    operatorId: string;
    orgId: string | null;
    action: string;
    subject: { kind: string; id: string };
    detail?: Record<string, unknown>;
    requestId?: string;
  }): Promise<void> {
    await this.tx.insert(s.operatorAuditLog).values({
      id: Id.next(),
      operatorId: entry.operatorId,
      orgId: entry.orgId,
      action: entry.action,
      subject: entry.subject,
      detail: entry.detail ?? null,
      requestId: entry.requestId ?? null,
    });
  }

  async operatorAudit(limit = 100): Promise<
    Array<{
      id: string;
      operatorId: string;
      orgId: string | null;
      action: string;
      subject: { kind: string; id: string };
      occurredAt: string;
    }>
  > {
    const rows = await this.tx
      .select()
      .from(s.operatorAuditLog)
      .orderBy(desc(s.operatorAuditLog.occurredAt))
      .limit(limit);
    return rows.map((r) => ({
      id: r.id,
      operatorId: r.operatorId,
      orgId: r.orgId,
      action: r.action,
      subject: r.subject,
      occurredAt: new Date(r.occurredAt).toISOString(),
    }));
  }

  async fleetHealth(): Promise<FleetHealth> {
    const [r] = await rawRows<Record<string, number>>(
      this.tx,
      sql`select
        (select count(*)::int from outbox_event where published_at is null) as outbox_unpublished,
        (select count(*)::int from sync_operation where state in ('queued', 'running')) as sync_queued,
        (select count(*)::int from sync_operation where state = 'failed') as sync_failed,
        (select count(*)::int from sync_operation where state = 'dead') as sync_dead,
        (select count(*)::int from inbound_webhook where state = 'received') as webhooks_pending,
        (select count(*)::int from inbound_webhook where state in ('failed', 'dead')) as webhooks_failed,
        (select coalesce(extract(epoch from (now() - min(received_at))), 0)::int from inbound_webhook where state = 'received') as webhook_lag,
        (select count(*)::int from booking_revision where acked_at is null) as unacked,
        (select count(*)::int from availability_day where sync_state in ('pending', 'failed')) + (select count(*)::int from rate_day where sync_state in ('pending', 'failed')) as pending_cells,
        (select count(*)::int from sync_operation where created_at > now() - interval '24 hours' and last_error ilike '%429%') as p429,
        (select count(*)::int from sync_operation where created_at > now() - interval '24 hours' and state in ('failed', 'dead')) as perr,
        (select count(*)::int from plugin_delivery where state = 'dead') as plugin_dead`,
    );
    const worst = await rawRows<{
      property_id: string;
      title: string;
      org_name: string;
      pending: number;
      unacked: number;
    }>(
      this.tx,
      sql`select p.id as property_id, p.title, o.name as org_name,
            (select count(*)::int from availability_day a where a.property_id = p.id and a.sync_state in ('pending', 'failed')) as pending,
            (select count(*)::int from booking_revision br join booking b on b.id = br.booking_id where b.property_id = p.id and br.acked_at is null) as unacked
          from property p join organization o on o.id = p.org_id where p.archived_at is null
          order by pending desc, unacked desc limit 5`,
    );
    const g = (k: string) => num(r?.[k]);
    return {
      outboxUnpublished: g("outbox_unpublished"),
      syncQueued: g("sync_queued"),
      syncFailed: g("sync_failed"),
      syncDead: g("sync_dead"),
      webhooksPending: g("webhooks_pending"),
      webhooksFailed: g("webhooks_failed"),
      webhookLagSeconds: g("webhook_lag"),
      unackedBookings: g("unacked"),
      pendingCells: g("pending_cells"),
      provider429Last24h: g("p429"),
      providerErrorsLast24h: g("perr"),
      pluginDeliveriesDead: g("plugin_dead"),
      worstProperties: worst
        .filter((w) => num(w.pending) > 0 || num(w.unacked) > 0)
        .map((w) => ({
          propertyId: w.property_id,
          title: w.title,
          orgName: w.org_name,
          pendingCells: num(w.pending),
          unacked: num(w.unacked),
        })),
    };
  }

  async tenants(search = ""): Promise<TenantRow[]> {
    const rows = await rawRows<{
      id: string;
      name: string;
      slug: string;
      country: string;
      state: string;
      plan_key: string | null;
      properties: number;
      units: number;
      last_activity: string | null;
      pending: number;
      unacked: number;
      incidents: number;
      created_at: string;
    }>(
      this.tx,
      sql`select o.id, o.name, o.slug, o.country, o.state, pl.key as plan_key,
            (select count(*)::int from property p where p.org_id = o.id and p.archived_at is null) as properties,
            coalesce((select sum(rt.count_of_rooms) from room_type rt join property p on p.id = rt.property_id where p.org_id = o.id and p.state = 'live' and rt.archived_at is null), 0)::int as units,
            (select max(occurred_at)::text from audit_log a where a.org_id = o.id) as last_activity,
            (select count(*)::int from availability_day a where a.org_id = o.id and a.sync_state in ('pending', 'failed')) as pending,
            (select count(*)::int from booking_revision br where br.org_id = o.id and br.acked_at is null) as unacked,
            (select count(*)::int from alert al where al.org_id = o.id and al.state = 'open' and al.severity = 'p1') as incidents,
            o.created_at::text
          from organization o left join subscription sb on sb.org_id = o.id left join plan pl on pl.id = sb.plan_id
          where o.archived_at is null and (${search} = '' or o.name ilike ${"%" + search + "%"} or o.slug ilike ${"%" + search + "%"})
          order by o.created_at desc limit 200`,
    );
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      country: r.country,
      state: r.state,
      planKey: r.plan_key,
      properties: num(r.properties),
      activeUnits: num(r.units),
      lastActivityAt: r.last_activity ? new Date(r.last_activity).toISOString() : null,
      pendingCells: num(r.pending),
      unackedBookings: num(r.unacked),
      openIncidents: num(r.incidents),
      createdAt: new Date(r.created_at).toISOString(),
    }));
  }

  /** The sync inspector (§12.1, OPCON-1): states, ids, codes and timings; never a guest name. */
  async syncInspector(propertyId: string): Promise<{
    property: { id: string; title: string; orgId: string; orgName: string; state: string } | null;
    operations: Array<{
      id: string;
      kind: string;
      state: string;
      attempts: number;
      entries: number;
      accepted: number;
      rejected: number;
      lastError: string | null;
      requestId: string | null;
      createdAt: string;
      finishedAt: string | null;
      durationMs: number | null;
    }>;
    webhooks: Array<{
      id: string;
      event: string;
      state: string;
      attempts: number;
      lastError: string | null;
      dedupeKey: string;
      receivedAt: string;
      processedAt: string | null;
    }>;
    connections: Array<{
      id: string;
      adapterCode: string;
      state: string;
      lastError: string | null;
      lastPushAt: string | null;
      isActive: boolean;
    }>;
    pendingCells: number;
    unacked: Array<{ revisionId: string; systemId: string; receivedAt: string }>;
  }> {
    const [p] = await rawRows<{
      id: string;
      title: string;
      org_id: string;
      org_name: string;
      state: string;
    }>(
      this.tx,
      sql`select p.id, p.title, p.org_id, o.name as org_name, p.state from property p join organization o on o.id = p.org_id where p.id = ${propertyId}`,
    );
    if (!p)
      return {
        property: null,
        operations: [],
        webhooks: [],
        connections: [],
        pendingCells: 0,
        unacked: [],
      };
    const ops = await rawRows<{
      id: string;
      kind: string;
      state: string;
      attempts: number;
      entries: number;
      accepted: number;
      rejected: number;
      last_error: string | null;
      request_id: string | null;
      created_at: string;
      finished_at: string | null;
    }>(
      this.tx,
      sql`select id, kind, state, attempts, entries, accepted, rejected, last_error, request_id, created_at::text, finished_at::text from sync_operation where property_id = ${propertyId} order by created_at desc limit 50`,
    );
    const hooks = await rawRows<{
      id: string;
      event: string;
      state: string;
      attempts: number;
      last_error: string | null;
      dedupe_key: string;
      received_at: string;
      processed_at: string | null;
    }>(
      this.tx,
      sql`select id, event, state, attempts, last_error, dedupe_key, received_at::text, processed_at::text from inbound_webhook where property_id = ${propertyId} order by received_at desc limit 50`,
    );
    const conns = await rawRows<{
      id: string;
      adapter_code: string;
      state: string;
      last_error: string | null;
      last_push_at: string | null;
      is_active: boolean;
    }>(
      this.tx,
      sql`select id, adapter_code, state, last_error, last_push_at::text, is_active from channel_connection where property_id = ${propertyId} and archived_at is null`,
    );
    const [cells] = await rawRows<{ n: number }>(
      this.tx,
      sql`select (select count(*)::int from availability_day where property_id = ${propertyId} and sync_state in ('pending', 'failed')) + (select count(*)::int from rate_day where property_id = ${propertyId} and sync_state in ('pending', 'failed')) as n`,
    );
    const unacked = await rawRows<{ id: string; system_id: string; received_at: string }>(
      this.tx,
      sql`select br.id, br.system_id, br.received_at::text from booking_revision br join booking b on b.id = br.booking_id where b.property_id = ${propertyId} and br.acked_at is null order by br.received_at limit 20`,
    );
    const iso = (v: string | null) => (v ? new Date(v).toISOString() : null);
    return {
      property: { id: p.id, title: p.title, orgId: p.org_id, orgName: p.org_name, state: p.state },
      operations: ops.map((o) => ({
        id: o.id,
        kind: o.kind,
        state: o.state,
        attempts: num(o.attempts),
        entries: num(o.entries),
        accepted: num(o.accepted),
        rejected: num(o.rejected),
        lastError: o.last_error,
        requestId: o.request_id,
        createdAt: new Date(o.created_at).toISOString(),
        finishedAt: iso(o.finished_at),
        durationMs: o.finished_at ? Date.parse(o.finished_at) - Date.parse(o.created_at) : null,
      })),
      webhooks: hooks.map((h) => ({
        id: h.id,
        event: h.event,
        state: h.state,
        attempts: num(h.attempts),
        lastError: h.last_error,
        dedupeKey: h.dedupe_key,
        receivedAt: new Date(h.received_at).toISOString(),
        processedAt: iso(h.processed_at),
      })),
      connections: conns.map((c) => ({
        id: c.id,
        adapterCode: c.adapter_code,
        state: c.state,
        lastError: c.last_error,
        lastPushAt: iso(c.last_push_at),
        isActive: c.is_active,
      })),
      pendingCells: num(cells?.n),
      unacked: unacked.map((u) => ({
        revisionId: u.id,
        systemId: u.system_id,
        receivedAt: new Date(u.received_at).toISOString(),
      })),
    };
  }

  /** DLQ (§12.1): dead sync operations, webhooks and plugin deliveries, inspect / requeue / discard with a reason. */
  async deadLetters(): Promise<
    Array<{
      kind: "sync" | "webhook" | "plugin";
      id: string;
      orgId: string;
      propertyId: string | null;
      label: string;
      lastError: string | null;
      attempts: number;
      at: string;
    }>
  > {
    const rows = await rawRows<{
      kind: "sync" | "webhook" | "plugin";
      id: string;
      org_id: string;
      property_id: string | null;
      label: string;
      last_error: string | null;
      attempts: number;
      at: string;
    }>(
      this.tx,
      sql`select 'sync' as kind, id, org_id, property_id, kind as label, last_error, attempts, created_at::text as at from sync_operation where state = 'dead'
          union all select 'webhook', id, org_id, property_id, event, last_error, attempts, received_at::text from inbound_webhook where state = 'dead'
          union all select 'plugin', id, org_id, null, event_type, last_error, attempts, created_at::text from plugin_delivery where state = 'dead'
          order by at desc limit 200`,
    );
    return rows.map((r) => ({
      kind: r.kind,
      id: r.id,
      orgId: r.org_id,
      propertyId: r.property_id,
      label: r.label,
      lastError: r.last_error,
      attempts: num(r.attempts),
      at: new Date(r.at).toISOString(),
    }));
  }

  async requeueDeadLetter(kind: "sync" | "webhook" | "plugin", id: string): Promise<void> {
    if (kind === "sync")
      await this.tx.execute(
        sql`update sync_operation set state = 'queued', last_error = null where id = ${id} and state in ('dead', 'failed')`,
      );
    else if (kind === "webhook")
      await this.tx.execute(
        sql`update inbound_webhook set state = 'received', last_error = null where id = ${id} and state in ('dead', 'failed')`,
      );
    else
      await this.tx.execute(
        sql`update plugin_delivery set state = 'pending', next_attempt_at = now() where id = ${id} and state in ('dead', 'failed')`,
      );
  }

  async discardDeadLetter(
    kind: "sync" | "webhook" | "plugin",
    id: string,
    reason: string,
  ): Promise<void> {
    const note = `discarded: ${reason}`;
    if (kind === "sync")
      await this.tx.execute(
        sql`update sync_operation set state = 'done', last_error = ${note} where id = ${id}`,
      );
    else if (kind === "webhook")
      await this.tx.execute(
        sql`update inbound_webhook set state = 'processed', last_error = ${note} where id = ${id}`,
      );
    else
      await this.tx.execute(
        sql`update plugin_delivery set state = 'delivered', last_error = ${note} where id = ${id}`,
      );
  }

  /** Webhook explorer (§12.1): replay re-queues the stored payload under a fresh dedupe key. */
  async webhooks(
    filter: { orgId?: string; event?: string; state?: string } = {},
    limit = 100,
  ): Promise<
    Array<{
      id: string;
      orgId: string;
      propertyId: string | null;
      event: string;
      state: string;
      attempts: number;
      dedupeKey: string;
      lastError: string | null;
      receivedAt: string;
      processedAt: string | null;
    }>
  > {
    const rows = await rawRows<{
      id: string;
      org_id: string;
      property_id: string | null;
      event: string;
      state: string;
      attempts: number;
      dedupe_key: string;
      last_error: string | null;
      received_at: string;
      processed_at: string | null;
    }>(
      this.tx,
      sql`select id, org_id, property_id, event, state, attempts, dedupe_key, last_error, received_at::text, processed_at::text from inbound_webhook
          where (${filter.orgId ?? null}::uuid is null or org_id = ${filter.orgId ?? null}::uuid) and (${filter.event ?? ""} = '' or event = ${filter.event ?? ""}) and (${filter.state ?? ""} = '' or state = ${filter.state ?? ""})
          order by received_at desc limit ${limit}`,
    );
    return rows.map((r) => ({
      id: r.id,
      orgId: r.org_id,
      propertyId: r.property_id,
      event: r.event,
      state: r.state,
      attempts: num(r.attempts),
      dedupeKey: r.dedupe_key,
      lastError: r.last_error,
      receivedAt: new Date(r.received_at).toISOString(),
      processedAt: r.processed_at ? new Date(r.processed_at).toISOString() : null,
    }));
  }

  async replayWebhook(id: string): Promise<string | null> {
    const [w] = await this.tx.select().from(s.inboundWebhook).where(eq(s.inboundWebhook.id, id));
    if (!w) return null;
    const newId = Id.next();
    await this.tx.insert(s.inboundWebhook).values({
      id: newId,
      orgId: w.orgId,
      propertyId: w.propertyId,
      event: w.event,
      payload: w.payload,
      dedupeKey: `replay:${newId}`,
      state: "received",
    });
    return newId;
  }

  // ---- flags and announcements (§12.1) --------------------------------------------------------------------

  async flags(): Promise<
    Array<{
      id: string;
      key: string;
      orgId: string | null;
      enabled: boolean;
      rolloutPercent: number;
      updatedAt: string;
    }>
  > {
    const rows = await this.tx.select().from(s.featureFlag).orderBy(s.featureFlag.key);
    return rows.map((r) => ({
      id: r.id,
      key: r.key,
      orgId: r.orgId,
      enabled: r.enabled,
      rolloutPercent: r.rolloutPercent,
      updatedAt: new Date(r.updatedAt).toISOString(),
    }));
  }

  async setFlag(
    key: string,
    orgId: string | null,
    enabled: boolean,
    rolloutPercent: number,
    updatedBy: string,
  ): Promise<void> {
    await this.tx.execute(
      sql`insert into feature_flag (id, key, org_id, enabled, rollout_percent, updated_by) values (${Id.next()}, ${key}, ${orgId}, ${enabled}, ${rolloutPercent}, ${updatedBy})
          on conflict (key, org_id) do update set enabled = excluded.enabled, rollout_percent = excluded.rollout_percent, updated_by = excluded.updated_by, updated_at = now()`,
    );
  }

  async announce(a: {
    title: string;
    body: string;
    level: string;
    orgId: string | null;
    endsAt: string | null;
    createdBy: string;
  }): Promise<string> {
    const id = Id.next();
    await this.tx.insert(s.announcement).values({ id, ...a });
    return id;
  }

  async announcements(): Promise<
    Array<{
      id: string;
      title: string;
      body: string;
      level: string;
      orgId: string | null;
      startsAt: string;
      endsAt: string | null;
    }>
  > {
    const rows = await this.tx
      .select()
      .from(s.announcement)
      .orderBy(desc(s.announcement.startsAt))
      .limit(50);
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      body: r.body,
      level: r.level,
      orgId: r.orgId,
      startsAt: new Date(r.startsAt).toISOString(),
      endsAt: r.endsAt ? new Date(r.endsAt).toISOString() : null,
    }));
  }

  async endAnnouncement(id: string): Promise<void> {
    await this.tx
      .update(s.announcement)
      .set({ endsAt: sql`now()` })
      .where(eq(s.announcement.id, id));
  }

  // ---- impersonation (spec 02 §2.7) --------------------------------------------------------------------------

  async requestImpersonation(i: {
    orgId: string;
    operatorId: string;
    reason: string;
    breakGlass: boolean;
  }): Promise<string> {
    const id = Id.next();
    await this.tx.insert(s.impersonationSession).values({
      id,
      orgId: i.orgId,
      operatorId: i.operatorId,
      reason: i.reason,
      breakGlass: i.breakGlass,
    });
    return id;
  }

  async impersonation(id: string): Promise<ImpersonationRow | null> {
    return (await impersonationRows(this.tx, sql`where i.id = ${id}`))[0] ?? null;
  }

  async allImpersonations(): Promise<ImpersonationRow[]> {
    return impersonationRows(this.tx, sql``);
  }

  async secondOperatorAuthorises(id: string, secondOperatorId: string): Promise<void> {
    await this.tx.execute(
      sql`update impersonation_session set second_operator_id = ${secondOperatorId}, state = 'approved', approved_at = now() where id = ${id} and break_glass and operator_id <> ${secondOperatorId} and state = 'requested'`,
    );
  }

  async startImpersonation(id: string, minutes: number): Promise<void> {
    await this.tx.execute(
      sql`update impersonation_session set state = 'active', started_at = now(), expires_at = now() + make_interval(mins => ${minutes}) where id = ${id} and state = 'approved'`,
    );
  }

  async endImpersonation(id: string): Promise<void> {
    await this.tx.execute(
      sql`update impersonation_session set state = 'ended', ended_at = now() where id = ${id} and state in ('approved', 'active')`,
    );
  }

  /** The active session for an operator, if any, and whether it is still inside its cap. */
  async activeImpersonation(operatorId: string, nowIso: string): Promise<ImpersonationRow | null> {
    const rows = await impersonationRows(
      this.tx,
      sql`where i.operator_id = ${operatorId} and i.state = 'active' and i.expires_at > ${nowIso}::timestamptz`,
    );
    return rows[0] ?? null;
  }

  async transcribe(id: string, action: string, subject: string, at: string): Promise<void> {
    await this.tx.execute(
      sql`update impersonation_session set transcript = transcript || ${JSON.stringify([{ at, action, subject }])}::jsonb where id = ${id}`,
    );
  }

  /** Pre-granted support access lets an operator start without a per-request approval (spec 02 §2.7 step 2). */
  async supportAccessFor(orgId: string, nowIso: string): Promise<{ writeAllowed: boolean } | null> {
    const [r] = await rawRows<{ write_allowed: boolean }>(
      this.tx,
      sql`select write_allowed from support_access_grant where org_id = ${orgId} and expires_at > ${nowIso}::timestamptz`,
    );
    return r ? { writeAllowed: r.write_allowed } : null;
  }

  // ---- job requests (§12.1 "Jobs") ----------------------------------------------------------------------------

  async requestJob(
    kind: string,
    orgId: string | null,
    args: Record<string, unknown>,
    requestedBy: string,
  ): Promise<string> {
    const id = Id.next();
    await this.tx.insert(s.platformJobRequest).values({ id, kind, orgId, args, requestedBy });
    return id;
  }

  async jobRequests(limit = 30): Promise<
    Array<{
      id: string;
      kind: string;
      orgId: string | null;
      state: string;
      result: Record<string, unknown> | null;
      createdAt: string;
      finishedAt: string | null;
    }>
  > {
    const rows = await this.tx
      .select()
      .from(s.platformJobRequest)
      .orderBy(desc(s.platformJobRequest.createdAt))
      .limit(limit);
    return rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      orgId: r.orgId,
      state: r.state,
      result: r.result ?? null,
      createdAt: new Date(r.createdAt).toISOString(),
      finishedAt: r.finishedAt ? new Date(r.finishedAt).toISOString() : null,
    }));
  }

  async claimJobRequest(): Promise<{
    id: string;
    kind: string;
    orgId: string | null;
    args: Record<string, unknown>;
  } | null> {
    const [r] = await rawRows<{
      id: string;
      kind: string;
      org_id: string | null;
      args: Record<string, unknown>;
    }>(
      this.tx,
      sql`update platform_job_request set state = 'running' where id = (select id from platform_job_request where state = 'requested' order by created_at limit 1 for update skip locked) returning id, kind, org_id, args`,
    );
    return r ? { id: r.id, kind: r.kind, orgId: r.org_id, args: r.args } : null;
  }

  async finishJobRequest(id: string, ok: boolean, result: Record<string, unknown>): Promise<void> {
    await this.tx
      .update(s.platformJobRequest)
      .set({ state: ok ? "done" : "failed", result, finishedAt: sql`now()` })
      .where(eq(s.platformJobRequest.id, id));
  }

  /** Tenants whose state keeps sync running (spec 12 §12.3): everything but offboarding. */
  async syncingOrgIds(): Promise<string[]> {
    const rows = await rawRows<{ id: string }>(
      this.tx,
      sql`select id from organization where archived_at is null and state <> 'offboarding'`,
    );
    return rows.map((r) => r.id);
  }

  async activeAnnouncementsFor(
    orgId: string,
  ): Promise<Array<{ id: string; title: string; body: string; level: string }>> {
    const rows = await rawRows<{ id: string; title: string; body: string; level: string }>(
      this.tx,
      sql`select id, title, body, level from announcement where (org_id is null or org_id = ${orgId}) and starts_at <= now() and (ends_at is null or ends_at > now()) order by starts_at desc limit 5`,
    );
    return rows;
  }

  async flagEnabled(key: string, orgId: string): Promise<boolean> {
    const rows = await rawRows<{
      org_id: string | null;
      enabled: boolean;
      rollout_percent: number;
    }>(
      this.tx,
      sql`select org_id, enabled, rollout_percent from feature_flag where key = ${key} and (org_id is null or org_id = ${orgId})`,
    );
    const specific = rows.find((r) => r.org_id === orgId);
    if (specific) return specific.enabled;
    const global = rows.find((r) => r.org_id === null);
    if (!global) return false;
    if (global.enabled) return true;
    // percentage rollout: a stable hash of the org id decides
    let h = 0;
    for (const ch of orgId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return h % 100 < num(global.rollout_percent);
  }

  /**
   * Hard purge after the grace period (§12.3): every tenant table, children before parents,
   * the order read from the foreign-key graph so a schema change cannot silently break it.
   * The organization row stays as a tombstone (archived, no name, no slug).
   */
  async purgeTenant(orgId: string): Promise<{ tables: number }> {
    const fks = await rawRows<{ child: string; parent: string }>(
      this.tx,
      sql`select c.conrelid::regclass::text as child, c.confrelid::regclass::text as parent from pg_constraint c where c.contype = 'f' and c.conrelid <> c.confrelid`,
    );
    // the tenant's audit chain is append-only by trigger and kept per the retention schedule (spec 13 §13.4)
    const tables = new Set(ORG_TABLES.filter((t) => t !== "audit_log"));
    const strip = (t: string) => t.replace(/^"|"$/g, "");
    const dependents = new Map<string, Set<string>>();
    for (const f of fks) {
      const parent = strip(f.parent);
      const child = strip(f.child);
      if (!tables.has(parent) || !tables.has(child)) continue;
      dependents.set(parent, (dependents.get(parent) ?? new Set()).add(child));
    }
    const done = new Set<string>();
    const order: string[] = [];
    const visit = (t: string, stack: Set<string>) => {
      if (done.has(t) || stack.has(t)) return;
      stack.add(t);
      for (const child of dependents.get(t) ?? []) visit(child, stack);
      stack.delete(t);
      done.add(t);
      order.push(t);
    };
    for (const t of tables) visit(t, new Set());
    for (const t of order)
      await this.tx.execute(
        sql.raw(`delete from "${t}" where org_id = '${orgId.replace(/[^0-9a-f-]/gi, "")}'`),
      );
    await this.tx.execute(
      sql`update organization set archived_at = now(), state = 'offboarding', name = 'purged', slug = ${"purged-" + orgId.slice(0, 8)} where id = ${orgId}`,
    );
    return { tables: order.length };
  }
}

/** Global reads used by the console shell without a tenant transaction. */
export async function operatorFor(db: Db, userId: string): Promise<boolean> {
  const [r] = await rawRows<{ n: number }>(
    db,
    sql`select count(*)::int as n from platform_operator where user_id = ${userId}`,
  );
  return num(r?.n) > 0;
}
