import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { InboxView } from "@pms/core";
import { Button, Card, PageTitle } from "@/components/ui";
import { guard } from "@/server/guard";
import { providerLabel } from "@/server/inbox";
import { Composer } from "./composer";
import {
  assignThreadAction,
  listInbox,
  loadThread,
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
  const qs = (view: string) =>
    `/inbox?view=${view}${sp.property ? `&property=${sp.property}` : ""}${sp.thread ? `&thread=${sp.thread}` : ""}`;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <PageTitle>{t("title")}</PageTitle>
        <div className="flex gap-2 text-sm">
          <Link className="underline" href="/inbox/templates">
            {t("templates")}
          </Link>
          <Link className="underline" href="/inbox/automation">
            {t("automation")}
          </Link>
          <Link className="underline" href="/inbox/kpi">
            {t("kpi")}
          </Link>
          <Link className="underline" href="/reviews">
            {t("reviews")}
          </Link>
        </div>
      </div>
      <div className="grid grid-cols-[180px_minmax(280px,1fr)_minmax(0,2fr)] gap-3">
        <nav className="space-y-1 text-sm" data-testid="inbox-filters">
          {VIEWS.map((v) => (
            <Link
              key={v}
              href={qs(v)}
              className={`block rounded px-2 py-1 ${listing.view === v ? "bg-line font-semibold" : "hover:bg-canvas"}`}
            >
              {t(`views.${v}`)}
              {v === "needs_reply" && listing.counts.needsReply ? (
                <span className="ms-1 rounded bg-sky-soft px-1 text-xs">
                  {listing.counts.needsReply}
                </span>
              ) : null}
              {v === "breaching_sla" && listing.counts.breaching ? (
                <span className="ms-1 rounded bg-rose-soft px-1 text-xs">
                  {listing.counts.breaching}
                </span>
              ) : null}
            </Link>
          ))}
          <form className="pt-2">
            <input type="hidden" name="view" value={listing.view} />
            <select
              name="property"
              defaultValue={sp.property ?? ""}
              className="h-8 w-full rounded border border-line-strong px-1 text-xs"
            >
              <option value="">{t("allProperties")}</option>
              {listing.properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
            <input
              name="q"
              defaultValue={sp.q ?? ""}
              placeholder={t("search")}
              className="mt-1 h-8 w-full rounded border border-line-strong px-2 text-xs"
            />
            <Button type="submit" variant="secondary" className="mt-1 h-7 w-full text-xs">
              {t("filter")}
            </Button>
          </form>
        </nav>
        <Card className="max-h-[80vh] overflow-y-auto p-2">
          {listing.rows.length === 0 ? (
            <p className="p-2 text-sm text-muted">{t("empty")}</p>
          ) : null}
          {listing.rows.map((r) => (
            <Link
              key={r.id}
              href={`/inbox?view=${listing.view}&thread=${r.id}${sp.property ? `&property=${sp.property}` : ""}`}
              className={`block border-b border-line p-2 text-sm hover:bg-canvas ${sp.thread === r.id ? "bg-canvas" : ""}`}
              data-testid="thread-row"
              data-unread={r.unreadCount}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">
                  {r.guestName}
                  {r.unreadCount > 0 ? (
                    <span
                      className="ms-1 rounded-full bg-sky px-1.5 text-[10px] text-white"
                      data-testid="unread"
                    >
                      {r.unreadCount}
                    </span>
                  ) : null}
                </span>
                <span className="rounded bg-canvas px-1 text-[10px]">
                  {providerLabel(r.provider)}
                </span>
              </div>
              <p className="truncate text-xs text-muted">{r.preview}</p>
              <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px] text-muted">
                <span>{r.propertyTitle}</span>
                {r.arrivalDate ? (
                  <span>
                    · {r.arrivalDate} → {r.departureDate}
                  </span>
                ) : (
                  <span>· {t("inquiry")}</span>
                )}
                {r.sla.needsReply ? (
                  <span
                    className={`rounded px-1 ${r.sla.breached ? "bg-rose-soft text-rose" : (r.sla.remainingMinutes ?? 99) <= 30 ? "bg-amber-soft text-amber-deep" : "bg-mint-soft text-mint-deep"}`}
                    data-testid="sla-chip"
                  >
                    {r.sla.breached
                      ? t("slaBreached")
                      : t("slaLeft", { minutes: r.sla.remainingMinutes ?? 0 })}
                  </span>
                ) : null}
                {r.assigneeName ? <span>· {r.assigneeName}</span> : null}
                {r.state !== "open" ? <span>· {t(`states.${r.state}`)}</span> : null}
                {r.tags.map((tag) => (
                  <span key={tag} className="rounded bg-violet-100 px-1 text-violet-800">
                    {tag}
                  </span>
                ))}
              </div>
            </Link>
          ))}
        </Card>
        {open ? (
          <div className="grid grid-cols-[minmax(0,1fr)_240px] gap-3" data-testid="conversation">
            <Card className="space-y-3 p-4">
              <h2 className="text-lg font-semibold">
                {open.detail.guestName}{" "}
                <span className="text-xs font-normal text-muted">
                  via {providerLabel(open.detail.provider)} · {open.detail.propertyTitle}
                </span>
              </h2>
              {open.inquiry ? (
                <div
                  className="rounded border border-violet-200 bg-violet-50 p-2 text-xs"
                  data-testid="inquiry-card"
                >
                  <p className="font-semibold">{t(`inquiryKinds.${open.inquiry.kind}`)}</p>
                  <p>
                    {open.inquiry.checkIn ?? "?"} → {open.inquiry.checkOut ?? "?"} ·{" "}
                    {open.inquiry.guests ?? "?"} {t("guests")}
                    {open.inquiry.priceText ? ` · ${open.inquiry.priceText}` : ""}
                  </p>
                  <p className="text-rose">
                    {t("respondBy")} {fmt(open.inquiry.deadline)}
                  </p>
                </div>
              ) : null}
              <div className="max-h-[50vh] space-y-2 overflow-y-auto" data-testid="messages">
                {open.detail.messages.map((m) => (
                  <div
                    key={m.id}
                    className={`rounded-lg p-2 text-sm ${
                      m.kind === "note"
                        ? "border border-amber/50 bg-amber-soft"
                        : m.direction === "inbound"
                          ? "bg-canvas"
                          : "ms-8 bg-sky-soft"
                    }`}
                    data-testid="message"
                    data-kind={m.kind}
                    data-delivery={m.deliveryState ?? ""}
                  >
                    <p className="text-[10px] text-muted">
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
                        <span
                          className={`ms-2 rounded px-1 ${m.deliveryState === "sent" ? "bg-mint-soft text-mint-deep" : m.deliveryState === "failed" ? "bg-rose-soft text-rose" : "bg-line"}`}
                        >
                          {t(`delivery.${m.deliveryState ?? "queued"}`)}
                        </span>
                      ) : null}
                    </p>
                    <p className="whitespace-pre-wrap">{m.body}</p>
                    {m.attachments.map((a) => (
                      <p key={a.id} className="text-xs underline">
                        📎 {a.filename}
                      </p>
                    ))}
                    {m.deliveryState === "failed" ? (
                      <form action={retryMessageAction} className="mt-1">
                        <input type="hidden" name="threadId" value={open.detail.id} />
                        <input type="hidden" name="propertyId" value={open.detail.propertyId} />
                        <input type="hidden" name="messageId" value={m.id} />
                        <Button type="submit" variant="secondary" className="h-6 text-xs">
                          {t("retry")}
                        </Button>
                        {m.deliveryError ? (
                          <span className="ms-2 text-xs text-rose">{m.deliveryError}</span>
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
            <aside className="space-y-3 text-xs" data-testid="booking-sidebar">
              {open.detail.booking ? (
                <Card className="space-y-1 p-3">
                  <p className="font-semibold">{t("booking")}</p>
                  <p>
                    {open.detail.booking.arrivalDate} → {open.detail.booking.departureDate}
                  </p>
                  <p>
                    {open.detail.booking.roomType ?? ""}{" "}
                    {open.detail.booking.unit ? `· ${open.detail.booking.unit}` : ""}
                  </p>
                  <p>
                    {t("total")}: {(open.detail.booking.totalMinor / 100).toFixed(2)}{" "}
                    {open.detail.booking.currency}
                    {" · "}
                    {t("balance")}: {(open.detail.booking.balanceMinor / 100).toFixed(2)}
                  </p>
                  <p>
                    {t("status")}: {open.detail.booking.status} · {open.detail.booking.opsState}
                  </p>
                  <p>
                    {t("previousStays")}: {open.detail.booking.previousStays}
                  </p>
                  <Link className="underline" href={`/reservations/${open.detail.booking.id}`}>
                    {t("openBooking")}
                  </Link>
                </Card>
              ) : (
                <Card className="p-3">{t("noBooking")}</Card>
              )}
              <Card className="space-y-2 p-3">
                <form action={assignThreadAction} className="flex gap-1">
                  <input type="hidden" name="threadId" value={open.detail.id} />
                  <input type="hidden" name="propertyId" value={open.detail.propertyId} />
                  <select
                    name="assigneeId"
                    defaultValue={open.detail.assigneeId ?? ""}
                    className="h-7 flex-1 rounded border border-line-strong"
                    data-testid="assignee"
                  >
                    <option value="">{t("unassigned")}</option>
                    <option value="me">{t("me")}</option>
                    {open.users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                  <Button type="submit" variant="secondary" className="h-7 text-xs">
                    {t("assign")}
                  </Button>
                </form>
                <form action={snoozeThreadAction} className="flex gap-1">
                  <input type="hidden" name="threadId" value={open.detail.id} />
                  <input type="hidden" name="propertyId" value={open.detail.propertyId} />
                  <input
                    type="datetime-local"
                    name="until"
                    className="h-7 min-w-0 flex-1 rounded border border-line-strong px-1"
                  />
                  <Button type="submit" variant="secondary" className="h-7 text-xs">
                    {t("snooze")}
                  </Button>
                </form>
                <form action={tagThreadAction} className="flex gap-1">
                  <input type="hidden" name="threadId" value={open.detail.id} />
                  <input type="hidden" name="propertyId" value={open.detail.propertyId} />
                  <input
                    name="tags"
                    defaultValue={open.detail.tags.join(", ")}
                    placeholder={t("tags")}
                    className="h-7 min-w-0 flex-1 rounded border border-line-strong px-1"
                  />
                  <Button type="submit" variant="secondary" className="h-7 text-xs">
                    {t("tag")}
                  </Button>
                </form>
                <div className="flex flex-wrap gap-1">
                  {open.detail.state === "open" ? (
                    <>
                      <form action={setThreadStateAction}>
                        <input type="hidden" name="threadId" value={open.detail.id} />
                        <input type="hidden" name="propertyId" value={open.detail.propertyId} />
                        <input type="hidden" name="state" value="closed" />
                        <input type="hidden" name="reason" value="resolved" />
                        <Button
                          type="submit"
                          variant="secondary"
                          className="h-7 text-xs"
                          data-testid="close-thread"
                        >
                          {t("close")}
                        </Button>
                      </form>
                      {open.capabilities.noReplyNeeded ? (
                        <form action={setThreadStateAction}>
                          <input type="hidden" name="threadId" value={open.detail.id} />
                          <input type="hidden" name="propertyId" value={open.detail.propertyId} />
                          <input type="hidden" name="state" value="no_reply_needed" />
                          <Button
                            type="submit"
                            variant="secondary"
                            className="h-7 text-xs"
                            data-testid="no-reply-needed"
                          >
                            {t("noReplyNeeded")}
                          </Button>
                        </form>
                      ) : null}
                    </>
                  ) : (
                    <form action={setThreadStateAction}>
                      <input type="hidden" name="threadId" value={open.detail.id} />
                      <input type="hidden" name="propertyId" value={open.detail.propertyId} />
                      <input type="hidden" name="state" value="open" />
                      <Button type="submit" variant="secondary" className="h-7 text-xs">
                        {t("reopen")}
                      </Button>
                    </form>
                  )}
                </div>
                {open.detail.automationHandover ? (
                  <p className="text-amber-deep" data-testid="handover">
                    {t("handover")}
                  </p>
                ) : null}
              </Card>
            </aside>
          </div>
        ) : (
          <Card className="text-sm text-muted">{t("pickThread")}</Card>
        )}
      </div>
    </div>
  );
}
