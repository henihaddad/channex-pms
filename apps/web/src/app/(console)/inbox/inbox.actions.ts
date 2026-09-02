"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  interpolate,
  parseInquiry,
  promotionalWarnings,
  type AutomationTrigger,
  type InboxView,
  type MessageTemplate,
} from "@pms/core";
import type { RuleRow, ReviewRow, ThreadDetail, ThreadRow } from "@pms/db";
import { firstResponseKpi, renderTemplate, type FirstResponseKpi } from "@pms/jobs";
import { withPermission, type ActorCtx } from "@/server/with-permission";
import { container } from "@/server/container";
import { HttpProblem } from "@/server/errors";
import {
  assertThreadInProperty,
  capabilitiesFor,
  currentUserEmail,
  messaging,
  queueDelivery,
  queueThreadClose,
  TRIGGERS,
} from "@/server/inbox";

const VIEWS: InboxView[] = [
  "needs_reply",
  "breaching_sla",
  "assigned_to_me",
  "unassigned",
  "inquiries",
  "arriving",
  "in_house",
  "snoozed",
  "closed",
  "all",
];
const threadScope = {
  scope: "property" as const,
  resolveScope: (fd: FormData) => ({ kind: "property" as const, id: String(fd.get("propertyId")) }),
  subject: (fd: FormData) => ({ kind: "message_thread", id: String(fd.get("threadId")) }),
};
const todayIso = () => new Date().toISOString().slice(0, 10);

export interface InboxListing {
  rows: ThreadRow[];
  counts: { unread: number; needsReply: number; breaching: number; assignedToMe: number };
  properties: Array<{ id: string; title: string }>;
  view: InboxView;
}

export const listInbox = withPermission<
  [{ view?: string; propertyId?: string | null; provider?: string | null; q?: string | null }],
  InboxListing
>("message:read", { scope: "organization", audit: false }, async (ctx, f) => {
  const repo = await messaging(ctx);
  const view = VIEWS.includes(f.view as InboxView) ? (f.view as InboxView) : "needs_reply";
  const nowIso = new Date().toISOString();
  const rows = await repo.list({
    view,
    userId: ctx.userId,
    nowIso,
    today: todayIso(),
    propertyId: f.propertyId ?? null,
    provider: f.provider ?? null,
    search: f.q ?? null,
  });
  return {
    rows,
    counts: await repo.counts(ctx.userId, nowIso),
    properties: await repo.propertyIds(),
    view,
  };
});

export interface ThreadView {
  detail: ThreadDetail;
  capabilities: ReturnType<typeof capabilitiesFor>;
  templates: Array<MessageTemplate & { warnings: string[] }>;
  users: Array<{ id: string; name: string }>;
  inquiry: ReturnType<typeof parseInquiry> | null;
}

/** Opening a thread marks it read; bodies are opened under `message:read` and audited. */
export const loadThread = withPermission<[{ threadId: string }], ThreadView | null>(
  "message:read",
  { scope: "organization", subject: (i) => ({ kind: "message_thread", id: i.threadId }) },
  async (ctx, { threadId }) => {
    const repo = await messaging(ctx);
    const detail = await repo.detail(threadId, new Date().toISOString());
    if (!detail) return null;
    if (detail.unreadCount > 0) await repo.markRead(threadId);
    const system = detail.messages.find((m) => m.authorType === "system");
    return {
      detail,
      capabilities: capabilitiesFor(detail),
      templates: await repo.listTemplates(),
      users: await repo.users(),
      inquiry:
        detail.kind === "inquiry" && system ? parseInquiry(system.body, system.sentAt) : null,
    };
  },
);

/** MSG-3/MSG-6: the guest composer. Its only output is a queued guest message; notes have their own action. */
export const sendReplyAction = withPermission<[FormData], void>(
  "message:send",
  { ...threadScope, redact: ["body"] },
  async (ctx, fd) => {
    const threadId = String(fd.get("threadId"));
    await assertThreadInProperty(ctx, threadId, String(fd.get("propertyId")));
    const body = String(fd.get("body") ?? "").trim();
    if (body === "") throw new HttpProblem(422, "empty_message", "Write something first");
    const repo = await messaging(ctx);
    const templateId = String(fd.get("templateId") ?? "") || null;
    const id = await repo.queueGuestMessage(threadId, {
      authorType: "staff",
      authorId: ctx.userId,
      body,
      sentAt: new Date().toISOString(),
      templateId,
    });
    await queueDelivery(ctx, id);
    revalidatePath("/inbox");
  },
);

export const addNoteAction = withPermission<[FormData], void>(
  "message:read",
  { ...threadScope, redact: ["body"] },
  async (ctx, fd) => {
    const threadId = String(fd.get("threadId"));
    await assertThreadInProperty(ctx, threadId, String(fd.get("propertyId")));
    const body = String(fd.get("body") ?? "").trim();
    if (body === "") throw new HttpProblem(422, "empty_note", "Write something first");
    await (await messaging(ctx)).addNote(threadId, ctx.userId, body, new Date().toISOString());
    revalidatePath("/inbox");
  },
);

export const retryMessageAction = withPermission<[FormData], void>(
  "message:send",
  threadScope,
  async (ctx, fd) => {
    await assertThreadInProperty(ctx, String(fd.get("threadId")), String(fd.get("propertyId")));
    const messageId = String(fd.get("messageId"));
    await (await messaging(ctx)).retry(messageId);
    await queueDelivery(ctx, messageId);
    revalidatePath("/inbox");
  },
);

export const assignThreadAction = withPermission<[FormData], void>(
  "message:read",
  threadScope,
  async (ctx, fd) => {
    await assertThreadInProperty(ctx, String(fd.get("threadId")), String(fd.get("propertyId")));
    const who = String(fd.get("assigneeId") ?? "");
    await (
      await messaging(ctx)
    ).assign(String(fd.get("threadId")), who === "" ? null : who === "me" ? ctx.userId : who);
    revalidatePath("/inbox");
  },
);

export const snoozeThreadAction = withPermission<[FormData], void>(
  "message:read",
  threadScope,
  async (ctx, fd) => {
    await assertThreadInProperty(ctx, String(fd.get("threadId")), String(fd.get("propertyId")));
    const until = String(fd.get("until") ?? "");
    await (
      await messaging(ctx)
    ).snooze(String(fd.get("threadId")), until === "" ? null : new Date(until).toISOString());
    revalidatePath("/inbox");
  },
);

const stateSchema = z.enum(["open", "closed", "no_reply_needed"]);
/** Close, reopen and Booking.com's "no reply needed" (spec 09 §9.4); the provider hears about it from the worker. */
export const setThreadStateAction = withPermission<[FormData], void>(
  "message:close_thread",
  threadScope,
  async (ctx, fd) => {
    const threadId = String(fd.get("threadId"));
    const t = await assertThreadInProperty(ctx, threadId, String(fd.get("propertyId")));
    const state = stateSchema.parse(fd.get("state"));
    const caps = capabilitiesFor({
      provider: t.provider,
      providerThreadId: t.providerThreadId,
    } as never);
    if (state === "no_reply_needed" && !caps.noReplyNeeded)
      throw new HttpProblem(422, "unsupported", "This channel has no 'no reply needed' control");
    await (await messaging(ctx)).setState(threadId, state, String(fd.get("reason") ?? "") || null);
    if (state !== "open" && caps.closeThread)
      await queueThreadClose(
        ctx,
        threadId,
        state === "no_reply_needed" ? "no_reply_needed" : "resolved",
      );
    revalidatePath("/inbox");
  },
);

export const tagThreadAction = withPermission<[FormData], void>(
  "message:read",
  threadScope,
  async (ctx, fd) => {
    await assertThreadInProperty(ctx, String(fd.get("threadId")), String(fd.get("propertyId")));
    const tags = String(fd.get("tags") ?? "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    await (await messaging(ctx)).setTags(String(fd.get("threadId")), tags);
    revalidatePath("/inbox");
  },
);

/** Composer preview with real values (spec 09 §9.3): what the guest will read, before send. */
export const previewTemplateAction = withPermission<
  [{ templateId: string; bookingId: string | null }],
  { text: string; missing: string[] } | null
>("template:read", { scope: "organization", audit: false }, async (ctx, i) => {
  const c = await container();
  return renderTemplate(ctx.tx, ctx.orgId, c.crypto, i.templateId, i.bookingId);
});

// ---- templates ------------------------------------------------------------------------------

export const listTemplates = withPermission<[], Array<MessageTemplate & { warnings: string[] }>>(
  "template:read",
  { scope: "organization", audit: false },
  async (ctx) => (await messaging(ctx)).listTemplates(),
);

const templateSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  category: z.string().min(1),
  locale: z.string().min(2).max(5),
  channelScope: z.array(z.string()).nullable(),
  body: z.string().min(1),
});
/** AUTO-7: the editor warns on promotional patterns; the warning is stored with the template. */
export const saveTemplateAction = withPermission<[FormData], void>(
  "template:manage",
  {
    scope: "organization",
    subject: (fd) => ({ kind: "message_template", id: String(fd.get("id") ?? "new") }),
  },
  async (ctx, fd) => {
    const scope = fd.getAll("channelScope").map(String).filter(Boolean);
    const t = templateSchema.parse({
      id: String(fd.get("id") ?? "") || undefined,
      name: fd.get("name"),
      category: fd.get("category"),
      locale: fd.get("locale"),
      channelScope: scope.length ? scope : null,
      body: fd.get("body"),
    });
    await (
      await messaging(ctx)
    ).saveTemplate({
      ...t,
      id: t.id ?? null,
      warnings: promotionalWarnings(t.body),
      createdBy: ctx.userId,
    });
    revalidatePath("/inbox/templates");
  },
);

export const archiveTemplateAction = withPermission<[FormData], void>(
  "template:manage",
  {
    scope: "organization",
    subject: (fd) => ({ kind: "message_template", id: String(fd.get("id")) }),
  },
  async (ctx, fd) => {
    await (await messaging(ctx)).archiveTemplate(String(fd.get("id")));
    revalidatePath("/inbox/templates");
  },
);

// ---- automation (spec 09 §9.5) --------------------------------------------------------------

export interface AutomationView {
  rules: RuleRow[];
  templates: MessageTemplate[];
  properties: Array<{ id: string; title: string; killSwitch: boolean }>;
  runs: Awaited<ReturnType<Awaited<ReturnType<typeof messaging>>["runs"]>>;
}

export const loadAutomation = withPermission<[], AutomationView>(
  "template:read",
  { scope: "organization", audit: false },
  async (ctx) => {
    const repo = await messaging(ctx);
    const properties = [];
    for (const p of await repo.propertyIds())
      properties.push({ ...p, killSwitch: await repo.killSwitch(p.id) });
    return {
      rules: await repo.listRules(),
      templates: await repo.listTemplates(),
      properties,
      runs: await repo.runs(),
    };
  },
);

const ruleSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  trigger: z.enum(TRIGGERS as [AutomationTrigger, ...AutomationTrigger[]]),
  offsetDays: z.coerce.number().int().nullable(),
  atLocalTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable(),
  templateId: z.string().min(1),
  quietFrom: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable(),
  quietTo: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable(),
  providers: z.array(z.string()),
  minNights: z.coerce.number().int().nullable(),
});
export const saveRuleAction = withPermission<[FormData], void>(
  "automation:manage",
  {
    scope: "organization",
    subject: (fd) => ({ kind: "automation_rule", id: String(fd.get("id") ?? "new") }),
  },
  async (ctx, fd) => {
    const opt = (k: string) => (String(fd.get(k) ?? "").trim() === "" ? null : String(fd.get(k)));
    const r = ruleSchema.parse({
      id: String(fd.get("id") ?? "") || undefined,
      name: fd.get("name"),
      trigger: fd.get("trigger"),
      offsetDays: opt("offsetDays"),
      atLocalTime: opt("atLocalTime"),
      templateId: fd.get("templateId"),
      quietFrom: opt("quietFrom"),
      quietTo: opt("quietTo"),
      providers: fd.getAll("providers").map(String).filter(Boolean),
      minNights: opt("minNights"),
    });
    const conditions: Record<string, unknown> = {};
    if (r.providers.length) conditions.providers = r.providers;
    if (r.minNights !== null) conditions.minNights = r.minNights;
    await (
      await messaging(ctx)
    ).saveRule({ ...r, id: r.id ?? null, conditions, createdBy: ctx.userId });
    revalidatePath("/inbox/automation");
  },
);

export const toggleRuleAction = withPermission<[FormData], void>(
  "automation:manage",
  {
    scope: "organization",
    subject: (fd) => ({ kind: "automation_rule", id: String(fd.get("id")) }),
  },
  async (ctx, fd) => {
    await (await messaging(ctx)).setRuleEnabled(String(fd.get("id")), fd.get("enabled") === "1");
    revalidatePath("/inbox/automation");
  },
);

/** AUTO-6: the per-property kill switch. */
export const killSwitchAction = withPermission<[FormData], void>(
  "automation:manage",
  {
    scope: "property",
    resolveScope: (fd) => ({ kind: "property", id: String(fd.get("propertyId")) }),
  },
  async (ctx, fd) => {
    await (await messaging(ctx)).setKillSwitch(String(fd.get("propertyId")), fd.get("on") === "1");
    revalidatePath("/inbox/automation");
  },
);

/** AUTO-5: render the rule's template against the next upcoming booking and mail it to the signed-in user. */
export const testSendAction = withPermission<
  [FormData],
  { text: string; missing: string[]; sentTo: string | null; bookingId: string | null }
>(
  "automation:manage",
  {
    scope: "organization",
    subject: (fd) => ({ kind: "automation_rule", id: String(fd.get("id")) }),
  },
  async (ctx, fd) => {
    const c = await container();
    const repo = await messaging(ctx);
    const rule = (await repo.listRules()).find((r) => r.id === String(fd.get("id")));
    if (!rule) throw new HttpProblem(404, "not_found", "Rule not found");
    const next = await repo.nextUpcomingBooking(todayIso());
    const rendered = await renderTemplate(
      ctx.tx,
      ctx.orgId,
      c.crypto,
      rule.templateId,
      next?.id ?? null,
    );
    if (!rendered) throw new HttpProblem(404, "not_found", "Template not found");
    const to = await currentUserEmail(ctx);
    if (to)
      await c.mailer.send({
        to,
        template: "automation_test",
        locale: ctx.locale,
        params: { rule: rule.name, body: rendered.text, missing: rendered.missing.join(", ") },
      });
    return {
      text: rendered.text,
      missing: rendered.missing,
      sentTo: to,
      bookingId: next?.id ?? null,
    };
  },
);

export const loadKpi = withPermission<[{ days: number }], FirstResponseKpi>(
  "message:read",
  { scope: "organization", audit: false },
  async (ctx, { days }) => {
    const c = await container();
    return firstResponseKpi(
      ctx.tx,
      ctx.orgId,
      c.crypto,
      new Date(Date.now() - days * 86_400_000).toISOString(),
    );
  },
);

// ---- reviews (spec 09 §9.7) ----------------------------------------------------------------

export const listReviews = withPermission<
  [
    {
      propertyId?: string | null;
      provider?: string | null;
      minRating?: number | null;
      responseState?: string | null;
    },
  ],
  { rows: ReviewRow[]; properties: Array<{ id: string; title: string }> }
>("review:read", { scope: "organization", audit: false }, async (ctx, f) => {
  const repo = await messaging(ctx);
  return { rows: await repo.listReviews(f), properties: await repo.propertyIds() };
});

export const respondReviewAction = withPermission<[FormData], void>(
  "review:respond",
  {
    scope: "property",
    resolveScope: (fd) => ({ kind: "property", id: String(fd.get("propertyId")) }),
    subject: (fd) => ({ kind: "review", id: String(fd.get("reviewId")) }),
  },
  async (ctx, fd) => {
    const repo = await messaging(ctx);
    const review = (await repo.listReviews({ propertyId: String(fd.get("propertyId")) })).find(
      (r) => r.id === String(fd.get("reviewId")),
    );
    if (!review) throw new HttpProblem(404, "not_found", "Review not found");
    if (!review.canRespond)
      throw new HttpProblem(422, "unsupported", "This OTA does not accept responses");
    const body = String(fd.get("body") ?? "").trim();
    if (body === "") throw new HttpProblem(422, "empty", "Write something first");
    const id = await repo.queueReviewResponse(review.id, body, ctx.userId);
    await queueDelivery(ctx, `review:${id}`);
    revalidatePath("/reviews");
  },
);

/** Used by the composer to show what a template says for this thread; wraps interpolate for clients without a booking. */
export const interpolatePreview = withPermission<
  [{ body: string; guestName: string; propertyTitle: string }],
  { text: string; missing: string[] }
>("template:read", { scope: "organization", audit: false }, async (_ctx, i) => {
  const first = i.guestName.split(" ")[0] ?? "there";
  return interpolate(i.body, { guest: { first_name: first }, property: { name: i.propertyTitle } });
});
