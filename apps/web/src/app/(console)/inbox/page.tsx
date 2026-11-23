import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { DEFAULT_SLA, type InboxView } from "@pms/core";
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
  SubmitButton,
  cn,
} from "@/components/ui";
import { channelLabel, clock, dayMonth, elapsed, nightsBetween } from "@/lib/format";
import { InboxKeys } from "./inbox-keys";
import { presetDate, SNOOZE_TIME } from "./snooze";
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

export async function generateMetadata() {
  const t = await getTranslations("inbox");
  return { title: t("title") };
}

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
/** The four views the design keeps in front; the rest sit behind "More". */
const FRONT: InboxView[] = ["needs_reply", "breaching_sla", "arriving", "all"];

/**
 * The unified inbox (spec 09 §9.1–9.4, design canvas November 2026): one list of conversations
 * with the four views that matter in front, and the open conversation beside it — the booking in
 * one line, the messages as a chat, how long the guest has waited against the target, and the
 * composer that drafts from the guest guide.
 */
export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const t = await getTranslations("inbox");
  const tg = await getTranslations("guides");
  const locale = await getLocale();
  // three independent reads, three transactions: run them together, not one after the other
  const [listing, open, gaps] = await Promise.all([
    guard(() =>
      listInbox({
        view: sp.view,
        propertyId: sp.property ?? null,
        provider: sp.provider ?? null,
        q: sp.q ?? null,
      }),
    ),
    sp.thread ? guard(() => loadThread({ threadId: sp.thread! })) : Promise.resolve(null),
    // CXMSG-1: a property whose channel manager has no Messages app is named here, never a silent empty inbox
    guard(() => messagingGaps()),
  ]);
  const keep = `${sp.property ? `&property=${sp.property}` : ""}${sp.q ? `&q=${encodeURIComponent(sp.q)}` : ""}`;
  const qs = (view: string) =>
    `/inbox?view=${view}${keep}${sp.thread ? `&thread=${sp.thread}` : ""}`;
  const hidden = (threadId: string, propertyId: string) => (
    <>
      <input type="hidden" name="threadId" value={threadId} />
      <input type="hidden" name="propertyId" value={propertyId} />
    </>
  );
  const today = new Date().toISOString().slice(0, 10);
  const weekday = (iso: string) =>
    new Intl.DateTimeFormat(locale === "en" ? "en-GB" : locale, {
      weekday: "short",
      timeZone: "UTC",
    }).format(new Date(`${iso}T12:00:00Z`));
  const stayWord = (arrival: string | null, departure: string | null): string => {
    if (!arrival || !departure) return t("inquiry");
    if (arrival === today) return t("row.arrivesToday");
    if (arrival > today) return t("row.arrives", { day: weekday(arrival) });
    if (departure > today) return t("row.inHouse");
    return t("row.leftOn", { day: dayMonth(departure, locale) });
  };
  const when = (iso: string | null) => {
    if (!iso) return "";
    if (iso.slice(0, 10) === today) return elapsed(iso, new Date(), locale);
    const y = new Date(`${today}T00:00:00Z`);
    y.setUTCDate(y.getUTCDate() - 1);
    return iso.slice(0, 10) === y.toISOString().slice(0, 10)
      ? t("row.yesterday")
      : dayMonth(iso, locale);
  };
  const pill = (active: boolean, tone: "dark" | "amber" | "plain") =>
    cn(
      "inline-flex h-8 shrink-0 items-center rounded-full px-3 text-[13px] font-semibold whitespace-nowrap transition-colors",
      active
        ? "bg-foreground text-background"
        : tone === "amber"
          ? "bg-warning-soft text-warning-soft-foreground"
          : "border border-border-control text-muted hover:text-foreground",
    );
  const openRow = open ? listing.rows.find((r) => r.id === open.detail.id) : undefined;
  const booking = open?.detail.booking ?? null;
  const lastInbound = open
    ? [...open.detail.messages]
        .reverse()
        .find((m) => m.kind === "guest_message" && m.direction === "inbound")
    : undefined;
  /** "Tue 24 Nov, 09:00" in the property's time zone. */
  const zoned = (iso: string, timeZone: string) =>
    `${new Intl.DateTimeFormat(locale === "en" ? "en-GB" : locale, {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone,
    }).format(new Date(iso))}, ${clock(iso, timeZone, locale)}`;
  const slaText = (sla: { breached: boolean; remainingMinutes: number | null }) => {
    if (sla.breached) return t("slaBreached");
    const m = sla.remainingMinutes ?? 0;
    return m >= 60
      ? t("slaLeftHours", { hours: Math.floor(m / 60) })
      : t("slaLeft", { minutes: m });
  };
  const searching = Boolean(sp.q || sp.property);
  const weekdayOf = (iso: string) =>
    new Intl.DateTimeFormat(locale === "en" ? "en-GB" : locale, {
      weekday: "long",
      timeZone: "UTC",
    }).format(new Date(`${iso}T12:00:00Z`));

  if (listing.counts.open === 0 && listing.rows.length === 0 && !sp.q && !sp.property)
    return (
      <div className="flex flex-col gap-5">
        <PageHeader title={t("title")} description={t("lead")} titleOnPhone={false} />
        {gaps.length > 0 ? (
          <Alert tone="warning" data-testid="messages-app-missing">
            {t("messagesAppMissing", { properties: gaps.map((g) => g.title).join(", ") })}
          </Alert>
        ) : null}
        <Card className="items-center px-8 py-12 text-center">
          <div
            className="mx-auto flex w-[420px] max-w-full flex-col gap-2 rounded-[14px] border border-border bg-surface-secondary p-3 text-start text-xs"
            aria-hidden="true"
          >
            <span className="self-start rounded-xl rounded-bl-sm border border-border bg-surface px-2.5 py-1.5">
              {t("emptyPreview.question")}
            </span>
            <span className="self-end rounded-xl rounded-br-sm bg-accent px-2.5 py-1.5 text-white">
              {t("emptyPreview.answer")}
            </span>
          </div>
          <h2 className="mt-4 font-display text-xl font-bold">{t("emptyTitle")}</h2>
          <p className="mx-auto mt-2 max-w-[460px] text-sm leading-relaxed text-muted">
            {t("empty")}
          </p>
          <div className="mt-4">
            <LinkButton href="/channels" variant="primary" size="lg">
              {t("connectChannel")}
            </LinkButton>
          </div>
        </Card>
      </div>
    );

  return (
    <div className="flex flex-col gap-5" data-own-keys="inbox">
      <InboxKeys />
      <PageHeader title={t("title")} description={t("lead")} titleOnPhone={false} />
      {gaps.length > 0 ? (
        <Alert tone="warning" data-testid="messages-app-missing">
          {t("messagesAppMissing", { properties: gaps.map((g) => g.title).join(", ") })}
        </Alert>
      ) : null}
      <div className="grid gap-5 lg:min-h-[720px] lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <section
          className={cn(
            "flex min-w-0 flex-col overflow-hidden rounded-card border border-border bg-surface outline-none",
            open ? "hidden lg:flex" : "",
          )}
          aria-label={t("listRegion")}
          // clicking anywhere in the list focuses it, so the single-letter keys apply here only
          tabIndex={-1}
          data-inbox-region
        >
          <nav
            className="flex items-center gap-1.5 border-b border-default px-3.5 py-3"
            aria-label={t("filters")}
            data-testid="inbox-filters"
          >
            <div className="scrollbar-none flex min-w-0 flex-1 gap-1.5 overflow-x-auto">
              {FRONT.map((v) => (
                <Link
                  key={v}
                  href={qs(v)}
                  className={pill(listing.view === v, v === "breaching_sla" ? "amber" : "plain")}
                >
                  {t(`views.${v}`)}
                  {v === "needs_reply" && listing.counts.needsReply
                    ? ` · ${listing.counts.needsReply}`
                    : ""}
                  {v === "breaching_sla" && listing.counts.breaching
                    ? ` · ${listing.counts.breaching}`
                    : ""}
                </Link>
              ))}
            </div>
            <details className="relative shrink-0">
              <summary
                className={cn(
                  "grid h-8 w-8 cursor-pointer list-none place-items-center rounded-full text-sm [&::-webkit-details-marker]:hidden",
                  !FRONT.includes(listing.view)
                    ? "bg-foreground text-background"
                    : "border border-border-control text-muted hover:text-foreground",
                )}
                aria-label={t("moreViews")}
                title={t("moreViews")}
              >
                <span aria-hidden="true">⋯</span>
              </summary>
              <div className="absolute end-0 top-full z-20 mt-1 flex w-64 flex-col gap-1 rounded-xl border border-border bg-surface p-2 shadow-float">
                {VIEWS.filter((v) => !FRONT.includes(v)).map((v) => (
                  <Link
                    key={v}
                    href={qs(v)}
                    aria-current={listing.view === v ? "true" : undefined}
                    className={cn(
                      "rounded-lg px-2.5 py-1.5 text-sm hover:bg-default",
                      listing.view === v ? "font-semibold text-foreground" : "text-muted",
                    )}
                  >
                    {t(`views.${v}`)}
                  </Link>
                ))}
              </div>
            </details>
          </nav>
          <form
            role="search"
            className="flex flex-wrap items-center gap-2 border-b border-default px-3.5 py-2.5"
            data-testid="inbox-search"
          >
            <input type="hidden" name="view" value={listing.view} />
            <Input
              type="search"
              name="q"
              defaultValue={sp.q ?? ""}
              placeholder={t("search")}
              aria-label={t("searchLabel")}
              variant="secondary"
              className="h-8 min-w-0 flex-1 text-[13px]"
            />
            {listing.properties.length > 1 ? (
              <Select
                name="property"
                defaultValue={sp.property ?? ""}
                aria-label={t("propertyFilter")}
                size="sm"
                className="w-40"
              >
                <option value="">{t("allProperties")}</option>
                {listing.properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </Select>
            ) : null}
            <Button type="submit" variant="secondary" size="sm">
              {t("filter")}
            </Button>
            {searching ? (
              <Link
                href={`/inbox?view=${listing.view}`}
                className="text-xs font-semibold text-muted hover:text-foreground"
              >
                {t("clearSearch")}
              </Link>
            ) : null}
          </form>
          {listing.rows.length === 0 ? (
            <EmptyState
              title={t("viewEmptyTitle")}
              description={t("viewEmpty", { view: t(`views.${listing.view}`) })}
              className="px-4"
              action={
                <LinkButton
                  href={searching ? `/inbox?view=${listing.view}` : "/inbox?view=all"}
                  variant="secondary"
                  size="sm"
                >
                  {searching ? t("clearSearch") : t("showAll")}
                </LinkButton>
              }
            />
          ) : null}
          <ul className="flex flex-col overflow-y-auto">
            {listing.rows.map((r) => {
              const youLast =
                r.lastOutboundAt !== null &&
                (r.lastInboundAt === null || r.lastOutboundAt >= r.lastInboundAt);
              const selected = sp.thread === r.id;
              return (
                <li key={r.id}>
                  <Link
                    href={`/inbox?view=${listing.view}&thread=${r.id}${keep}`}
                    className={cn(
                      "block border-b border-default border-s-[3px] px-4 py-3.5 transition-colors hover:bg-surface-secondary",
                      selected ? "border-s-accent bg-selected" : "border-s-transparent",
                    )}
                    aria-current={selected ? "true" : undefined}
                    data-testid="thread-row"
                    data-unread={r.unreadCount}
                  >
                    <div className="flex items-baseline justify-between gap-2.5">
                      <span className="inline-flex min-w-0 items-center gap-1.5">
                        <strong
                          className={cn(
                            "truncate text-sm",
                            r.unreadCount > 0 ? "font-bold" : "font-medium",
                          )}
                        >
                          {r.guestName}
                        </strong>
                        {r.unreadCount > 0 ? (
                          <>
                            <span
                              className="inline-flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-foreground"
                              data-testid="unread"
                              aria-hidden="true"
                            >
                              {r.unreadCount}
                            </span>
                            <span className="sr-only">
                              {t("unreadCount", { n: r.unreadCount })}
                            </span>
                          </>
                        ) : null}
                      </span>
                      {r.sla.needsReply ? (
                        <span
                          className="inline-flex shrink-0 items-center gap-1.5 text-xs text-muted"
                          data-testid="sla-chip"
                          data-breached={r.sla.breached ? "1" : "0"}
                        >
                          {/* the target in words, not only in amber (WCAG 1.4.1) */}
                          <Chip size="sm" color={r.sla.breached ? "warning" : "default"}>
                            {slaText(r.sla)}
                          </Chip>
                          {when(r.lastInboundAt)}
                        </span>
                      ) : (
                        <span className="shrink-0 text-xs text-muted">{when(r.lastMessageAt)}</span>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-[13px] text-muted">
                      {[
                        r.propertyTitle,
                        channelLabel(providerLabel(r.provider)),
                        stayWord(r.arrivalDate, r.departureDate),
                      ].join(" · ")}
                      {r.assigneeName ? ` · ${r.assigneeName}` : ""}
                      {r.state !== "open" ? ` · ${t(`states.${r.state}`)}` : ""}
                    </p>
                    <p
                      className={cn(
                        "mt-1.5 truncate text-[13px]",
                        youLast ? "text-muted" : "text-foreground",
                      )}
                    >
                      {youLast ? `${t("row.you")}: ` : ""}
                      {r.preview}
                    </p>
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
                </li>
              );
            })}
          </ul>
        </section>

        {open ? (
          <section
            className="flex min-w-0 flex-col overflow-hidden rounded-card border border-border bg-surface outline-none"
            data-testid="conversation"
            aria-label={t("threadRegion", { name: open.detail.guestName })}
            tabIndex={-1}
            data-inbox-region
          >
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-default px-5 py-4">
              <div className="min-w-0">
                <Link
                  href={`/inbox?view=${listing.view}${keep}`}
                  className="mb-1 inline-block text-xs text-muted lg:hidden"
                >
                  ← {t("title")}
                </Link>
                <h2 className="text-base font-bold">{open.detail.guestName}</h2>
                <p
                  className="mt-0.5 text-[13px] text-muted"
                  data-testid="booking-sidebar"
                  data-arrival={booking?.arrivalDate ?? ""}
                  data-departure={booking?.departureDate ?? ""}
                >
                  {[
                    open.detail.propertyTitle,
                    booking
                      ? `${dayMonth(booking.arrivalDate, locale)}–${dayMonth(booking.departureDate, locale)} · ${t("nightsCount", { n: nightsBetween(booking.arrivalDate, booking.departureDate) })}`
                      : t("inquiry"),
                    t("viaChannel", { channel: channelLabel(providerLabel(open.detail.provider)) }),
                  ].join(" · ")}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {booking ? (
                  <LinkButton href={`/reservations/${booking.id}`} size="sm">
                    {t("reservation")}
                  </LinkButton>
                ) : null}
                <details className="relative" data-assign>
                  <summary className="inline-flex h-8 cursor-pointer list-none items-center rounded-full border border-border-control px-3 text-[13px] font-semibold [&::-webkit-details-marker]:hidden">
                    {open.detail.assigneeId
                      ? (open.users.find((u) => u.id === open.detail.assigneeId)?.name ??
                        t("assign"))
                      : t("assign")}
                  </summary>
                  <form
                    action={assignThreadAction}
                    className="absolute end-0 top-full z-20 mt-1 flex w-64 flex-col gap-2 rounded-xl border border-border bg-surface p-3 shadow-float"
                  >
                    {hidden(open.detail.id, open.detail.propertyId)}
                    <Select
                      name="assigneeId"
                      label={t("assignee")}
                      defaultValue={open.detail.assigneeId ?? ""}
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
                    <SubmitButton size="sm" variant="primary">
                      {t("assign")}
                    </SubmitButton>
                  </form>
                </details>
                <details className="relative">
                  <summary
                    className="inline-flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-full border border-border-control text-sm [&::-webkit-details-marker]:hidden"
                    aria-label={t("threadTools")}
                    title={t("threadTools")}
                  >
                    <span aria-hidden="true">⋯</span>
                  </summary>
                  <div className="absolute end-0 top-full z-20 mt-1 flex w-72 flex-col gap-2 rounded-xl border border-border bg-surface p-3 shadow-float">
                    {open.detail.state === "open" ? (
                      <div className="flex flex-wrap gap-2">
                        <form action={setThreadStateAction} data-close-thread>
                          {hidden(open.detail.id, open.detail.propertyId)}
                          <input type="hidden" name="state" value="closed" />
                          <input type="hidden" name="reason" value="resolved" />
                          <SubmitButton variant="secondary" size="sm" testId="close-thread">
                            {t("close")}
                          </SubmitButton>
                        </form>
                        {open.capabilities.noReplyNeeded ? (
                          <form action={setThreadStateAction}>
                            {hidden(open.detail.id, open.detail.propertyId)}
                            <input type="hidden" name="state" value="no_reply_needed" />
                            <SubmitButton variant="secondary" size="sm" testId="no-reply-needed">
                              {t("noReplyNeeded")}
                            </SubmitButton>
                          </form>
                        ) : null}
                      </div>
                    ) : (
                      <form action={setThreadStateAction}>
                        {hidden(open.detail.id, open.detail.propertyId)}
                        <input type="hidden" name="state" value="open" />
                        <SubmitButton variant="secondary" size="sm" testId="reopen-thread">
                          {t("reopen")}
                        </SubmitButton>
                      </form>
                    )}
                    <form action={snoozeThreadAction} className="flex flex-col gap-2">
                      {hidden(open.detail.id, open.detail.propertyId)}
                      <p className="text-xs font-semibold">
                        {t("snooze")}{" "}
                        <span className="font-normal text-muted">
                          · {t("snoozeZone", { zone: open.timeZone })}
                        </span>
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {(["tomorrow", "next_week"] as const).map((preset) => {
                          const date = presetDate(preset, new Date(), open.timeZone);
                          return (
                            <SubmitButton
                              key={preset}
                              name="preset"
                              value={preset}
                              variant="secondary"
                              size="sm"
                              testId={`snooze-${preset}`}
                            >
                              {t(`snoozePresets.${preset}`, {
                                day: weekdayOf(date),
                                time: SNOOZE_TIME,
                              })}
                            </SubmitButton>
                          );
                        })}
                      </div>
                      <div className="flex items-end gap-2">
                        <Input
                          type="datetime-local"
                          name="until"
                          aria-label={t("snoozeCustom", { zone: open.timeZone })}
                          className="h-8 min-w-0 flex-1 text-xs"
                          variant="secondary"
                        />
                        <SubmitButton variant="secondary" size="sm">
                          {t("snooze")}
                        </SubmitButton>
                      </div>
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
                      <SubmitButton variant="secondary" size="sm">
                        {t("tag")}
                      </SubmitButton>
                    </form>
                  </div>
                </details>
              </div>
            </header>
            {open.detail.state !== "open" ? (
              // closing (E) is one click to undo, right where it happened
              <div
                className="flex flex-wrap items-center justify-between gap-2 border-b border-default bg-surface-secondary px-5 py-2.5 text-[13px]"
                data-testid="thread-closed"
              >
                <span>{t("closedBanner", { state: t(`states.${open.detail.state}`) })}</span>
                <form action={setThreadStateAction}>
                  {hidden(open.detail.id, open.detail.propertyId)}
                  <input type="hidden" name="state" value="open" />
                  <SubmitButton variant="secondary" size="sm" testId="undo-close">
                    {t("reopen")}
                  </SubmitButton>
                </form>
              </div>
            ) : null}
            <div
              className="scrollbar flex flex-1 flex-col gap-3.5 overflow-y-auto p-5 lg:max-h-[52vh]"
              data-testid="messages"
            >
              {open.request ? (
                <RequestCard r={open.request} compact timeZone={open.timeZone} />
              ) : open.inquiry ? (
                <div
                  className="rounded-2xl bg-accent-soft px-3 py-2 text-xs text-accent-soft-foreground"
                  data-testid="inquiry-card"
                >
                  <p className="font-semibold">{t(`inquiryKinds.${open.inquiry.kind}`)}</p>
                  <p>
                    {open.inquiry.checkIn ? dayMonth(open.inquiry.checkIn, locale) : "?"} →{" "}
                    {open.inquiry.checkOut ? dayMonth(open.inquiry.checkOut, locale) : "?"} ·{" "}
                    {t("guestsCount", { n: open.inquiry.guests ?? 0 })}
                    {open.inquiry.priceText ? ` · ${open.inquiry.priceText}` : ""}
                  </p>
                  {open.inquiry.deadline ? (
                    <p className="text-danger">
                      {t("respondByAt", { when: zoned(open.inquiry.deadline, open.timeZone) })}
                    </p>
                  ) : null}
                </div>
              ) : null}
              {open.detail.messages.map((m) => {
                const out = m.direction === "outbound";
                const note = m.kind === "note";
                const author = note
                  ? `${t("note")} · ${m.authorName ?? ""}`
                  : m.authorType === "automation"
                    ? `${t("automation")} · ${m.automationRuleName ?? ""}${m.automationRuleVersion ? ` v${m.automationRuleVersion}` : ""}`
                    : m.authorType === "system"
                      ? t("system")
                      : m.authorType === "guest"
                        ? (open.detail.guestName.split(" ")[0] ?? open.detail.guestName)
                        : (m.authorName ?? t("row.you"));
                return (
                  <div
                    key={m.id}
                    className={cn(
                      "max-w-[78%] px-3.5 py-2.5 text-sm leading-normal",
                      note
                        ? "max-w-full self-stretch rounded-xl bg-warning-soft"
                        : out
                          ? "self-end rounded-2xl rounded-br-sm bg-accent text-white"
                          : "self-start rounded-2xl rounded-bl-sm bg-background",
                    )}
                    data-testid="message"
                    data-kind={m.kind}
                    data-delivery={m.deliveryState ?? ""}
                  >
                    <p className="whitespace-pre-wrap">{m.body}</p>
                    {m.attachments.map((a) => (
                      <p key={a.id} className="text-xs underline">
                        📎 {a.filename}
                      </p>
                    ))}
                    <span
                      className={cn(
                        "mt-1 block text-[11px]",
                        out && !note ? "text-white/80" : "text-muted",
                      )}
                    >
                      {author} · {when(m.sentAt)}
                      {m.kind === "guest_message" && out && m.deliveryState !== "sent"
                        ? ` · ${t(`delivery.${m.deliveryState ?? "queued"}`)}`
                        : ""}
                    </span>
                    {m.deliveryState === "failed" ? (
                      <form action={retryMessageAction} className="mt-1.5 flex items-center gap-2">
                        {hidden(open.detail.id, open.detail.propertyId)}
                        <input type="hidden" name="messageId" value={m.id} />
                        <SubmitButton variant="secondary" size="sm">
                          {t("retry")}
                        </SubmitButton>
                        {m.deliveryError ? (
                          <span className="text-xs">{m.deliveryError}</span>
                        ) : null}
                      </form>
                    ) : null}
                  </div>
                );
              })}
              {openRow?.sla.needsReply && lastInbound ? (
                <span
                  className={cn(
                    "self-center rounded-full px-2.5 py-1 text-xs",
                    openRow.sla.breached
                      ? "bg-warning-soft text-warning-soft-foreground"
                      : "bg-default text-muted",
                  )}
                >
                  {t("repliedAgo", {
                    ago: elapsed(lastInbound.sentAt, new Date(), locale),
                    target: DEFAULT_SLA.firstResponseMinutes,
                  })}
                </span>
              ) : null}
              {open.detail.automationHandover ? (
                <span
                  className="self-center rounded-full bg-warning-soft px-2.5 py-1 text-xs text-warning-soft-foreground"
                  data-testid="handover"
                >
                  {t("handover")}
                </span>
              ) : null}
            </div>
            <div className="border-t border-default px-5 pt-3.5 pb-4.5">
              <Composer
                key={open.detail.id}
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
                  sendButton: t("sendToVia", {
                    name: open.detail.guestName.split(" ")[0] ?? "",
                    channel: providerLabel(open.detail.provider),
                  }),
                  sending: t("sending"),
                  placeholder: t("writeTo", { name: open.detail.guestName.split(" ")[0] ?? "" }),
                  saveNote: t("saveNote"),
                  savingNote: t("savingNote"),
                  template: t("template"),
                  preview: t("previewing"),
                  noteHint: t("noteHint"),
                  missing: t("missing"),
                  switchConfirm: t("switchConfirm"),
                  suggest: t("suggest"),
                  suggesting: t("suggesting"),
                  draftedFromGuide: t("draftedFromGuide"),
                  draftedByModel: t("draftedByModel"),
                  draftReady: t("draftReady"),
                  warnSensitive: t("warnSensitive"),
                  warnUnanswered: t("warnUnanswered"),
                  warnUnrecognised: t("warnUnrecognised"),
                  guideLink: t("draftGuideLink"),
                  draftNote: t("draftNote"),
                }}
              />
            </div>
          </section>
        ) : (
          <section className="hidden rounded-card border border-border bg-surface lg:block">
            <EmptyState title={t("pickThread")} className="p-6" />
          </section>
        )}
      </div>
    </div>
  );
}
