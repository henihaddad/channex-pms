import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  firstResponseDue,
  Id,
  matchesView,
  providerCode,
  slaState,
  type AutomationRule,
  type AutomationTrigger,
  type BookingForAutomation,
  type Crypto,
  type InboxView,
  type MessageTemplate,
  type SlaState,
  type TemplateContext,
  type Thread,
  type ThreadPage,
} from "@pms/core";
import * as s from "../schema/index.js";
import { rawRows, type Tx } from "../tenant.js";

export interface ThreadRow {
  id: string;
  propertyId: string;
  propertyTitle: string;
  timezone: string;
  provider: string;
  providerThreadId: string;
  kind: "booking" | "inquiry";
  state: "open" | "closed" | "no_reply_needed";
  guestName: string;
  guestLanguage: string | null;
  preview: string;
  unreadCount: number;
  lastMessageAt: string | null;
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
  firstResponseDueAt: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  snoozedUntil: string | null;
  tags: string[];
  automationHandover: boolean;
  bookingId: string | null;
  arrivalDate: string | null;
  departureDate: string | null;
  bookingStatus: string | null;
  opsState: string | null;
  sla: SlaState;
}

export interface MessageRow {
  id: string;
  kind: "guest_message" | "note";
  direction: "inbound" | "outbound" | null;
  authorType: "guest" | "staff" | "system" | "automation";
  authorId: string | null;
  authorName: string | null;
  body: string;
  deliveryState: string | null;
  deliveryError: string | null;
  providerMessageId: string | null;
  sentAt: string;
  automationRuleName: string | null;
  automationRuleVersion: number | null;
  templateId: string | null;
  attachments: Array<{ id: string; filename: string; contentType: string; storageRef: string }>;
}

export interface ThreadDetail extends ThreadRow {
  messages: MessageRow[];
  booking: {
    id: string;
    otaReservationCode: string | null;
    arrivalDate: string;
    departureDate: string;
    status: string;
    opsState: string;
    currency: string;
    totalMinor: number;
    balanceMinor: number;
    roomType: string | null;
    unit: string | null;
    previousStays: number;
  } | null;
}

export interface QueuedOutbound {
  id: string;
  threadId: string;
  providerThreadId: string;
  provider: string;
  propertyId: string;
  body: string;
  attempts: number;
  attachmentProviderRefs: string[];
  guestEmail: string | null;
  guestName: string;
}

export interface RuleRow extends AutomationRule {
  templateName: string;
  createdAt: string;
  updatedAt: string;
}

export interface AutomationBooking extends BookingForAutomation {
  channexBookingId: string;
  guestId: string | null;
  /** Provider timestamps of the first and latest revision: the anchors for event triggers. */
  createdAt: string;
  updatedAt: string;
  propertyTitle: string;
}

export interface ReviewRow {
  id: string;
  propertyId: string;
  propertyTitle: string;
  provider: string;
  rating: number;
  body: string;
  guestName: string;
  insertedAt: string;
  canRespond: boolean;
  responseState: string;
  responseDueAt: string | null;
  response: { body: string; deliveryState: string; sentAt: string | null } | null;
  bookingId: string | null;
}

const later = (a: string | undefined, b: string): string => (a !== undefined && a > b ? a : b);
const preview = (body: string): string => (body.length > 90 ? `${body.slice(0, 90)}…` : body);

/** Threads, messages, templates, automation and reviews (spec 09). Bodies and guest names are sealed. */
export class DrizzleMessagingRepository {
  constructor(
    private readonly tx: Tx,
    private readonly orgId: string,
    private readonly crypto: Crypto,
  ) {}

  // ---- sync (CXMSG-2, CXMSG-3) ------------------------------------------------------------

  /** Latest provider change we have seen for a property; the poll asks for everything since then. */
  async syncCursor(propertyId: string): Promise<string | null> {
    const [r] = await rawRows<{ at: string | null }>(
      this.tx,
      sql`select max(provider_updated_at)::text as at from message_thread where property_id = ${propertyId}`,
    );
    return r?.at ?? null;
  }

  /**
   * Idempotent upsert of a provider thread: unknown messages are appended (by
   * provider message id), unread and SLA fields move only on new inbound.
   * Outbound messages we queued ourselves are matched by provider id and marked sent.
   */
  async upsertFromProvider(
    propertyId: string,
    t: ThreadPage["threads"][number],
    nowIso: string,
    sla?: { firstResponseMinutes: number; resolutionHours: number },
  ): Promise<{ threadId: string; newInbound: number; created: boolean }> {
    const provider = providerCode(t.provider);
    const [booking] = t.bookingId
      ? await rawRows<{ id: string; guest_id: string | null }>(
          this.tx,
          sql`select id, guest_id from booking where property_id = ${propertyId} and channex_booking_id = ${t.bookingId}`,
        )
      : [];
    let [existing] = await rawRows<{ id: string; state: string }>(
      this.tx,
      sql`select id, state from message_thread where property_id = ${propertyId} and provider_thread_id = ${t.id}`,
    );
    if (!existing && booking) {
      // an automation wrote first through `booking:<id>`; adopt the provider's thread id
      const [placeholder] = await rawRows<{ id: string; state: string }>(
        this.tx,
        sql`select id, state from message_thread where property_id = ${propertyId} and provider_thread_id = ${"booking:" + t.bookingId}`,
      );
      if (placeholder) {
        await this.tx.execute(
          sql`update message_thread set provider_thread_id = ${t.id} where id = ${placeholder.id}`,
        );
        existing = placeholder;
      }
    }
    let threadId = existing?.id;
    let created = false;
    if (!threadId) {
      threadId = Id.next();
      created = true;
      await this.tx.insert(s.messageThread).values({
        id: threadId,
        orgId: this.orgId,
        propertyId,
        providerThreadId: t.id,
        provider,
        bookingId: booking?.id ?? null,
        guestId: booking?.guest_id ?? null,
        kind: t.kind ?? (t.bookingId ? "booking" : "inquiry"),
        state: t.state === "closed" ? "closed" : "open",
        guestNameEnc: t.guestName ? await this.crypto.seal(t.guestName) : null,
        guestLanguage: t.guestLanguage ?? null,
        providerUpdatedAt: t.updatedAt ?? nowIso,
      });
    }
    const known = new Set(
      (
        await rawRows<{ pid: string }>(
          this.tx,
          sql`select provider_message_id as pid from message where thread_id = ${threadId} and provider_message_id is not null`,
        )
      ).map((r) => r.pid),
    );
    let newInbound = 0;
    let lastInbound: string | undefined;
    let lastAny: string | undefined;
    for (const m of t.messages) {
      if (known.has(m.id)) continue;
      if (m.direction === "outbound") {
        // one of ours? match the oldest queued/sent message without a provider id and the same body
        const [ours] = await rawRows<{ id: string }>(
          this.tx,
          sql`select m.id from message m where m.thread_id = ${threadId} and m.kind = 'guest_message' and m.direction = 'outbound'
              and m.provider_message_id is null and m.body_enc = ${await this.crypto.seal(m.body)} order by m.sent_at asc limit 1`,
        );
        if (ours) {
          await this.tx.execute(
            sql`update message set provider_message_id = ${m.id}, delivery_state = 'sent' where id = ${ours.id}`,
          );
          known.add(m.id);
          continue;
        }
      }
      await this.tx.insert(s.message).values({
        id: Id.next(),
        orgId: this.orgId,
        threadId,
        kind: "guest_message",
        direction: m.direction,
        authorType:
          m.direction === "inbound" ? (m.authorType === "system" ? "system" : "guest") : "staff",
        bodyEnc: await this.crypto.seal(m.body),
        providerMessageId: m.id,
        deliveryState: m.direction === "inbound" ? "received" : "sent",
        sentAt: m.sentAt || nowIso,
      });
      known.add(m.id);
      for (const a of m.attachments ?? [])
        await this.tx.insert(s.attachment).values({
          id: Id.next(),
          orgId: this.orgId,
          threadId,
          filename: a.filename,
          contentType: a.contentType,
          storageRef: `provider:${a.id}`,
          providerRef: a.id,
          scanState: "pending",
        });
      lastAny = later(lastAny, m.sentAt);
      if (m.direction === "inbound") {
        newInbound += 1;
        lastInbound = later(lastInbound, m.sentAt);
      }
    }
    const lastBody = t.messages.at(-1)?.body;
    if (newInbound > 0 && lastInbound) {
      const due = firstResponseDue(lastInbound, sla);
      await this.tx.execute(sql`
        update message_thread set unread_count = unread_count + ${newInbound}, last_inbound_at = ${lastInbound},
          last_message_at = greatest(coalesce(last_message_at, ${lastInbound}), ${lastInbound}),
          first_response_due_at = case when last_outbound_at is null or last_outbound_at < ${lastInbound} then ${due} else first_response_due_at end,
          first_response_at = case when last_outbound_at is null or last_outbound_at < ${lastInbound} then null else first_response_at end,
          automation_handover = true, state = case when state = 'closed' then 'open' else state end,
          snoozed_until = null, updated_at = now()
        where id = ${threadId}`);
    }
    await this.tx.execute(sql`
      update message_thread set provider_updated_at = greatest(coalesce(provider_updated_at, ${t.updatedAt ?? nowIso}), ${t.updatedAt ?? nowIso}),
        last_message_at = greatest(coalesce(last_message_at, ${lastAny ?? nowIso}), ${lastAny ?? nowIso}),
        guest_name_enc = coalesce(guest_name_enc, ${t.guestName ? await this.crypto.seal(t.guestName) : null}),
        guest_language = coalesce(guest_language, ${t.guestLanguage ?? null}),
        booking_id = coalesce(booking_id, ${booking?.id ?? null}), guest_id = coalesce(guest_id, ${booking?.guest_id ?? null}),
        state = case when ${t.state === "closed"} and state = 'open' and ${newInbound} = 0 then 'closed' else state end
      where id = ${threadId}`);
    if (lastBody !== undefined && newInbound === 0 && created)
      await this.tx.execute(
        sql`update message_thread set updated_at = now() where id = ${threadId}`,
      );
    return { threadId, newInbound, created };
  }

  // ---- inbox reads (MSG-1, spec 09 §9.1) --------------------------------------------------

  private async rows(where: ReturnType<typeof sql>, nowIso: string): Promise<ThreadRow[]> {
    const rows = await rawRows<{
      id: string;
      property_id: string;
      property_title: string;
      timezone: string;
      provider: string;
      provider_thread_id: string;
      kind: "booking" | "inquiry";
      state: ThreadRow["state"];
      guest_name_enc: string | null;
      guest_language: string | null;
      unread_count: number;
      last_message_at: string | null;
      last_inbound_at: string | null;
      last_outbound_at: string | null;
      first_response_due_at: string | null;
      assignee_id: string | null;
      assignee_name: string | null;
      snoozed_until: string | null;
      tags: string[];
      automation_handover: boolean;
      booking_id: string | null;
      arrival_date: string | null;
      departure_date: string | null;
      booking_status: string | null;
      ops_state: string | null;
      preview_enc: string | null;
    }>(
      this.tx,
      sql`select t.id, t.property_id, p.title as property_title, p.timezone, t.provider, t.provider_thread_id, t.kind, t.state,
            t.guest_name_enc, t.guest_language, t.unread_count, t.last_message_at::text, t.last_inbound_at::text, t.last_outbound_at::text,
            t.first_response_due_at::text, t.assignee_id, u.name as assignee_name, t.snoozed_until::text, t.tags, t.automation_handover,
            t.booking_id, b.arrival_date::text, b.departure_date::text, b.status as booking_status, b.ops_state,
            (select m.body_enc from message m where m.thread_id = t.id and m.kind = 'guest_message' order by m.sent_at desc limit 1) as preview_enc
          from message_thread t
          join property p on p.id = t.property_id
          left join "user" u on u.id = t.assignee_id
          left join booking b on b.id = t.booking_id
          where ${where}
          order by coalesce(t.last_inbound_at, t.last_message_at, t.created_at) desc
          limit 500`,
    );
    const out: ThreadRow[] = [];
    for (const r of rows) {
      const base = {
        id: r.id,
        propertyId: r.property_id,
        propertyTitle: r.property_title,
        timezone: r.timezone,
        provider: r.provider,
        providerThreadId: r.provider_thread_id,
        kind: r.kind,
        state: r.state,
        guestName: r.guest_name_enc ? await this.crypto.open(r.guest_name_enc) : "Guest",
        guestLanguage: r.guest_language,
        preview: r.preview_enc ? preview(await this.crypto.open(r.preview_enc)) : "",
        unreadCount: r.unread_count,
        lastMessageAt: r.last_message_at,
        lastInboundAt: r.last_inbound_at,
        lastOutboundAt: r.last_outbound_at,
        firstResponseDueAt: r.first_response_due_at,
        assigneeId: r.assignee_id,
        assigneeName: r.assignee_name,
        snoozedUntil: r.snoozed_until,
        tags: r.tags,
        automationHandover: r.automation_handover,
        bookingId: r.booking_id,
        arrivalDate: r.arrival_date,
        departureDate: r.departure_date,
        bookingStatus: r.booking_status,
        opsState: r.ops_state,
      };
      out.push({ ...base, sla: slaState(toThread(base), nowIso) });
    }
    return out;
  }

  async list(f: {
    view: InboxView;
    userId: string;
    nowIso: string;
    today: string;
    propertyId?: string | null;
    provider?: string | null;
    search?: string | null;
  }): Promise<ThreadRow[]> {
    const conds = [sql`true`];
    if (f.propertyId) conds.push(sql`t.property_id = ${f.propertyId}`);
    if (f.provider) conds.push(sql`t.provider = ${f.provider}`);
    if (f.view !== "closed" && f.view !== "all" && f.view !== "snoozed")
      conds.push(sql`t.state = 'open'`);
    const rows = await this.rows(sql.join(conds, sql` and `), f.nowIso);
    const tomorrow = new Date(Date.parse(`${f.today}T00:00:00Z`) + 86_400_000)
      .toISOString()
      .slice(0, 10);
    const q = f.search?.trim().toLowerCase();
    return rows.filter((r) => {
      if (
        !matchesView(toThread(r), f.view, {
          nowIso: f.nowIso,
          userId: f.userId,
          arrivalWindow: { from: f.today, to: tomorrow },
          arrivalDate: r.arrivalDate,
          inHouse: r.opsState === "in_house",
        })
      )
        return false;
      if (!q) return true;
      return (
        r.guestName.toLowerCase().includes(q) ||
        r.preview.toLowerCase().includes(q) ||
        r.propertyTitle.toLowerCase().includes(q) ||
        r.tags.some((t) => t.toLowerCase().includes(q))
      );
    });
  }

  /** MSG-2: the nav badge and the filter counts. */
  async counts(
    userId: string,
    nowIso: string,
  ): Promise<{ unread: number; needsReply: number; breaching: number; assignedToMe: number }> {
    const rows = await this.rows(sql`t.state = 'open'`, nowIso);
    const ctx = { nowIso, userId };
    return {
      unread: rows.reduce((a, r) => a + r.unreadCount, 0),
      needsReply: rows.filter((r) => matchesView(toThread(r), "needs_reply", ctx)).length,
      breaching: rows.filter((r) => matchesView(toThread(r), "breaching_sla", ctx)).length,
      assignedToMe: rows.filter((r) => matchesView(toThread(r), "assigned_to_me", ctx)).length,
    };
  }

  async detail(threadId: string, nowIso: string): Promise<ThreadDetail | null> {
    const [row] = await this.rows(sql`t.id = ${threadId}`, nowIso);
    if (!row) return null;
    const ms = await rawRows<{
      id: string;
      kind: MessageRow["kind"];
      direction: MessageRow["direction"];
      author_type: MessageRow["authorType"];
      author_id: string | null;
      author_name: string | null;
      body_enc: string;
      delivery_state: string | null;
      delivery_error: string | null;
      provider_message_id: string | null;
      sent_at: string;
      automation_rule_name: string | null;
      automation_rule_version: number | null;
      template_id: string | null;
    }>(
      this.tx,
      sql`select m.id, m.kind, m.direction, m.author_type, m.author_id, u.name as author_name, m.body_enc, m.delivery_state, m.delivery_error,
            m.provider_message_id, m.sent_at::text, m.automation_rule_name, m.automation_rule_version, m.template_id
          from message m left join "user" u on u.id = m.author_id where m.thread_id = ${threadId} order by m.sent_at asc, m.created_at asc`,
    );
    const atts = await rawRows<{
      id: string;
      message_id: string | null;
      filename: string;
      content_type: string;
      storage_ref: string;
    }>(
      this.tx,
      sql`select id, message_id, filename, content_type, storage_ref from attachment where thread_id = ${threadId}`,
    );
    const messages: MessageRow[] = [];
    for (const m of ms)
      messages.push({
        id: m.id,
        kind: m.kind,
        direction: m.direction,
        authorType: m.author_type,
        authorId: m.author_id,
        authorName: m.author_name,
        body: await this.crypto.open(m.body_enc),
        deliveryState: m.delivery_state,
        deliveryError: m.delivery_error,
        providerMessageId: m.provider_message_id,
        sentAt: m.sent_at,
        automationRuleName: m.automation_rule_name,
        automationRuleVersion: m.automation_rule_version,
        templateId: m.template_id,
        attachments: atts
          .filter((a) => a.message_id === m.id)
          .map((a) => ({
            id: a.id,
            filename: a.filename,
            contentType: a.content_type,
            storageRef: a.storage_ref,
          })),
      });
    let booking: ThreadDetail["booking"] = null;
    if (row.bookingId) {
      const [b] = await rawRows<{
        id: string;
        ota_reservation_code: string | null;
        arrival_date: string;
        departure_date: string;
        status: string;
        ops_state: string;
        currency: string;
        total_amount_minor: number;
        balance_minor: number | null;
        room_type: string | null;
        unit: string | null;
        previous_stays: number;
      }>(
        this.tx,
        sql`select b.id, b.ota_reservation_code, b.arrival_date::text, b.departure_date::text, b.status, b.ops_state, b.currency, b.total_amount_minor,
              (select coalesce(sum(fl.amount_minor), 0) - coalesce((select sum(p.amount_minor) from payment p join folio f2 on f2.id = p.folio_id where f2.booking_id = b.id), 0)
                 from folio_line fl join folio f on f.id = fl.folio_id where f.booking_id = b.id)::int as balance_minor,
              (select rt.title from booking_room br join room_type rt on rt.id = br.room_type_id where br.booking_id = b.id limit 1) as room_type,
              (select u.name from booking_room br join unit u on u.id = br.assigned_unit_id where br.booking_id = b.id limit 1) as unit,
              (select count(*)::int from booking b2 where b2.guest_id = b.guest_id and b2.id <> b.id and b2.status <> 'cancelled') as previous_stays
            from booking b where b.id = ${row.bookingId}`,
      );
      if (b)
        booking = {
          id: b.id,
          otaReservationCode: b.ota_reservation_code,
          arrivalDate: b.arrival_date,
          departureDate: b.departure_date,
          status: b.status,
          opsState: b.ops_state,
          currency: b.currency,
          totalMinor: Number(b.total_amount_minor),
          balanceMinor: Number(b.balance_minor ?? 0),
          roomType: b.room_type,
          unit: b.unit,
          previousStays: b.previous_stays,
        };
    }
    return { ...row, messages, booking };
  }

  async markRead(threadId: string): Promise<void> {
    await this.tx.execute(
      sql`update message_thread set unread_count = 0, updated_at = now() where id = ${threadId}`,
    );
  }

  // ---- composing (MSG-3..6) -----------------------------------------------------------------

  /** A note: no direction, no delivery state; the CHECK constraint refuses anything else. */
  async addNote(threadId: string, authorId: string, body: string, sentAt: string): Promise<string> {
    const id = Id.next();
    await this.tx.insert(s.message).values({
      id,
      orgId: this.orgId,
      threadId,
      kind: "note",
      direction: null,
      authorType: "staff",
      authorId,
      bodyEnc: await this.crypto.seal(body),
      deliveryState: null,
      sentAt,
    });
    return id;
  }

  /** An outbound guest message, queued for `message.deliver`. Staff replies stop the SLA clock and end the automation handover. */
  async queueGuestMessage(
    threadId: string,
    m: {
      authorType: "staff" | "automation";
      authorId: string | null;
      body: string;
      sentAt: string;
      templateId?: string | null;
      automation?: { ruleId: string; version: number; name: string };
    },
  ): Promise<string> {
    const id = Id.next();
    await this.tx.insert(s.message).values({
      id,
      orgId: this.orgId,
      threadId,
      kind: "guest_message",
      direction: "outbound",
      authorType: m.authorType,
      authorId: m.authorId,
      bodyEnc: await this.crypto.seal(m.body),
      deliveryState: "queued",
      templateId: m.templateId ?? null,
      automationRuleId: m.automation?.ruleId ?? null,
      automationRuleVersion: m.automation?.version ?? null,
      automationRuleName: m.automation?.name ?? null,
      sentAt: m.sentAt,
    });
    await this.tx.execute(sql`
      update message_thread set last_outbound_at = ${m.sentAt}, last_message_at = greatest(coalesce(last_message_at, ${m.sentAt}), ${m.sentAt}),
        first_response_at = case when first_response_at is null and last_inbound_at is not null then ${m.sentAt} else first_response_at end,
        automation_handover = case when ${m.authorType === "staff"} then false else automation_handover end,
        updated_at = now()
      where id = ${threadId}`);
    return id;
  }

  /** Only guest messages can be here: the SQL says so and `assertSendable` says so again in the job. */
  async queuedOutbound(limit = 100): Promise<QueuedOutbound[]> {
    const rows = await rawRows<{
      id: string;
      thread_id: string;
      provider_thread_id: string;
      provider: string;
      property_id: string;
      body_enc: string;
      attempts: number;
      guest_name_enc: string | null;
      email_enc: string | null;
      refs: string[] | null;
    }>(
      this.tx,
      sql`select m.id, m.thread_id, t.provider_thread_id, t.provider, t.property_id, m.body_enc, m.attempts, t.guest_name_enc, g.email_enc,
            (select array_agg(a.provider_ref) from attachment a where a.message_id = m.id and a.provider_ref is not null) as refs
          from message m join message_thread t on t.id = m.thread_id left join guest g on g.id = t.guest_id
          where m.kind = 'guest_message' and m.direction = 'outbound' and m.delivery_state = 'queued'
          order by m.sent_at asc limit ${limit}`,
    );
    const out: QueuedOutbound[] = [];
    for (const r of rows)
      out.push({
        id: r.id,
        threadId: r.thread_id,
        providerThreadId: r.provider_thread_id,
        provider: r.provider,
        propertyId: r.property_id,
        body: await this.crypto.open(r.body_enc),
        attempts: r.attempts,
        attachmentProviderRefs: r.refs ?? [],
        guestEmail: r.email_enc ? await this.crypto.open(r.email_enc) : null,
        guestName: r.guest_name_enc ? await this.crypto.open(r.guest_name_enc) : "Guest",
      });
    return out;
  }

  async markDelivery(
    messageId: string,
    state: "queued" | "sent" | "failed",
    opts: { providerMessageId?: string; error?: string } = {},
  ): Promise<void> {
    await this.tx.execute(sql`
      update message set delivery_state = ${state}, attempts = attempts + 1,
        provider_message_id = coalesce(${opts.providerMessageId ?? null}, provider_message_id),
        delivery_error = ${opts.error ?? null}
      where id = ${messageId} and kind = 'guest_message'`);
  }

  async retry(messageId: string): Promise<void> {
    await this.tx.execute(
      sql`update message set delivery_state = 'queued', delivery_error = null where id = ${messageId} and kind = 'guest_message' and delivery_state = 'failed'`,
    );
  }

  async setState(
    threadId: string,
    state: "open" | "closed" | "no_reply_needed",
    reason: string | null,
  ): Promise<void> {
    await this.tx.execute(sql`
      update message_thread set state = ${state}, state_reason = ${reason},
        automation_handover = case when ${state !== "open"} then false else automation_handover end,
        first_response_at = case when ${state === "no_reply_needed"} and first_response_at is null then now() else first_response_at end,
        updated_at = now() where id = ${threadId}`);
  }

  async assign(threadId: string, userId: string | null): Promise<void> {
    await this.tx.execute(
      sql`update message_thread set assignee_id = ${userId}, updated_at = now() where id = ${threadId}`,
    );
  }

  async snooze(threadId: string, until: string | null): Promise<void> {
    await this.tx.execute(
      sql`update message_thread set snoozed_until = ${until}, updated_at = now() where id = ${threadId}`,
    );
  }

  async setTags(threadId: string, tags: string[]): Promise<void> {
    await this.tx.execute(
      sql`update message_thread set tags = ${JSON.stringify(tags)}::jsonb, updated_at = now() where id = ${threadId}`,
    );
  }

  async thread(threadId: string): Promise<{
    id: string;
    propertyId: string;
    providerThreadId: string;
    provider: string;
    state: string;
  } | null> {
    const [r] = await rawRows<{
      id: string;
      property_id: string;
      provider_thread_id: string;
      provider: string;
      state: string;
    }>(
      this.tx,
      sql`select id, property_id, provider_thread_id, provider, state from message_thread where id = ${threadId}`,
    );
    return r
      ? {
          id: r.id,
          propertyId: r.property_id,
          providerThreadId: r.provider_thread_id,
          provider: r.provider,
          state: r.state,
        }
      : null;
  }

  async addAttachment(a: {
    threadId: string;
    messageId: string | null;
    filename: string;
    contentType: string;
    sizeBytes: number;
    storageRef: string;
    providerRef: string | null;
  }): Promise<string> {
    const id = Id.next();
    await this.tx.insert(s.attachment).values({ id, orgId: this.orgId, ...a, scanState: "clean" });
    return id;
  }

  // ---- templates (spec 09 §9.3) --------------------------------------------------------------

  async listTemplates(): Promise<Array<MessageTemplate & { warnings: string[] }>> {
    const rows = await this.tx
      .select()
      .from(s.messageTemplate)
      .where(and(eq(s.messageTemplate.orgId, this.orgId), isNull(s.messageTemplate.archivedAt)))
      .orderBy(s.messageTemplate.category, s.messageTemplate.name, s.messageTemplate.locale);
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      category: r.category,
      locale: r.locale,
      channelScope: r.channelScope ?? null,
      body: r.body,
      warnings: r.warnings,
    }));
  }

  async template(id: string): Promise<MessageTemplate | null> {
    const [r] = await this.tx
      .select()
      .from(s.messageTemplate)
      .where(and(eq(s.messageTemplate.id, id), eq(s.messageTemplate.orgId, this.orgId)));
    return r
      ? {
          id: r.id,
          name: r.name,
          category: r.category,
          locale: r.locale,
          channelScope: r.channelScope ?? null,
          body: r.body,
        }
      : null;
  }

  async saveTemplate(t: {
    id?: string | null;
    name: string;
    category: string;
    locale: string;
    channelScope: string[] | null;
    body: string;
    warnings: string[];
    createdBy: string;
  }): Promise<string> {
    const id = t.id ?? Id.next();
    await this.tx
      .insert(s.messageTemplate)
      .values({
        id,
        orgId: this.orgId,
        name: t.name,
        category: t.category,
        locale: t.locale,
        channelScope: t.channelScope,
        body: t.body,
        warnings: t.warnings,
        createdBy: t.createdBy,
      })
      .onConflictDoUpdate({
        target: s.messageTemplate.id,
        set: {
          name: t.name,
          category: t.category,
          locale: t.locale,
          channelScope: t.channelScope,
          body: t.body,
          warnings: t.warnings,
          updatedAt: sql`now()`,
          archivedAt: null,
        },
      });
    return id;
  }

  async archiveTemplate(id: string): Promise<void> {
    await this.tx.execute(
      sql`update message_template set archived_at = now() where id = ${id} and org_id = ${this.orgId}`,
    );
  }

  // ---- automation (spec 09 §9.5) -------------------------------------------------------------

  async listRules(): Promise<RuleRow[]> {
    const rows = await rawRows<{
      id: string;
      name: string;
      version: number;
      trigger: AutomationTrigger;
      offset_days: number | null;
      at_local_time: string | null;
      conditions: AutomationRule["conditions"];
      template_id: string;
      template_name: string;
      quiet_from: string | null;
      quiet_to: string | null;
      enabled: boolean;
      created_at: string;
      updated_at: string;
    }>(
      this.tx,
      sql`select r.id, r.name, r.version, r.trigger, r.offset_days, r.at_local_time, r.conditions, r.template_id, t.name as template_name,
            r.quiet_from, r.quiet_to, r.enabled, r.created_at::text, r.updated_at::text
          from automation_rule r join message_template t on t.id = r.template_id where r.org_id = ${this.orgId} order by r.created_at`,
    );
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      version: r.version,
      trigger: r.trigger,
      ...(r.offset_days !== null ? { offsetDays: r.offset_days } : {}),
      ...(r.at_local_time ? { atLocalTime: r.at_local_time } : {}),
      conditions: r.conditions ?? {},
      templateId: r.template_id,
      templateName: r.template_name,
      ...(r.quiet_from && r.quiet_to ? { quietHours: { from: r.quiet_from, to: r.quiet_to } } : {}),
      enabled: r.enabled,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }

  async saveRule(r: {
    id?: string | null;
    name: string;
    trigger: AutomationTrigger;
    offsetDays: number | null;
    atLocalTime: string | null;
    conditions: Record<string, unknown>;
    templateId: string;
    quietFrom: string | null;
    quietTo: string | null;
    createdBy: string;
  }): Promise<string> {
    const id = r.id ?? Id.next();
    await this.tx
      .insert(s.automationRule)
      .values({
        id,
        orgId: this.orgId,
        name: r.name,
        trigger: r.trigger,
        offsetDays: r.offsetDays,
        atLocalTime: r.atLocalTime,
        conditions: r.conditions,
        templateId: r.templateId,
        quietFrom: r.quietFrom,
        quietTo: r.quietTo,
        createdBy: r.createdBy,
      })
      .onConflictDoUpdate({
        target: s.automationRule.id,
        set: {
          name: r.name,
          trigger: r.trigger,
          offsetDays: r.offsetDays,
          atLocalTime: r.atLocalTime,
          conditions: r.conditions,
          templateId: r.templateId,
          quietFrom: r.quietFrom,
          quietTo: r.quietTo,
          version: sql`${s.automationRule.version} + 1`,
          updatedAt: sql`now()`,
        },
      });
    return id;
  }

  async setRuleEnabled(id: string, enabled: boolean): Promise<void> {
    await this.tx.execute(
      sql`update automation_rule set enabled = ${enabled}, updated_at = now() where id = ${id} and org_id = ${this.orgId}`,
    );
  }

  /** AUTO-6: the per-property kill switch lives in property settings. */
  async killSwitch(propertyId: string): Promise<boolean> {
    const [r] = await rawRows<{ on: boolean | null }>(
      this.tx,
      sql`select (settings->>'automation_kill_switch')::boolean as "on" from property where id = ${propertyId}`,
    );
    return r?.on === true;
  }

  async setKillSwitch(propertyId: string, on: boolean): Promise<void> {
    await this.tx.execute(
      sql`update property set settings = settings || jsonb_build_object('automation_kill_switch', ${on}::boolean), updated_at = now() where id = ${propertyId}`,
    );
  }

  /** Bookings an automation could address: not too far past, within the planning window ahead. */
  async bookingsForAutomation(
    today: string,
    pastDays: number,
    futureDays: number,
  ): Promise<AutomationBooking[]> {
    const rows = await rawRows<{
      id: string;
      channex_booking_id: string;
      property_id: string;
      property_title: string;
      timezone: string;
      ota_name: string | null;
      arrival_date: string;
      departure_date: string;
      status: "new" | "modified" | "cancelled";
      guest_id: string | null;
      created_at: string;
      updated_at: string;
      checked_in_at: string | null;
    }>(
      this.tx,
      sql`select b.id, b.channex_booking_id, b.property_id, p.title as property_title, p.timezone, b.ota_name, b.arrival_date::text, b.departure_date::text,
            b.status, b.guest_id,
            coalesce((select min(r.inserted_at) from booking_revision r where r.booking_id = b.id), b.created_at::text) as created_at,
            coalesce(b.last_revision_inserted_at, b.updated_at::text) as updated_at, ss.checked_in_at::text
          from booking b join property p on p.id = b.property_id
          left join stay_state ss on ss.booking_id = b.id
          where b.mapping_state = 'mapped' and p.archived_at is null
            and b.departure_date >= (${today}::date - ${pastDays}::int) and b.arrival_date <= (${today}::date + ${futureDays}::int)`,
    );
    return rows.map((r) => ({
      bookingId: r.id,
      channexBookingId: r.channex_booking_id,
      propertyId: r.property_id,
      propertyTitle: r.property_title,
      provider: providerCode(r.ota_name),
      arrivalDate: r.arrival_date,
      departureDate: r.departure_date,
      status: r.status,
      timezone: r.timezone,
      guestId: r.guest_id,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      checkedInAt: r.checked_in_at,
    }));
  }

  async threadForBooking(bookingId: string): Promise<{
    id: string;
    providerThreadId: string;
    automationHandover: boolean;
    state: string;
  } | null> {
    const [r] = await rawRows<{
      id: string;
      provider_thread_id: string;
      automation_handover: boolean;
      state: string;
    }>(
      this.tx,
      sql`select id, provider_thread_id, automation_handover, state from message_thread where booking_id = ${bookingId} order by created_at limit 1`,
    );
    return r
      ? {
          id: r.id,
          providerThreadId: r.provider_thread_id,
          automationHandover: r.automation_handover,
          state: r.state,
        }
      : null;
  }

  /** A thread addressed to the booking until the provider opens its own (adopted on the next sync). */
  async ensureThreadForBooking(b: AutomationBooking): Promise<string> {
    const existing = await this.threadForBooking(b.bookingId);
    if (existing) return existing.id;
    const id = Id.next();
    const [g] = b.guestId
      ? await rawRows<{ name_enc: string; surname_enc: string; language: string | null }>(
          this.tx,
          sql`select name_enc, surname_enc, language from guest where id = ${b.guestId}`,
        )
      : [];
    const name = g
      ? `${await this.crypto.open(g.name_enc)} ${await this.crypto.open(g.surname_enc)}`.trim()
      : null;
    await this.tx.insert(s.messageThread).values({
      id,
      orgId: this.orgId,
      propertyId: b.propertyId,
      providerThreadId: `booking:${b.channexBookingId}`,
      provider: b.provider,
      bookingId: b.bookingId,
      guestId: b.guestId,
      kind: "booking",
      state: "open",
      guestNameEnc: name ? await this.crypto.seal(name) : null,
      guestLanguage: g?.language ?? null,
    });
    return id;
  }

  /** AUTO-2 inputs: automated messages already sent (or queued) on the thread today and in total. */
  async automationCounts(
    threadId: string,
    localDate: string,
    timezone: string,
  ): Promise<{ today: number; stay: number }> {
    const [r] = await rawRows<{ today: number; stay: number }>(
      this.tx,
      sql`select count(*) filter (where (sent_at at time zone ${timezone})::date = ${localDate}::date)::int as today, count(*)::int as stay
          from message where thread_id = ${threadId} and author_type = 'automation' and kind = 'guest_message' and delivery_state <> 'failed'`,
    );
    return { today: r?.today ?? 0, stay: r?.stay ?? 0 };
  }

  async accessCredentialFor(bookingId: string): Promise<{
    id: string;
    validFrom: string;
    validTo: string;
    masked: string;
    valueEnc: string;
  } | null> {
    const [r] = await rawRows<{
      id: string;
      valid_from: string;
      valid_to: string;
      value_masked: string;
      value_enc: string;
    }>(
      this.tx,
      sql`select id, valid_from::text, valid_to::text, value_masked, value_enc from access_credential
          where booking_id = ${bookingId} and revoked_at is null order by issued_at desc limit 1`,
    );
    return r
      ? {
          id: r.id,
          validFrom: r.valid_from,
          validTo: r.valid_to,
          masked: r.value_masked,
          valueEnc: r.value_enc,
        }
      : null;
  }

  /** The access-window automation delivered the code (spec 08 §8.4 delivery state). */
  async markCredentialDelivered(credentialId: string): Promise<void> {
    await this.tx.execute(
      sql`update access_credential set delivery_state = 'delivered' where id = ${credentialId}`,
    );
  }

  /** Open threads whose latest message is an unanswered guest message newer than `since`: inquiry and out-of-hours acknowledgements. */
  async threadsNeedingAcknowledgement(since: string): Promise<
    Array<{
      id: string;
      propertyId: string;
      propertyTitle: string;
      timezone: string;
      provider: string;
      kind: "booking" | "inquiry";
      bookingId: string | null;
      guestName: string;
      guestLanguage: string | null;
      lastInboundAt: string;
    }>
  > {
    const rows = await rawRows<{
      id: string;
      property_id: string;
      property_title: string;
      timezone: string;
      provider: string;
      kind: "booking" | "inquiry";
      booking_id: string | null;
      guest_name_enc: string | null;
      guest_language: string | null;
      last_inbound_at: string;
    }>(
      this.tx,
      sql`select t.id, t.property_id, p.title as property_title, p.timezone, t.provider, t.kind, t.booking_id, t.guest_name_enc, t.guest_language, t.last_inbound_at::text
          from message_thread t join property p on p.id = t.property_id
          where t.state = 'open' and t.last_inbound_at >= ${since} and (t.last_outbound_at is null or t.last_outbound_at < t.last_inbound_at)`,
    );
    const out = [];
    for (const r of rows)
      out.push({
        id: r.id,
        propertyId: r.property_id,
        propertyTitle: r.property_title,
        timezone: r.timezone,
        provider: r.provider,
        kind: r.kind,
        bookingId: r.booking_id,
        guestName: r.guest_name_enc ? await this.crypto.open(r.guest_name_enc) : "Guest",
        guestLanguage: r.guest_language,
        lastInboundAt: r.last_inbound_at,
      });
    return out;
  }

  async hasRun(dedupeKey: string): Promise<boolean> {
    const [r] = await rawRows<{ n: number }>(
      this.tx,
      sql`select count(*)::int as n from automation_run where org_id = ${this.orgId} and dedupe_key = ${dedupeKey}`,
    );
    return (r?.n ?? 0) > 0;
  }

  /** The idempotency record (AUTO-4): false when this (rule, booking, anchor) already ran. */
  async recordRun(run: {
    ruleId: string;
    ruleVersion: number;
    propertyId: string;
    bookingId: string | null;
    threadId: string | null;
    dedupeKey: string;
    state: "sent" | "skipped" | "failed";
    reason: string | null;
    scheduledFor: string | null;
    messageId: string | null;
  }): Promise<boolean> {
    const rows = await this.tx
      .insert(s.automationRun)
      .values({ id: Id.next(), orgId: this.orgId, ...run })
      .onConflictDoNothing({ target: [s.automationRun.orgId, s.automationRun.dedupeKey] })
      .returning({ id: s.automationRun.id });
    return rows.length === 1;
  }

  async runs(limit = 50): Promise<
    Array<{
      id: string;
      ruleName: string;
      ruleVersion: number;
      propertyTitle: string;
      bookingId: string | null;
      state: string;
      reason: string | null;
      scheduledFor: string | null;
      executedAt: string;
    }>
  > {
    const rows = await rawRows<{
      id: string;
      rule_name: string;
      rule_version: number;
      property_title: string;
      booking_id: string | null;
      state: string;
      reason: string | null;
      scheduled_for: string | null;
      executed_at: string;
    }>(
      this.tx,
      sql`select ar.id, r.name as rule_name, ar.rule_version, p.title as property_title, ar.booking_id, ar.state, ar.reason, ar.scheduled_for::text, ar.executed_at::text
          from automation_run ar join automation_rule r on r.id = ar.rule_id join property p on p.id = ar.property_id
          where ar.org_id = ${this.orgId} order by ar.executed_at desc limit ${limit}`,
    );
    return rows.map((r) => ({
      id: r.id,
      ruleName: r.rule_name,
      ruleVersion: r.rule_version,
      propertyTitle: r.property_title,
      bookingId: r.booking_id,
      state: r.state,
      reason: r.reason,
      scheduledFor: r.scheduled_for,
      executedAt: r.executed_at,
    }));
  }

  /** Everything a template can interpolate for a booking (spec 09 §9.3), PII opened here only. */
  async templateContext(bookingId: string): Promise<TemplateContext | null> {
    const [b] = await rawRows<{
      arrival_date: string;
      departure_date: string;
      total_amount_minor: number;
      currency: string;
      ota_reservation_code: string | null;
      channex_booking_id: string;
      name_enc: string | null;
      surname_enc: string | null;
      language: string | null;
      property_title: string;
      address: Record<string, string>;
      settings: Record<string, unknown>;
      unit_name: string | null;
      unit_access: Record<string, string> | null;
      unit_attributes: Record<string, string> | null;
      code_enc: string | null;
      valid_from: string | null;
      valid_to: string | null;
    }>(
      this.tx,
      sql`select b.arrival_date::text, b.departure_date::text, b.total_amount_minor, b.currency, b.ota_reservation_code, b.channex_booking_id,
            g.name_enc, g.surname_enc, g.language, p.title as property_title, p.address, p.settings,
            u.name as unit_name, u.access as unit_access, u.attributes as unit_attributes,
            ac.value_enc as code_enc, ac.valid_from::text, ac.valid_to::text
          from booking b join property p on p.id = b.property_id
          left join guest g on g.id = b.guest_id
          left join booking_room br on br.booking_id = b.id
          left join unit u on u.id = coalesce(br.assigned_unit_id, (select u2.id from unit u2 where u2.property_id = p.id and u2.is_system_managed limit 1))
          left join lateral (select value_enc, valid_from, valid_to from access_credential a where a.booking_id = b.id and a.revoked_at is null order by issued_at desc limit 1) ac on true
          where b.id = ${bookingId} limit 1`,
    );
    if (!b) return null;
    const nights = Math.round(
      (Date.parse(b.departure_date) - Date.parse(b.arrival_date)) / 86_400_000,
    );
    const money = (minor: number) => `${(minor / 100).toFixed(2)} ${b.currency}`;
    const access = b.unit_access ?? {};
    const attrs = b.unit_attributes ?? {};
    const settings = b.settings;
    const ctx: TemplateContext = {
      guest: {
        first_name: b.name_enc ? await this.crypto.open(b.name_enc) : "Guest",
        ...(b.surname_enc ? { last_name: await this.crypto.open(b.surname_enc) } : {}),
        ...(b.language ? { language: b.language } : {}),
      },
      booking: {
        arrival: b.arrival_date,
        departure: b.departure_date,
        nights,
        total: money(Number(b.total_amount_minor)),
        reference: b.ota_reservation_code ?? b.channex_booking_id,
      },
      unit: {
        ...(b.unit_name ? { name: b.unit_name } : {}),
        ...(attrs.wifi_name ? { wifi_name: attrs.wifi_name } : {}),
        ...(attrs.wifi_password ? { wifi_password: attrs.wifi_password } : {}),
        ...(access.instructions ? { access_instructions: access.instructions } : {}),
      },
      property: {
        name: b.property_title,
        address: Object.values(b.address).filter(Boolean).join(", "),
        ...(typeof settings.check_in_time === "string"
          ? { check_in_time: settings.check_in_time }
          : {}),
        ...(typeof settings.check_out_time === "string"
          ? { check_out_time: settings.check_out_time }
          : {}),
        ...(typeof settings.contact_phone === "string"
          ? { contact_phone: settings.contact_phone }
          : {}),
      },
      access: {
        ...(b.code_enc ? { code: await this.crypto.open(b.code_enc) } : {}),
        ...(b.valid_from ? { valid_from: b.valid_from } : {}),
        ...(b.valid_to ? { valid_to: b.valid_to } : {}),
      },
    };
    return ctx;
  }

  /** The next upcoming mapped booking: the preview target for AUTO-5. */
  async nextUpcomingBooking(today: string): Promise<{ id: string; propertyId: string } | null> {
    const [r] = await rawRows<{ id: string; property_id: string }>(
      this.tx,
      sql`select id, property_id from booking where status <> 'cancelled' and mapping_state = 'mapped' and arrival_date >= ${today} order by arrival_date asc limit 1`,
    );
    return r ? { id: r.id, propertyId: r.property_id } : null;
  }

  // ---- reviews (spec 09 §9.7) ----------------------------------------------------------------

  async upsertReview(
    propertyId: string,
    r: {
      id: string;
      bookingId?: string;
      rating: number;
      text: string;
      ota: string;
      insertedAt: string;
      guestName?: string;
      canRespond?: boolean;
      response?: string;
    },
    responseSlaHours = 48,
  ): Promise<boolean> {
    const [booking] = r.bookingId
      ? await rawRows<{ id: string }>(
          this.tx,
          sql`select id from booking where property_id = ${propertyId} and channex_booking_id = ${r.bookingId}`,
        )
      : [];
    const rows = await this.tx
      .insert(s.review)
      .values({
        id: Id.next(),
        orgId: this.orgId,
        propertyId,
        providerReviewId: r.id,
        bookingId: booking?.id ?? null,
        ota: providerCode(r.ota),
        rating: Math.max(0, Math.min(10, Math.round(r.rating))),
        body: r.text,
        guestNameEnc: r.guestName ? await this.crypto.seal(r.guestName) : null,
        insertedAt: r.insertedAt,
        canRespond: r.canRespond ?? true,
        responseState: r.response
          ? "responded"
          : r.canRespond === false
            ? "not_supported"
            : "pending",
        responseDueAt:
          r.canRespond === false || r.response
            ? null
            : new Date(Date.parse(r.insertedAt) + responseSlaHours * 3_600_000).toISOString(),
      })
      .onConflictDoNothing({ target: [s.review.propertyId, s.review.providerReviewId] })
      .returning({ id: s.review.id });
    return rows.length === 1;
  }

  async listReviews(f: {
    propertyId?: string | null;
    provider?: string | null;
    minRating?: number | null;
    maxRating?: number | null;
    responseState?: string | null;
  }): Promise<ReviewRow[]> {
    const conds = [sql`r.org_id = ${this.orgId}`];
    if (f.propertyId) conds.push(sql`r.property_id = ${f.propertyId}`);
    if (f.provider) conds.push(sql`r.ota = ${f.provider}`);
    if (f.minRating !== null && f.minRating !== undefined)
      conds.push(sql`r.rating >= ${f.minRating}`);
    if (f.maxRating !== null && f.maxRating !== undefined)
      conds.push(sql`r.rating <= ${f.maxRating}`);
    if (f.responseState) conds.push(sql`r.response_state = ${f.responseState}`);
    const rows = await rawRows<{
      id: string;
      property_id: string;
      property_title: string;
      ota: string;
      rating: number;
      body: string;
      guest_name_enc: string | null;
      inserted_at: string;
      can_respond: boolean;
      response_state: string;
      response_due_at: string | null;
      booking_id: string | null;
      resp_body: string | null;
      resp_state: string | null;
      resp_sent_at: string | null;
    }>(
      this.tx,
      sql`select r.id, r.property_id, p.title as property_title, r.ota, r.rating, r.body, r.guest_name_enc, r.inserted_at::text, r.can_respond,
            r.response_state, r.response_due_at::text, r.booking_id, rr.body as resp_body, rr.delivery_state as resp_state, rr.sent_at::text as resp_sent_at
          from review r join property p on p.id = r.property_id
          left join lateral (select body, delivery_state, sent_at from review_response x where x.review_id = r.id order by created_at desc limit 1) rr on true
          where ${sql.join(conds, sql` and `)} order by r.inserted_at desc limit 500`,
    );
    const out: ReviewRow[] = [];
    for (const r of rows)
      out.push({
        id: r.id,
        propertyId: r.property_id,
        propertyTitle: r.property_title,
        provider: r.ota,
        rating: r.rating,
        body: r.body,
        guestName: r.guest_name_enc ? await this.crypto.open(r.guest_name_enc) : "Guest",
        insertedAt: r.inserted_at,
        canRespond: r.can_respond,
        responseState: r.response_state,
        responseDueAt: r.response_due_at,
        response: r.resp_body
          ? { body: r.resp_body, deliveryState: r.resp_state ?? "queued", sentAt: r.resp_sent_at }
          : null,
        bookingId: r.booking_id,
      });
    return out;
  }

  async queueReviewResponse(reviewId: string, body: string, authorId: string): Promise<string> {
    const id = Id.next();
    await this.tx.insert(s.reviewResponse).values({
      id,
      orgId: this.orgId,
      reviewId,
      body,
      authorId,
    });
    await this.tx.execute(
      sql`update review set response_state = 'queued' where id = ${reviewId} and org_id = ${this.orgId}`,
    );
    return id;
  }

  async queuedReviewResponses(): Promise<
    Array<{
      id: string;
      reviewId: string;
      providerReviewId: string;
      body: string;
      attempts: number;
    }>
  > {
    const rows = await rawRows<{
      id: string;
      review_id: string;
      provider_review_id: string;
      body: string;
      attempts: number;
    }>(
      this.tx,
      sql`select rr.id, rr.review_id, r.provider_review_id, rr.body, rr.attempts from review_response rr join review r on r.id = rr.review_id
          where rr.delivery_state = 'queued' order by rr.created_at asc limit 100`,
    );
    return rows.map((r) => ({
      id: r.id,
      reviewId: r.review_id,
      providerReviewId: r.provider_review_id,
      body: r.body,
      attempts: r.attempts,
    }));
  }

  async markReviewResponse(
    id: string,
    state: "queued" | "sent" | "failed",
    error?: string,
  ): Promise<void> {
    await this.tx.execute(sql`
      update review_response set delivery_state = ${state}, attempts = attempts + 1, delivery_error = ${error ?? null},
        sent_at = case when ${state === "sent"} then now() else sent_at end where id = ${id}`);
    await this.tx.execute(sql`
      update review set response_state = ${state === "sent" ? "responded" : state === "failed" ? "failed" : "queued"}
      where id = (select review_id from review_response where id = ${id})`);
  }

  // ---- KPI (spec 09 §9.9) --------------------------------------------------------------------

  /** (inbound, first staff reply) pairs since a date, for the median per property, channel and agent. */
  async firstResponsePairs(sinceIso: string): Promise<
    Array<{
      propertyId: string;
      propertyTitle: string;
      provider: string;
      agentId: string | null;
      inboundAt: string;
      repliedAt: string;
    }>
  > {
    const rows = await rawRows<{
      property_id: string;
      property_title: string;
      provider: string;
      agent_id: string | null;
      inbound_at: string;
      replied_at: string;
    }>(
      this.tx,
      sql`select t.property_id, p.title as property_title, t.provider, r.author_id as agent_id, i.sent_at::text as inbound_at, r.sent_at::text as replied_at
          from message i
          join message_thread t on t.id = i.thread_id
          join property p on p.id = t.property_id
          join lateral (select m.sent_at, m.author_id from message m where m.thread_id = i.thread_id and m.kind = 'guest_message' and m.direction = 'outbound'
                          and m.author_type = 'staff' and m.sent_at >= i.sent_at order by m.sent_at asc limit 1) r on true
          where i.kind = 'guest_message' and i.direction = 'inbound' and i.author_type = 'guest' and i.sent_at >= ${sinceIso}
            and not exists (select 1 from message m2 where m2.thread_id = i.thread_id and m2.kind = 'guest_message' and m2.direction = 'inbound'
                              and m2.sent_at < i.sent_at and m2.sent_at > coalesce((select max(m3.sent_at) from message m3 where m3.thread_id = i.thread_id
                              and m3.direction = 'outbound' and m3.author_type = 'staff' and m3.sent_at < i.sent_at), '1970-01-01'))`,
    );
    return rows.map((r) => ({
      propertyId: r.property_id,
      propertyTitle: r.property_title,
      provider: r.provider,
      agentId: r.agent_id,
      inboundAt: r.inbound_at,
      repliedAt: r.replied_at,
    }));
  }

  /** Threads in an inbox listing that belong to properties the actor may see. */
  async propertyIds(): Promise<Array<{ id: string; title: string }>> {
    const rows = await this.tx
      .select({ id: s.property.id, title: s.property.title })
      .from(s.property)
      .where(and(eq(s.property.orgId, this.orgId), isNull(s.property.archivedAt)))
      .orderBy(s.property.title);
    return rows;
  }

  async users(): Promise<Array<{ id: string; name: string }>> {
    return rawRows<{ id: string; name: string }>(
      this.tx,
      sql`select u.id, u.name from "user" u join org_membership om on om.user_id = u.id where om.org_id = ${this.orgId} order by u.name`,
    );
  }

  async messagesByIds(ids: string[]): Promise<Array<{ id: string; kind: string }>> {
    if (ids.length === 0) return [];
    return this.tx
      .select({ id: s.message.id, kind: s.message.kind })
      .from(s.message)
      .where(and(eq(s.message.orgId, this.orgId), inArray(s.message.id, ids)))
      .orderBy(desc(s.message.sentAt));
  }
}

function toThread(r: Omit<ThreadRow, "sla">): Thread {
  return {
    id: r.id,
    propertyId: r.propertyId,
    provider: r.provider,
    bookingId: r.bookingId,
    guestId: null,
    kind: r.kind,
    state: r.state,
    unreadCount: r.unreadCount,
    lastMessageAt: r.lastMessageAt,
    lastInboundAt: r.lastInboundAt,
    lastOutboundAt: r.lastOutboundAt,
    firstResponseDueAt: r.firstResponseDueAt,
    assigneeId: r.assigneeId,
    snoozedUntil: r.snoozedUntil,
    tags: r.tags,
    guestLanguage: r.guestLanguage,
  };
}
