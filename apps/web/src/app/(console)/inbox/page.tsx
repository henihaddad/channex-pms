import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { InboxView } from "@pms/core";
import {
  Alert,
  Button,
  Card,
  Chip,
  EmptyState,
  Facts,
  Input,
  LinkButton,
  PageHeader,
  Select,
  cn,
} from "@/components/ui";
import { guard } from "@/server/guard";
import { providerLabel } from "@/server/inbox";
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
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={t("title")}
        actions={
          <>
            <LinkButton href="/inbox/templates" variant="ghost" size="sm">
              {t("templates")}
            </LinkButton>
            <LinkButton href="/inbox/automation" variant="ghost" size="sm">
              {t("automation")}
            </LinkButton>
            <LinkButton href="/inbox/kpi" variant="ghost" size="sm">
              {t("kpi")}
            </LinkButton>
            <LinkButton href="/reviews" variant="ghost" size="sm">
              {t("reviews")}
            </LinkButton>
          </>
        }
      />
      {gaps.length > 0 ? (
        <Alert tone="warning" data-testid="messages-app-missing">
          {t("messagesAppMissing", { properties: gaps.map((g) => g.title).join(", ") })}
        </Alert>
      ) : null}
      <div className="grid gap-4 xl:grid-cols-[200px_minmax(300px,1fr)_minmax(0,2fr)]">
        <nav className="flex flex-col gap-3" data-testid="inbox-filters">
          <ul className="flex flex-col gap-0.5">
            {VIEWS.map((v) => (
              <li key={v}>
                <Link
                  href={qs(v)}
                  className={cn(
                    "flex items-center justify-between rounded-xl px-3 py-1.5 text-sm transition-colors",
                    listing.view === v
                      ? "bg-surface font-medium text-foreground shadow-surface"
                      : "text-muted hover:bg-default hover:text-foreground",
                  )}
                >
                  <span>{t(`views.${v}`)}</span>
                  {v === "needs_reply" && listing.counts.needsReply ? (
                    <Chip color="accent" size="sm">
                      {listing.counts.needsReply}
                    </Chip>
                  ) : null}
                  {v === "breaching_sla" && listing.counts.breaching ? (
                    <Chip color="danger" size="sm">
                      {listing.counts.breaching}
                    </Chip>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
          <form className="flex flex-col gap-2">
            <input type="hidden" name="view" value={listing.view} />
            <Select
              name="property"
              defaultValue={sp.property ?? ""}
              aria-label={t("allProperties")}
              size="sm"
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
            />
            <Button type="submit" variant="secondary" size="sm" fullWidth>
              {t("filter")}
            </Button>
          </form>
        </nav>

        <Card className="max-h-[80vh] overflow-y-auto p-2" contentClassName="flex flex-col gap-1">
          {listing.rows.length === 0 ? (
            <EmptyState title={t("emptyTitle")} description={t("empty")} className="px-3" />
          ) : null}
          {listing.rows.map((r) => (
            <Link
              key={r.id}
              href={`/inbox?view=${listing.view}&thread=${r.id}${sp.property ? `&property=${sp.property}` : ""}`}
              className={cn(
                "block rounded-2xl px-3 py-2.5 text-sm transition-colors hover:bg-default",
                sp.thread === r.id ? "bg-default" : "",
              )}
              data-testid="thread-row"
              data-unread={r.unreadCount}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex min-w-0 items-center gap-1.5 font-medium">
                  <span className="truncate">{r.guestName}</span>
                  {r.unreadCount > 0 ? (
                    <Chip color="accent" variant="primary" size="sm" data-testid="unread">
                      {r.unreadCount}
                    </Chip>
                  ) : null}
                </span>
                <span className="shrink-0 text-xs text-muted">{providerLabel(r.provider)}</span>
              </div>
              <p className="truncate text-xs text-muted">{r.preview}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                <span>{r.propertyTitle}</span>
                {r.arrivalDate ? (
                  <span>
                    · {r.arrivalDate} → {r.departureDate}
                  </span>
                ) : (
                  <span>· {t("inquiry")}</span>
                )}
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
                ) : null}
                {r.assigneeName ? <span>· {r.assigneeName}</span> : null}
                {r.state !== "open" ? <span>· {t(`states.${r.state}`)}</span> : null}
                {r.tags.map((tag) => (
                  <Chip key={tag} size="sm">
                    {tag}
                  </Chip>
                ))}
              </div>
            </Link>
          ))}
        </Card>

        {open ? (
          <div
            className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_260px]"
            data-testid="conversation"
          >
            <Card
              title={open.detail.guestName}
              description={`${t("via")} ${providerLabel(open.detail.provider)} · ${open.detail.propertyTitle}`}
              contentClassName="flex flex-col gap-3"
            >
              {open.inquiry ? (
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
                }}
              />
            </Card>
            <aside className="flex flex-col gap-4" data-testid="booking-sidebar">
              {open.detail.booking ? (
                <Card title={t("booking")}>
                  <Facts
                    items={[
                      [
                        t("dates"),
                        `${open.detail.booking.arrivalDate} → ${open.detail.booking.departureDate}`,
                      ],
                      [
                        t("unit"),
                        `${open.detail.booking.roomType ?? ""}${open.detail.booking.unit ? ` · ${open.detail.booking.unit}` : ""}` ||
                          "—",
                      ],
                      [
                        t("total"),
                        `${(open.detail.booking.totalMinor / 100).toFixed(2)} ${open.detail.booking.currency}`,
                      ],
                      [t("balance"), (open.detail.booking.balanceMinor / 100).toFixed(2)],
                      [
                        t("status"),
                        `${open.detail.booking.status} · ${open.detail.booking.opsState}`,
                      ],
                      [t("previousStays"), String(open.detail.booking.previousStays)],
                    ]}
                  />
                  <Link
                    className="mt-3 inline-block text-sm text-accent hover:underline"
                    href={`/reservations/${open.detail.booking.id}`}
                  >
                    {t("openBooking")}
                  </Link>
                </Card>
              ) : (
                <Card>
                  <p className="text-sm text-muted">{t("noBooking")}</p>
                </Card>
              )}
              <Card title={t("thread")} contentClassName="flex flex-col gap-3">
                <form action={assignThreadAction} className="flex items-end gap-2">
                  {hidden(open.detail.id, open.detail.propertyId)}
                  <Select
                    name="assigneeId"
                    label={t("assignee")}
                    defaultValue={open.detail.assigneeId ?? ""}
                    className="min-w-0 flex-1"
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
                    className="min-w-0 flex-1"
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
                    className="min-w-0 flex-1"
                    variant="secondary"
                  />
                  <Button type="submit" variant="secondary" size="sm">
                    {t("tag")}
                  </Button>
                </form>
                <div className="flex flex-wrap gap-2">
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
                            variant="secondary"
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
                {open.detail.automationHandover ? (
                  <p className="text-xs text-warning-soft-foreground" data-testid="handover">
                    {t("handover")}
                  </p>
                ) : null}
              </Card>
            </aside>
          </div>
        ) : (
          <Card>
            <EmptyState title={t("pickThread")} />
          </Card>
        )}
      </div>
    </div>
  );
}
