import {
  assertSendable,
  channelCapabilities,
  guardAutomation,
  Id,
  inQuietHours,
  interpolate,
  medianFirstResponseMinutes,
  pickVariant,
  ruleApplies,
  scheduledAt,
  ThrottleError,
  TransientError,
  type AutomationRule,
  type Clock,
  type ConnectivityProvider,
  type Crypto,
  type GuardContext,
  type Mailer,
  type SlaTargets,
  type ThreadPage,
} from "@pms/core";
import {
  asSystem,
  DrizzleMessagingRepository,
  rawRows,
  sql,
  withoutTenant,
  type AutomationBooking,
  type Db,
  type Tx,
} from "@pms/db";
import type { Logger } from "@pms/runtime";

export interface MessagingDeps {
  db: Db;
  provider: ConnectivityProvider;
  clock: Clock;
  crypto: Crypto;
  log: Logger;
  /** `direct` threads (staff bookings, the booking engine) go out over our own mail. */
  mailer?: Mailer;
  sla?: SlaTargets;
}

const MAX_ATTEMPTS = 5;
/** Re-read a little before the cursor: provider clocks and ours disagree by seconds. */
const CURSOR_SLACK_MS = 5 * 60_000;

const repoFor = (deps: MessagingDeps, tx: Tx, orgId: string) =>
  new DrizzleMessagingRepository(tx, orgId, deps.crypto);

/** Properties whose threads and reviews we mirror: provisioned on the provider and not archived. */
export async function messagingProperties(
  db: Db,
  orgId?: string,
): Promise<Array<{ orgId: string; propertyId: string; remoteId: string }>> {
  const rows = await withoutTenant(db, (tx) =>
    rawRows<{ org_id: string; id: string; remote: string }>(
      tx,
      sql`select org_id, id, channex_property_id as remote from property
          where archived_at is null and channex_property_id is not null and state in ('syncing', 'live')
          ${orgId ? sql`and org_id = ${orgId}` : sql``}`,
    ),
  );
  return rows.map((r) => ({ orgId: r.org_id, propertyId: r.id, remoteId: r.remote }));
}

/**
 * CXMSG-2/3: pull every thread changed since our cursor and upsert it. A
 * `message` webhook only triggers this; the 2-minute poll makes it exact.
 * The provider call happens outside the tenant transaction (ADR-0007).
 */
export async function syncThreads(
  deps: MessagingDeps,
  job: { orgId: string; propertyId: string },
): Promise<{ threads: number; newInbound: number }> {
  const [prop] = await withoutTenant(deps.db, (tx) =>
    rawRows<{ remote: string | null }>(
      tx,
      sql`select channex_property_id as remote from property where id = ${job.propertyId} and org_id = ${job.orgId}`,
    ),
  );
  if (!prop?.remote) return { threads: 0, newInbound: 0 };
  const cursor = await asSystem(deps.db, job.orgId, (tx) =>
    repoFor(deps, tx, job.orgId).syncCursor(job.propertyId),
  );
  const updatedSince = cursor
    ? new Date(Date.parse(cursor) - CURSOR_SLACK_MS).toISOString()
    : undefined;
  const threads: ThreadPage["threads"] = [];
  let page: string | undefined;
  do {
    const res = await deps.provider.listThreads(
      {
        propertyId: prop.remote,
        ...(updatedSince ? { updatedSince } : {}),
        ...(page ? { cursor: page } : {}),
      },
      { dedupeKey: `threads.list:${job.propertyId}:${String(Date.now())}`, requestId: Id.next() },
    );
    threads.push(...res.threads);
    page = res.nextCursor;
  } while (page);
  const now = deps.clock.now().toString();
  let newInbound = 0;
  await asSystem(deps.db, job.orgId, async (tx) => {
    const repo = repoFor(deps, tx, job.orgId);
    for (const t of threads) {
      const r = await repo.upsertFromProvider(job.propertyId, t, now, deps.sla);
      newInbound += r.newInbound;
    }
  });
  if (newInbound > 0)
    deps.log.info({ propertyId: job.propertyId, newInbound }, "messages.sync.inbound");
  return { threads: threads.length, newInbound };
}

/** The 2-minute poll (HOOK-6 for messages): every mirrored property. */
export async function pollThreads(
  deps: MessagingDeps,
  orgId?: string,
): Promise<{ properties: number; newInbound: number }> {
  let newInbound = 0;
  const props = await messagingProperties(deps.db, orgId);
  for (const p of props) {
    try {
      newInbound += (await syncThreads(deps, p)).newInbound;
    } catch (e) {
      deps.log.warn(
        { propertyId: p.propertyId, err: e instanceof Error ? e.message : String(e) },
        "messages.sync.failed",
      );
    }
  }
  return { properties: props.length, newInbound };
}

export async function syncReviews(
  deps: MessagingDeps,
  job: { orgId: string; propertyId: string },
): Promise<{ reviews: number; created: number }> {
  const [prop] = await withoutTenant(deps.db, (tx) =>
    rawRows<{ remote: string | null; since: string | null }>(
      tx,
      sql`select p.channex_property_id as remote, (select max(inserted_at)::text from review r where r.property_id = p.id) as since
          from property p where p.id = ${job.propertyId} and p.org_id = ${job.orgId}`,
    ),
  );
  if (!prop?.remote) return { reviews: 0, created: 0 };
  const since = prop.since
    ? new Date(Date.parse(prop.since) - CURSOR_SLACK_MS).toISOString()
    : undefined;
  const page = await deps.provider.listReviews(
    { propertyId: prop.remote, ...(since ? { since } : {}) },
    { dedupeKey: `reviews.list:${job.propertyId}:${String(Date.now())}`, requestId: Id.next() },
  );
  let created = 0;
  await asSystem(deps.db, job.orgId, async (tx) => {
    const repo = repoFor(deps, tx, job.orgId);
    for (const r of page.reviews) if (await repo.upsertReview(job.propertyId, r)) created++;
  });
  return { reviews: page.reviews.length, created };
}

export async function pollReviews(deps: MessagingDeps, orgId?: string): Promise<number> {
  let created = 0;
  for (const p of await messagingProperties(deps.db, orgId)) {
    try {
      created += (await syncReviews(deps, p)).created;
    } catch (e) {
      deps.log.warn(
        { propertyId: p.propertyId, err: e instanceof Error ? e.message : String(e) },
        "reviews.sync.failed",
      );
    }
  }
  return created;
}

/**
 * CXMSG-4: deliver queued guest messages and review responses. Only rows the
 * repository selected as guest messages get here, and `assertSendable` checks
 * the shape again: an internal note has no path to a provider (MSG-6). A failed
 * send is rendered as failed, never as delivered.
 */
export async function deliverOutbound(
  deps: MessagingDeps,
  orgId: string,
): Promise<{ sent: number; failed: number; retried: number }> {
  const queued = await asSystem(deps.db, orgId, (tx) => repoFor(deps, tx, orgId).queuedOutbound());
  const responses = await asSystem(deps.db, orgId, (tx) =>
    repoFor(deps, tx, orgId).queuedReviewResponses(),
  );
  const out = { sent: 0, failed: 0, retried: 0 };
  for (const m of queued) {
    const entry = assertSendable({
      kind: "guest_message",
      threadId: m.threadId,
      direction: "outbound",
      authorType: "staff",
      authorId: null,
      body: m.body,
      sentAt: deps.clock.now().toString(),
      providerMessageId: null,
      deliveryState: "queued",
    });
    let providerMessageId: string | undefined;
    let error: string | undefined;
    let retryable = false;
    try {
      if (m.provider === "direct") {
        if (!deps.mailer) throw new Error("no mail transport for direct threads");
        if (!m.guestEmail) throw new Error("guest has no email address");
        await deps.mailer.send({
          to: m.guestEmail,
          template: "guest_message",
          locale: "en",
          params: { name: m.guestName, body: entry.body },
        });
        providerMessageId = `mail:${m.id}`;
      } else {
        const ref = await deps.provider.sendMessage(
          {
            threadId: m.providerThreadId,
            body: entry.body,
            ...(m.attachmentProviderRefs.length ? { attachmentIds: m.attachmentProviderRefs } : {}),
          },
          { dedupeKey: `message.send:${m.id}`, requestId: Id.next() },
        );
        providerMessageId = ref.id;
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      retryable =
        (e instanceof TransientError || e instanceof ThrottleError) &&
        m.attempts + 1 < MAX_ATTEMPTS;
    }
    await asSystem(deps.db, orgId, async (tx) => {
      const repo = repoFor(deps, tx, orgId);
      if (providerMessageId !== undefined) {
        await repo.markDelivery(m.id, "sent", { providerMessageId });
        out.sent++;
      } else if (retryable) {
        await repo.markDelivery(m.id, "queued", { error: error ?? "retry" });
        out.retried++;
      } else {
        await repo.markDelivery(m.id, "failed", { error: error ?? "failed" });
        out.failed++;
        deps.log.warn({ messageId: m.id, error }, "message.deliver.failed");
      }
    });
  }
  for (const r of responses) {
    let error: string | undefined;
    let retryable = false;
    try {
      await deps.provider.respondToReview({ id: r.providerReviewId }, r.body, {
        dedupeKey: `review.respond:${r.id}`,
        requestId: Id.next(),
      });
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      retryable =
        (e instanceof TransientError || e instanceof ThrottleError) &&
        r.attempts + 1 < MAX_ATTEMPTS;
    }
    await asSystem(deps.db, orgId, (tx) =>
      repoFor(deps, tx, orgId).markReviewResponse(
        r.id,
        error === undefined ? "sent" : retryable ? "queued" : "failed",
        error,
      ),
    );
    if (error === undefined) out.sent++;
    else if (retryable) out.retried++;
    else out.failed++;
  }
  return out;
}

/** Closing a thread (resolved or Booking.com "no reply needed") reaches the provider where it supports it. */
export async function closeThreadRemote(
  deps: MessagingDeps,
  orgId: string,
  threadId: string,
  reason: "resolved" | "no_reply_needed",
): Promise<boolean> {
  const t = await asSystem(deps.db, orgId, (tx) => repoFor(deps, tx, orgId).thread(threadId));
  if (!t || t.provider === "direct" || t.providerThreadId.startsWith("booking:")) return false;
  if (!channelCapabilities(t.provider).closeThread) return false;
  await deps.provider.closeThread({ id: t.providerThreadId }, reason, {
    dedupeKey: `thread.close:${threadId}:${reason}`,
    requestId: Id.next(),
  });
  return true;
}

/** Orgs with at least one enabled rule: the only ones the automation tick visits. */
export async function orgsWithAutomation(db: Db): Promise<string[]> {
  const rows = await withoutTenant(db, (tx) =>
    rawRows<{ org_id: string }>(
      tx,
      sql`select distinct org_id from automation_rule where enabled = true`,
    ),
  );
  return rows.map((r) => r.org_id);
}

/** How far back an anchor may lie and still fire: enabling a rule must not blast last year's bookings. */
const STALE_MS = 24 * 3_600_000;

interface Candidate {
  rule: AutomationRule & { name: string };
  booking: AutomationBooking;
  dedupeKey: string;
  scheduledFor: string;
  credentialId: string | null;
  accessValidFrom: string | null;
}

/**
 * The automation tick (spec 09 §9.5, AUTO-1..7). Per org, per enabled rule,
 * per booking in the window: compute the anchor, skip anything already run
 * (the run table is the idempotency key), pass the pure guard, render the
 * template with the guest's locale variant, queue the message on the booking's
 * thread. Delivery is a separate step so no provider call happens in the transaction.
 */
export async function runAutomation(
  deps: MessagingDeps,
  orgId: string,
  window: { pastDays: number; futureDays: number } = { pastDays: 2, futureDays: 14 },
): Promise<{ sent: number; skipped: number; failed: number }> {
  const nowIso = deps.clock.now().toString();
  const nowMs = Date.parse(nowIso);
  const out = { sent: 0, skipped: 0, failed: 0 };
  await asSystem(deps.db, orgId, async (tx) => {
    const repo = repoFor(deps, tx, orgId);
    const rules = (await repo.listRules()).filter((r) => r.enabled);
    if (rules.length === 0) return;
    const today = deps.clock.today("UTC").toString();
    const bookings = await repo.bookingsForAutomation(today, window.pastDays, window.futureDays);
    const templates = await repo.listTemplates();
    const candidates: Candidate[] = [];
    for (const rule of rules)
      for (const b of bookings) {
        if (!ruleApplies(rule, b)) continue;
        let scheduledFor: string | null = null;
        let dedupeKey = `${rule.id}:${b.bookingId}:${rule.trigger}`;
        let credentialId: string | null = null;
        let accessValidFrom: string | null = null;
        switch (rule.trigger) {
          case "booking_confirmed":
            scheduledFor = b.createdAt;
            break;
          case "booking_cancelled":
            scheduledFor = b.updatedAt;
            break;
          case "checked_in":
            scheduledFor = b.checkedInAt ?? null;
            break;
          case "access_window": {
            const cred = await repo.accessCredentialFor(b.bookingId);
            if (!cred) continue;
            credentialId = cred.id;
            accessValidFrom = cred.validFrom;
            scheduledFor = new Date(Date.parse(cred.validFrom) - 24 * 3_600_000).toISOString();
            dedupeKey = `${dedupeKey}:${cred.id}`;
            break;
          }
          case "inquiry_received":
          case "message_outside_hours":
            continue; // thread-driven, handled below
          default:
            scheduledFor = scheduledAt(rule, b);
        }
        if (!scheduledFor) continue;
        const at = Date.parse(scheduledFor);
        if (at > nowMs || at < nowMs - STALE_MS) continue;
        candidates.push({
          rule,
          booking: b,
          dedupeKey,
          scheduledFor,
          credentialId,
          accessValidFrom,
        });
      }
    for (const c of candidates) {
      if (await repo.hasRun(c.dedupeKey)) continue;
      const threadId = await repo.ensureThreadForBooking(c.booking);
      const thread = (await repo.threadForBooking(c.booking.bookingId))!;
      const localToday = deps.clock.today(c.booking.timezone).toString();
      const counts = await repo.automationCounts(threadId, localToday, c.booking.timezone);
      const guardCtx: GuardContext = {
        rule: c.rule,
        nowIso,
        timezone: c.booking.timezone,
        sentTodayToGuest: counts.today,
        sentDuringStayToGuest: counts.stay,
        guestRepliedSinceLastAutomation: thread.automationHandover,
        humanClosedLoop: false,
        propertyKillSwitch: await repo.killSwitch(c.booking.propertyId),
        accessValidFrom: c.accessValidFrom,
      };
      const decision = guardAutomation(guardCtx);
      const base = {
        ruleId: c.rule.id,
        ruleVersion: c.rule.version,
        propertyId: c.booking.propertyId,
        bookingId: c.booking.bookingId,
        threadId,
        dedupeKey: c.dedupeKey,
        scheduledFor: c.scheduledFor,
      };
      if (!decision.allow) {
        if (decision.reason === "before the access window") continue;
        await repo.recordRun({
          ...base,
          state: "skipped",
          reason: decision.reason,
          messageId: null,
        });
        out.skipped++;
        continue;
      }
      if (Date.parse(decision.sendAt) > nowMs) continue; // quiet hours: try again on a later tick
      const ctx = await repo.templateContext(c.booking.bookingId);
      const tpl = templates.find((t) => t.id === c.rule.templateId);
      if (!ctx || !tpl) {
        await repo.recordRun({
          ...base,
          state: "failed",
          reason: "template or booking missing",
          messageId: null,
        });
        out.failed++;
        continue;
      }
      const variant = pickVariant(
        templates.filter((t) => t.name === tpl.name),
        ctx.guest.language ?? null,
        tpl.locale,
      );
      const rendered = interpolate(variant?.body ?? tpl.body, ctx);
      if (rendered.missing.length > 0) {
        await repo.recordRun({
          ...base,
          state: "failed",
          reason: `missing variables: ${rendered.missing.join(", ")}`,
          messageId: null,
        });
        out.failed++;
        continue;
      }
      const messageId = await repo.queueGuestMessage(threadId, {
        authorType: "automation",
        authorId: null,
        body: rendered.text,
        sentAt: nowIso,
        templateId: variant?.id ?? tpl.id,
        automation: { ruleId: c.rule.id, version: c.rule.version, name: c.rule.name },
      });
      await repo.recordRun({ ...base, state: "sent", reason: null, messageId });
      if (c.credentialId) await repo.markCredentialDelivered(c.credentialId);
      out.sent++;
    }
    // thread-driven triggers: an inquiry or an out-of-hours message gets an immediate acknowledgement
    const threadRules = rules.filter(
      (r) => r.trigger === "inquiry_received" || r.trigger === "message_outside_hours",
    );
    if (threadRules.length > 0) {
      const since = new Date(nowMs - STALE_MS).toISOString();
      for (const t of await repo.threadsNeedingAcknowledgement(since)) {
        for (const rule of threadRules) {
          if (rule.trigger === "inquiry_received" && t.kind !== "inquiry") continue;
          if (rule.trigger === "message_outside_hours") {
            if (!rule.quietHours) continue;
            if (!inQuietHours(t.lastInboundAt, t.timezone, rule.quietHours)) continue;
          }
          if (rule.conditions?.providers?.length && !rule.conditions.providers.includes(t.provider))
            continue;
          if (
            rule.conditions?.propertyIds?.length &&
            !rule.conditions.propertyIds.includes(t.propertyId)
          )
            continue;
          const dedupeKey = `${rule.id}:${t.id}:${rule.trigger}:${t.lastInboundAt}`;
          if (await repo.hasRun(dedupeKey)) continue;
          const localToday = deps.clock.today(t.timezone).toString();
          const counts = await repo.automationCounts(t.id, localToday, t.timezone);
          // the guest just wrote: quiet hours do not apply to an acknowledgement of their own message
          const { quietHours: _quiet, ...ruleNoQuiet } = rule;
          const decision = guardAutomation({
            rule: ruleNoQuiet,
            nowIso,
            timezone: t.timezone,
            sentTodayToGuest: counts.today,
            sentDuringStayToGuest: counts.stay,
            guestRepliedSinceLastAutomation: false,
            humanClosedLoop: false,
            propertyKillSwitch: await repo.killSwitch(t.propertyId),
          });
          const base = {
            ruleId: rule.id,
            ruleVersion: rule.version,
            propertyId: t.propertyId,
            bookingId: t.bookingId,
            threadId: t.id,
            dedupeKey,
            scheduledFor: t.lastInboundAt,
          };
          if (!decision.allow) {
            await repo.recordRun({
              ...base,
              state: "skipped",
              reason: decision.reason,
              messageId: null,
            });
            out.skipped++;
            continue;
          }
          const tpl = templates.find((x) => x.id === rule.templateId);
          const ctx = t.bookingId
            ? await repo.templateContext(t.bookingId)
            : {
                guest: { first_name: t.guestName.split(" ")[0] ?? "there" },
                property: { name: t.propertyTitle },
              };
          if (!tpl || !ctx) {
            await repo.recordRun({
              ...base,
              state: "failed",
              reason: "template missing",
              messageId: null,
            });
            out.failed++;
            continue;
          }
          const variant = pickVariant(
            templates.filter((x) => x.name === tpl.name),
            t.guestLanguage,
            tpl.locale,
          );
          const rendered = interpolate(variant?.body ?? tpl.body, ctx);
          const messageId = await repo.queueGuestMessage(t.id, {
            authorType: "automation",
            authorId: null,
            body: rendered.text,
            sentAt: nowIso,
            templateId: variant?.id ?? tpl.id,
            automation: { ruleId: rule.id, version: rule.version, name: rule.name },
          });
          await repo.recordRun({ ...base, state: "sent", reason: null, messageId });
          out.sent++;
        }
      }
    }
  });
  if (out.sent > 0) await deliverOutbound(deps, orgId);
  return out;
}

/** AUTO-5 preview and the composer's template preview: render against a booking, report missing variables and AUTO-7 warnings. */
export async function renderTemplate(
  tx: Tx,
  orgId: string,
  crypto: Crypto,
  templateId: string,
  bookingId: string | null,
): Promise<{ text: string; missing: string[]; templateName: string } | null> {
  const repo = new DrizzleMessagingRepository(tx, orgId, crypto);
  const tpl = await repo.template(templateId);
  if (!tpl) return null;
  const ctx = bookingId ? await repo.templateContext(bookingId) : null;
  const rendered = interpolate(
    tpl.body,
    ctx ?? { guest: { first_name: "Guest" }, property: { name: "" } },
  );
  return { text: rendered.text, missing: rendered.missing, templateName: tpl.name };
}

export interface FirstResponseKpi {
  overall: number | null;
  byProperty: Array<{ propertyId: string; title: string; median: number | null; n: number }>;
  byChannel: Array<{ provider: string; median: number | null; n: number }>;
  byAgent: Array<{ agentId: string | null; median: number | null; n: number }>;
}

/** Median first response time per property, channel and agent (spec 09 §9.9). */
export async function firstResponseKpi(
  tx: Tx,
  orgId: string,
  crypto: Crypto,
  sinceIso: string,
): Promise<FirstResponseKpi> {
  const pairs = await new DrizzleMessagingRepository(tx, orgId, crypto).firstResponsePairs(
    sinceIso,
  );
  const group = <K extends string | null>(key: (p: (typeof pairs)[number]) => K) => {
    const m = new Map<K, typeof pairs>();
    for (const p of pairs) m.set(key(p), [...(m.get(key(p)) ?? []), p]);
    return [...m.entries()].map(([k, ps]) => ({
      key: k,
      median: medianFirstResponseMinutes(ps),
      n: ps.length,
      title: ps[0]?.propertyTitle ?? "",
    }));
  };
  return {
    overall: medianFirstResponseMinutes(pairs),
    byProperty: group((p) => p.propertyId).map((g) => ({
      propertyId: g.key,
      title: g.title,
      median: g.median,
      n: g.n,
    })),
    byChannel: group((p) => p.provider).map((g) => ({ provider: g.key, median: g.median, n: g.n })),
    byAgent: group((p) => p.agentId).map((g) => ({ agentId: g.key, median: g.median, n: g.n })),
  };
}
