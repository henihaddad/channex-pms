import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { InboxView } from "@pms/core";
import {
  Alert,
  Button,
  Card,
  Chip,
  EmptyState,
  Input,
  LinkButton,
  PageHeader,
  Select,
  cn,
} from "@/components/ui";
import { guard } from "@/server/guard";
import { providerLabel } from "@/server/inbox";
import { RequestCard } from "../reservations/requests/request-card";
import { Composer } from "./composer";
import {
  assignThreadAction,
  listInbox,
  loadThread,
  messagingGaps,
  retryMessageAction,
  setThreadStateAction,
  snoozeThreadAction,
  tagThreadAction,
} from "./inbox.actions";

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
const fmt = (iso: string | null) => (iso ? iso.slice(0, 16).replace("T", " ") : "");

/** The unified inbox (spec 09 §9.1–9.4): filters · thread list · conversation with booking sidebar. */
export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const t = await getTranslations("inbox");
  const tg = await getTranslations("guides");
  const listing = await guard(() =>
    listInbox({
      view: sp.view,
      propertyId: sp.property ?? null,
      provider: sp.provider ?? null,
      q: sp.q ?? null,
    }),
  );
  const open = sp.thread ? await guard(() => loadThread({ threadId: sp.thread! })) : null;
  // CXMSG-1: a property whose channel manager has no Messages app is named here, never a silent empty inbox
  const gaps = await guard(() => messagingGaps());
  const qs = (view: string) =>
    `/inbox?view=${view}${sp.property ? `&property=${sp.property}` : ""}${sp.thread ? `&thread=${sp.thread}` : ""}`;
  const hidden = (threadId: string, propertyId: string) => (
    <>
      <input type="hidden" name="threadId" value={threadId} />
      <input type="hidden" name="propertyId" value={propertyId} />
    </>
  );
  const booking = open?.detail.booking ?? null;
  const nightsOf = (a: string, d: string) =>
    Math.round((Date.parse(`${d}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
  const pill = (active: boolean) =>
    cn(
      "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition-colors",
      active
        ? "bg-foreground text-background"
        : "border border-border bg-surface text-muted hover:text-foreground",
    );
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t("title")} />
      {gaps.length > 0 ? (
        <Alert tone="warning" data-testid="messages-app-missing">
          {t("messagesAppMissing", { properties: gaps.map((g) => g.title).join(", ") })}
        </Alert>
      ) : null}
      {listing.counts.open === 0 && listing.rows.length === 0 && !sp.q && !sp.property ? (
        <Card>
          <EmptyState
            title={t("emptyTitle")}
            description={t("empty")}
            action={
              <LinkButton href="/channels" variant="primary" size="sm">
                {t("connectChannel")}
              </LinkButton>
            }
          />
        </Card>
      ) : (
        <>
          {/* the views as pills, the property and the search on the same line: one bar, no sidebar */}
          <div className="flex flex-wrap items-center gap-2">
            <nav
              className="scrollbar-none -mx-1 flex min-w-0 flex-1 gap-1.5 overflow-x-auto px-1 py-0.5"
              aria-label={t("filters")}
              data-testid="inbox-filters"
            >
              {VIEWS.map((v) => (
                <Link key={v} href={qs(v)} className={pill(listing.view === v)}>
                  <span>{t(`views.${v}`)}</span>
                  {v === "needs_reply" && listing.counts.needsReply ? (
                    <span className="text-[11px] opacity-80">· {listing.counts.needsReply}</span>
                  ) : null}
                  {v === "breaching_sla" && listing.counts.breaching ? (
                    <span
                      className={cn(
                        "text-[11px]",
                        listing.view === v ? "opacity-80" : "font-bold text-danger",
                      )}
                    >
                      · {listing.counts.breaching}
                    </span>
                  ) : null}
                </Link>
              ))}
            </nav>
            <form className="flex items-center gap-2">
              <input type="hidden" name="view" value={listing.view} />
              <Select
                name="property"
                defaultValue={sp.property ?? ""}
                aria-label={t("allProperties")}
                size="sm"
                className="w-44"
              >
                <option value="">{t("allProperties")}</option>
                {listing.properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </Select>
              <Input
                name="q"
                defaultValue={sp.q ?? ""}
                placeholder={t("search")}
                aria-label={t("search")}
                variant="secondary"
                className="h-8 w-48"
              />
              <Button type="submit" variant="secondary" size="sm">
                {t("filter")}
              </Button>
            </form>
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(280px,2fr)_minmax(0,3fr)]">
            <Card
              className="max-h-[78vh] overflow-y-auto p-1.5"
              contentClassName="flex flex-col gap-0.5"
            >
              {listing.rows.length === 0 ? (
                listing.counts.open > 0 ? (
                  // conversations exist, this filter has none of them: say that, not the first-run pitch
                  <EmptyState
                    title={t("viewEmptyTitle")}
                    description={t("viewEmpty", { view: t(`views.${listing.view}`) })}
                    className="px-3"
                    action={
                      <LinkButton href="/inbox?view=all" variant="secondary" size="sm">
                        {t("showAll")}
                      </LinkButton>
                    }
                  />
                ) : (
                  <EmptyState title={t("emptyTitle")} description={t("empty")} className="px-3" />
                )
              ) : null}
              {listing.rows.map((r) => (
                <Link
                  key={r.id}
                  href={`/inbox?view=${listing.view}&thread=${r.id}${sp.property ? `&property=${sp.property}` : ""}`}
                  className={cn(
                    "block rounded-xl px-3 py-2.5 text-sm transition-colors hover:bg-default",
                    sp.thread === r.id ? "bg-accent-soft/50" : "",
                  )}
                  aria-current={sp.thread === r.id ? "true" : undefined}
                  data-testid="thread-row"
                  data-unread={r.unreadCount}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex min-w-0 items-center gap-1.5">
                      <span
                        className={cn("truncate", r.unreadCount > 0 ? "font-bold" : "font-medium")}
                      >
                        {r.guestName}
                      </span>
                      {r.unreadCount > 0 ? (
                        <Chip color="accent" variant="primary" size="sm" data-testid="unread">
                          {r.unreadCount}
                        </Chip>
                      ) : null}
                    </span>
                    {r.sla.needsReply ? (
                      <Chip
                        color={
                          r.sla.breached
                            ? "danger"
                            : (r.sla.remainingMinutes ?? 99) <= 30
                              ? "warning"
                              : "success"
                        }
                        size="sm"
                        data-testid="sla-chip"
                      >
                        {r.sla.breached
                          ? t("slaBreached")
                          : t("slaLeft", { minutes: r.sla.remainingMinutes ?? 0 })}
                      </Chip>
                    ) : (
                      <span className="shrink-0 text-[11px] text-muted">
                        {fmt(r.lastMessageAt ?? null).slice(5)}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted">
                    {r.propertyTitle} · {providerLabel(r.provider)}
                    {r.arrivalDate
                      ? ` · ${r.arrivalDate} → ${r.departureDate}`
                      : ` · ${t("inquiry")}`}
                    {r.assigneeName ? ` · ${r.assigneeName}` : ""}
                    {r.state !== "open" ? ` · ${t(`states.${r.state}`)}` : ""}
                  </p>
                  <p className="mt-1 truncate text-[13px] text-foreground/90">{r.preview}</p>
                  {r.tags.length > 0 ? (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {r.tags.map((tag) => (
                        <Chip key={tag} size="sm">
                          {tag}
                        </Chip>
                      ))}
                    </div>
                  ) : null}
                </Link>
              ))}
            </Card>

            {open ? (
              <Card
                title={open.detail.guestName}
                description={[
                  open.detail.propertyTitle,
                  booking
                    ? `${booking.arrivalDate} → ${booking.departureDate} · ${t("nightsCount", { n: nightsOf(booking.arrivalDate, booking.departureDate) })}`
                    : t("inquiry"),
                  `${t("via")} ${providerLabel(open.detail.provider)}`,
                ].join(" · ")}
                actions={
                  <div className="flex flex-wrap items-center gap-2">
                    {booking ? (
                      <LinkButton
                        href={`/reservations/${booking.id}`}
                        variant="secondary"
                        size="sm"
                      >
                        {t("openBooking")}
                      </LinkButton>
                    ) : null}
                    {open.detail.state === "open" ? (
                      <>
                        <form action={setThreadStateAction}>
                          {hidden(open.detail.id, open.detail.propertyId)}
                          <input type="hidden" name="state" value="closed" />
                          <input type="hidden" name="reason" value="resolved" />
                          <Button
                            type="submit"
                            variant="secondary"
                            size="sm"
                            data-testid="close-thread"
                          >
                            {t("close")}
                          </Button>
                        </form>
                        {open.capabilities.noReplyNeeded ? (
                          <form action={setThreadStateAction}>
                            {hidden(open.detail.id, open.detail.propertyId)}
                            <input type="hidden" name="state" value="no_reply_needed" />
                            <Button
                              type="submit"
                              variant="ghost"
                              size="sm"
                              data-testid="no-reply-needed"
                            >
                              {t("noReplyNeeded")}
                            </Button>
                          </form>
                        ) : null}
                      </>
                    ) : (
                      <form action={setThreadStateAction}>
                        {hidden(open.detail.id, open.detail.propertyId)}
                        <input type="hidden" name="state" value="open" />
                        <Button type="submit" variant="secondary" size="sm">
                          {t("reopen")}
                        </Button>
                      </form>
                    )}
                  </div>
                }
                contentClassName="flex flex-col gap-3"
                data-testid="conversation"
              >
                {/* the booking's facts in one strip above the messages, not a third column */}
                <div
                  className="flex flex-wrap gap-x-5 gap-y-1.5 rounded-xl bg-default px-3 py-2 text-xs"
                  data-testid="booking-sidebar"
                >
                  {booking ? (
                    (
                      [
                        [t("dates"), `${booking.arrivalDate} → ${booking.departureDate}`],
                        [
                          t("unit"),
                          `${booking.roomType ?? ""}${booking.unit ? ` · ${booking.unit}` : ""}` ||
                            "—",
                        ],
                        [
                          t("total"),
                          `${(booking.totalMinor / 100).toFixed(2)} ${booking.currency}`,
                        ],
                        [t("balance"), (booking.balanceMinor / 100).toFixed(2)],
                        [t("status"), `${booking.status} · ${booking.opsState}`],
                        [t("previousStays"), String(booking.previousStays)],
                      ] as const
                    ).map(([k, v]) => (
                      <span key={k} className="inline-flex gap-1">
                        <span className="text-muted">{k}</span>
                        <span className="font-medium text-foreground">{v}</span>
                      </span>
                    ))
                  ) : (
                    <span className="text-muted">{t("noBooking")}</span>
                  )}
                </div>
                {open.request ? (
                  <RequestCard r={open.request} compact />
                ) : open.inquiry ? (
                  <div
                    className="rounded-2xl bg-accent-soft px-3 py-2 text-xs text-accent-soft-foreground"
                    data-testid="inquiry-card"
                  >
                    <p className="font-semibold">{t(`inquiryKinds.${open.inquiry.kind}`)}</p>
                    <p>
                      {open.inquiry.checkIn ?? "?"} → {open.inquiry.checkOut ?? "?"} ·{" "}
                      {open.inquiry.guests ?? "?"} {t("guests")}
                      {open.inquiry.priceText ? ` · ${open.inquiry.priceText}` : ""}
                    </p>
                    <p className="text-danger">
                      {t("respondBy")} {fmt(open.inquiry.deadline)}
                    </p>
                  </div>
                ) : null}
                <div
                  className="scrollbar flex max-h-[50vh] flex-col gap-2 overflow-y-auto"
                  data-testid="messages"
                >
                  {open.detail.messages.map((m) => (
                    <div
                      key={m.id}
                      className={cn(
                        "max-w-[85%] rounded-2xl px-3 py-2 text-sm",
                        m.kind === "note"
                          ? "max-w-full self-stretch bg-warning-soft"
                          : m.direction === "inbound"
                            ? "self-start bg-surface-secondary"
                            : "self-end bg-accent-soft",
                      )}
                      data-testid="message"
                      data-kind={m.kind}
                      data-delivery={m.deliveryState ?? ""}
                    >
                      <p className="mb-0.5 text-xs text-muted">
                        {m.kind === "note"
                          ? `${t("note")} · ${m.authorName ?? ""}`
                          : m.authorType === "automation"
                            ? `${t("automation")} · ${m.automationRuleName ?? ""} v${String(m.automationRuleVersion ?? 1)}`
                            : m.authorType === "system"
                              ? t("system")
                              : m.authorType === "guest"
                                ? open.detail.guestName
                                : (m.authorName ?? t("staff"))}{" "}
                        · {fmt(m.sentAt)}
                        {m.kind === "guest_message" && m.direction === "outbound" ? (
                          <Chip
                            color={
                              m.deliveryState === "sent"
                                ? "success"
                                : m.deliveryState === "failed"
                                  ? "danger"
                                  : "default"
                            }
                            size="sm"
                            className="ms-2"
                          >
                            {t(`delivery.${m.deliveryState ?? "queued"}`)}
                          </Chip>
                        ) : null}
                      </p>
                      <p className="whitespace-pre-wrap">{m.body}</p>
                      {m.attachments.map((a) => (
                        <p key={a.id} className="text-xs underline">
                          📎 {a.filename}
                        </p>
                      ))}
                      {m.deliveryState === "failed" ? (
                        <form action={retryMessageAction} className="mt-1 flex items-center gap-2">
                          {hidden(open.detail.id, open.detail.propertyId)}
                          <input type="hidden" name="messageId" value={m.id} />
                          <Button type="submit" variant="secondary" size="sm">
                            {t("retry")}
                          </Button>
                          {m.deliveryError ? (
                            <span className="text-xs text-danger">{m.deliveryError}</span>
                          ) : null}
                        </form>
                      ) : null}
                    </div>
                  ))}
                </div>
                {open.detail.automationHandover ? (
                  <p
                    className="rounded-xl bg-warning-soft px-3 py-2 text-xs text-warning-soft-foreground"
                    data-testid="handover"
                  >
                    {t("handover")}
                  </p>
                ) : null}
                <Composer
                  threadId={open.detail.id}
                  propertyId={open.detail.propertyId}
                  bookingId={open.detail.bookingId}
                  guestFirstName={open.detail.guestName.split(" ")[0] ?? "guest"}
                  guestLanguage={open.detail.guestLanguage}
                  providerLabel={providerLabel(open.detail.provider)}
                  provider={open.detail.provider}
                  templates={open.templates}
                  canSend={open.capabilities.messaging && open.detail.state !== "closed"}
                  canSuggest={open.detail.messages.some(
                    (m) => m.kind === "guest_message" && m.direction === "inbound",
                  )}
                  replyPhrases={{
                    greeting: t("draftGreeting", {
                      name: open.detail.guestName.split(" ")[0] ?? "",
                    }),
                    closing: t("draftClosing"),
                    fieldLabels: {
                      wifi_name: tg("fields.wifi_name"),
                      wifi_password: tg("fields.wifi_password"),
                      emergency_phone: tg("fields.emergency_phone"),
                    },
                  }}
                  labels={{
                    replyMode: t("replyMode"),
                    noteMode: t("noteMode"),
                    sendTo: t("sendTo"),
                    saveNote: t("saveNote"),
                    template: t("template"),
                    preview: t("previewing"),
                    noteHint: t("noteHint"),
                    missing: t("missing"),
                    switchConfirm: t("switchConfirm"),
                    suggest: t("suggest"),
                    suggesting: t("suggesting"),
                    draftedFromGuide: t("draftedFromGuide"),
                    draftedByModel: t("draftedByModel"),
                    warnSensitive: t("warnSensitive"),
                    warnUnanswered: t("warnUnanswered"),
                    warnUnrecognised: t("warnUnrecognised"),
                    guideLink: t("draftGuideLink"),
                  }}
                />
                {/* assign, snooze, tag: small forms on one line under the composer */}
                <div
                  className="flex flex-wrap items-end gap-x-4 gap-y-2 border-t border-border pt-3"
                  aria-label={t("threadTools")}
                >
                  <form action={assignThreadAction} className="flex items-end gap-2">
                    {hidden(open.detail.id, open.detail.propertyId)}
                    <Select
                      name="assigneeId"
                      label={t("assignee")}
                      defaultValue={open.detail.assigneeId ?? ""}
                      className="w-40"
                      testId="assignee"
                      size="sm"
                    >
                      <option value="">{t("unassigned")}</option>
                      <option value="me">{t("me")}</option>
                      {open.users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                    </Select>
                    <Button type="submit" variant="secondary" size="sm">
                      {t("assign")}
                    </Button>
                  </form>
                  <form action={snoozeThreadAction} className="flex items-end gap-2">
                    {hidden(open.detail.id, open.detail.propertyId)}
                    <Input
                      type="datetime-local"
                      name="until"
                      aria-label={t("snooze")}
                      className="h-8 w-48"
                      variant="secondary"
                    />
                    <Button type="submit" variant="secondary" size="sm">
                      {t("snooze")}
                    </Button>
                  </form>
                  <form action={tagThreadAction} className="flex items-end gap-2">
                    {hidden(open.detail.id, open.detail.propertyId)}
                    <Input
                      name="tags"
                      defaultValue={open.detail.tags.join(", ")}
                      placeholder={t("tags")}
                      aria-label={t("tag")}
                      className="h-8 w-44"
                      variant="secondary"
                    />
                    <Button type="submit" variant="secondary" size="sm">
                      {t("tag")}
                    </Button>
                  </form>
                </div>
              </Card>
            ) : (
              <Card className="hidden lg:block">
                <EmptyState title={t("pickThread")} />
              </Card>
            )}
          </div>
        </>
      )}
    </div>
  );
}
