import type React from "react";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { icsFor } from "@pms/core";
import { asSystem } from "@pms/db";
import { guestPortal } from "@pms/jobs";
import { container } from "@/server/container";
import { orgBrand } from "@/server/booking-engine";
import { currentGuest } from "@/server/guest-session";
import { clock, day, daysFrom, money } from "@/lib/format";
import { Brand, SiteFooter, SiteHeader, SiteMain } from "@/components/site";
import { cn, Input, SubmitButton, Textarea } from "@/components/ui";
import { money2 } from "../../(book)/book/labels";
import {
  addExtraAction,
  cancelBookingAction,
  savePreCheckinAction,
  sendGuestMessageAction,
} from "./guest.actions";

/** A white card of the portal grid. */
function Tile({
  title,
  children,
  className,
  ...rest
}: { title?: React.ReactNode; children: React.ReactNode; className?: string } & Omit<
  React.ComponentProps<"section">,
  "title"
>) {
  return (
    <section
      className={cn(
        "flex flex-col gap-2 rounded-2xl border border-border bg-surface p-[18px]",
        className,
      )}
      {...rest}
    >
      {title ? <h2 className="text-base font-bold text-foreground">{title}</h2> : null}
      {children}
    </section>
  );
}

/** "Thu 13 Nov, 15:00" in the property's own time zone and the guest's language, from an instant. */
function localWhen(iso: string, timeZone: string, locale: string): string {
  return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(new Date(iso));
}

const pill =
  "inline-flex h-10 items-center justify-center rounded-full border px-4 text-sm font-semibold transition-colors";

export async function generateMetadata() {
  const t = await getTranslations("guest");
  return { title: t("title") };
}

/**
 * The guest portal (spec 10 §10.6; persona: the guest before and during the stay): a
 * greeting that counts down to arrival, the door code at its window, the guide written
 * for the place, pre-check-in, the bill with extras and cancellation, and the thread
 * with the host. The same page reads as a single column on a phone.
 */
export default async function GuestPortalPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const sp = await searchParams;
  if (sp.token) redirect(`/api/v1/guest/enter?token=${encodeURIComponent(sp.token)}`);
  const [t, tg, locale] = await Promise.all([
    getTranslations("guest"),
    getTranslations("guides"),
    getLocale(),
  ]);
  const guest = await currentGuest();
  if (!guest)
    return (
      <>
        <SiteHeader brand={<Brand name="OTAbridge" />} />
        <SiteMain id="main" className="max-w-[640px] py-12">
          <Tile title={<span className="font-display text-2xl">{t("title")}</span>}>
            <p className="text-sm text-muted" data-testid="guest-link-required">
              {sp.error ? t("linkInvalid") : t("linkRequired")}
            </p>
          </Tile>
        </SiteMain>
      </>
    );
  const c = await container();
  const [p, org] = await Promise.all([
    asSystem(c.db.db, guest.orgId, (tx) => guestPortal(c, tx, guest.orgId, guest.bookingId)),
    orgBrand(guest.orgId),
  ]);
  if (!p) redirect("/guest?error=invalid");
  const cur = p.currency;
  const today = c.clock.today(p.property.timezone).toString();
  const until = daysFrom(today, p.arrivalDate);
  const first = p.guestName.split(" ")[0] || p.guestName;
  const host = org.name;
  const cancelled = p.status === "cancelled";
  const greeting = cancelled
    ? t("greetCancelled", { name: first })
    : until > 1
      ? t("greetDays", { name: first, days: until })
      : until === 1
        ? t("greetTomorrow", { name: first })
        : until === 0
          ? t("greetToday", { name: first })
          : today < p.departureDate
            ? t("greetStaying", { name: first, date: day(p.departureDate, locale) })
            : t("greetAfter", { name: first });
  const address = Object.values(p.property.address).filter(Boolean).join(", ");
  const ics = icsFor({
    uid: p.bookingId,
    propertyTitle: p.property.title,
    address,
    arrivalDate: p.arrivalDate,
    departureDate: p.departureDate,
    checkInTime: clock(p.property.checkInTime),
    checkOutTime: clock(p.property.checkOutTime),
    reference: p.reference,
    portalUrl: `${c.config.NEXT_PUBLIC_APP_URL}/guest`,
  });
  const extrasLines = p.folio.lines.filter((l) => l.kind !== "room");
  const charges =
    (cancelled ? 0 : p.totalMinor) + extrasLines.reduce((a, l) => a + l.amountMinor, 0);
  const paid = charges - p.folio.balanceMinor;
  const city = p.property.address.city;
  return (
    <>
      <SiteHeader brand={<Brand name={org.name} />}>
        <span className="text-[13px] text-muted">
          {t("yourStay")} · <strong className="font-semibold text-foreground">{p.reference}</strong>
        </span>
      </SiteHeader>
      <SiteMain id="main" className="flex max-w-[1088px] flex-col gap-4 pt-6 pb-12 sm:pt-8">
        <div className="flex flex-col gap-4" data-testid="guest-stay" data-status={p.status}>
          {/* the stay, the countdown and the door code */}
          <section className="relative flex flex-wrap items-start justify-between gap-6 overflow-hidden rounded-[20px] bg-foreground p-5 text-white sm:p-8">
            <div className="bridge-rail absolute inset-x-0 top-0 h-[3px]" aria-hidden="true" />
            <div className="flex min-w-0 flex-[1_1_380px] flex-col gap-2">
              <p className="text-xs font-semibold tracking-[0.08em] text-accent-soft uppercase">
                {[p.property.title, city].filter(Boolean).join(" · ")}
              </p>
              <h1 className="font-display text-[26px] leading-tight font-extrabold tracking-[-0.025em] sm:text-[34px]">
                {greeting}
              </h1>
              <p className="text-sm text-rail-foreground sm:text-[15px]">
                {t("stayLine", {
                  arrival: day(p.arrivalDate, locale),
                  in: clock(p.property.checkInTime),
                  departure: day(p.departureDate, locale),
                  out: clock(p.property.checkOutTime),
                  nights: p.nights,
                })}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <a
                  href="#messages"
                  className={cn(pill, "border-white bg-white text-foreground hover:bg-white/90")}
                >
                  {t("messageHost", { host })}
                </a>
                {address ? (
                  <a
                    href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(address)}`}
                    rel="noopener noreferrer"
                    target="_blank"
                    className={cn(pill, "border-white/25 text-white hover:bg-white/10")}
                  >
                    {t("directions")}
                  </a>
                ) : null}
                <a
                  href={`data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`}
                  download={`${p.reference}.ics`}
                  className={cn(pill, "border-white/25 text-white hover:bg-white/10 max-sm:hidden")}
                >
                  {t("addToCalendar")}
                </a>
              </div>
            </div>
            <div
              className="flex w-full flex-col gap-2 rounded-2xl bg-white/[0.06] p-[18px] sm:w-[300px]"
              data-testid="guest-access"
              data-state={p.access.state}
            >
              <span className="text-[13px] text-rail-foreground">{t("accessCode")}</span>
              {p.access.state === "revealed" ? (
                <>
                  <code
                    className="font-display text-[28px] font-bold tracking-[0.2em] text-accent-soft"
                    data-testid="door-code"
                  >
                    {p.access.code}
                  </code>
                  <span className="text-xs text-rail-foreground">
                    {t("accessValid", {
                      from: day(p.access.validFrom, locale),
                      to: day(p.access.validTo, locale),
                    })}
                  </span>
                </>
              ) : (
                <>
                  <span
                    className="font-display text-[26px] tracking-[0.35em] text-accent-soft"
                    aria-hidden="true"
                  >
                    ••••#
                  </span>
                  <span className="text-xs leading-relaxed text-rail-foreground">
                    {p.access.state === "hidden"
                      ? t("accessHidden", {
                          when: localWhen(p.access.opensAt, p.property.timezone, locale),
                        })
                      : t("accessNone")}
                  </span>
                </>
              )}
            </div>
          </section>

          {cancelled ? (
            <Tile className="border-danger/30 bg-danger-soft">
              <p data-testid="guest-cancelled" className="text-sm text-danger-soft-foreground">
                {t("cancelled")}
              </p>
            </Tile>
          ) : null}

          {/* before you arrive, then the guide the manager wrote */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {!cancelled ? (
              <Tile
                title={t("beforeArrive")}
                className={
                  p.preCheckin.completedAt ? undefined : "border-warning/40 bg-warning-soft/60"
                }
              >
                {p.preCheckin.completedAt ? (
                  <p
                    className="text-[13px] text-success-soft-foreground"
                    data-testid="precheckin-done"
                  >
                    {t("preCheckinDone", { time: day(p.preCheckin.completedAt, locale) })}
                  </p>
                ) : (
                  <p className="text-[13px] text-muted">{t("preCheckinHint")}</p>
                )}
                <form action={savePreCheckinAction} className="mt-1 flex flex-col gap-2">
                  <div className="grid grid-cols-2 gap-2">
                    <label className="flex flex-col gap-1 text-xs font-semibold">
                      {t("arrivalTime")}
                      <Input
                        id="arrivalTime"
                        name="arrivalTime"
                        type="time"
                        defaultValue={p.preCheckin.arrivalTime ?? ""}
                        className="h-9"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-xs font-semibold">
                      {t("preferences")}
                      <Input
                        id="preferences"
                        name="preferences"
                        defaultValue={p.preCheckin.preferences ?? ""}
                        className="h-9"
                      />
                    </label>
                  </div>
                  <label className="flex flex-col gap-1 text-xs font-semibold">
                    {t("guests")}
                    <Textarea
                      id="guests"
                      name="guests"
                      rows={2}
                      className="font-normal"
                      defaultValue={p.preCheckin.guests
                        .map((g) => `${g.name} ${g.surname}`)
                        .join("\n")}
                    />
                  </label>
                  <SubmitButton
                    size="sm"
                    className="self-start"
                    testId="save-precheckin"
                    pendingLabel={t("saving")}
                  >
                    {t("savePreCheckin")}
                  </SubmitButton>
                </form>
              </Tile>
            ) : null}
            {p.guide.map((section) => (
              <Tile
                key={section.kind}
                title={section.heading ?? tg(`sections.${section.kind}`)}
                data-testid="guest-guide"
              >
                {Object.entries(section.fields).map(([field, value]) => (
                  <p key={field} className="text-[13px]">
                    <span className="text-muted">{tg(`fields.${section.kind}_${field}`)}:</span>{" "}
                    <code className="rounded bg-background px-1.5 py-0.5">{value}</code>
                  </p>
                ))}
                {section.body ? (
                  <p className="text-[13px] leading-relaxed whitespace-pre-wrap text-muted">
                    {section.body}
                  </p>
                ) : null}
              </Tile>
            ))}
            {p.property.houseManual ? (
              <Tile title={t("houseManual")}>
                <p className="text-[13px] leading-relaxed whitespace-pre-wrap text-muted">
                  {p.property.houseManual}
                </p>
              </Tile>
            ) : null}
            <Tile title={t("checkOutTitle")}>
              <p className="text-[13px] leading-relaxed text-muted">
                {t("checkOutLine", {
                  date: day(p.departureDate, locale),
                  time: clock(p.property.checkOutTime),
                })}
              </p>
            </Tile>
          </div>

          {/* the bill and the conversation */}
          <div className="grid items-start gap-4 lg:grid-cols-2">
            <Tile title={t("yourBooking")} className="p-5">
              <table className="w-full text-sm" data-testid="guest-folio">
                <tbody>
                  <tr>
                    <td className="py-1.5">{t("stayNights", { count: p.nights })}</td>
                    <td className="py-1.5 text-end tabular-nums">
                      {money2(p.totalMinor, cur, locale)}
                    </td>
                  </tr>
                  {extrasLines.map((l, i) => (
                    <tr key={i} data-kind={l.kind}>
                      <td className="py-1.5">{l.description}</td>
                      <td className="py-1.5 text-end tabular-nums">
                        {money2(l.amountMinor, cur, locale)}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t border-border font-bold">
                    <td className="pt-2.5 pb-1.5">{t("total")}</td>
                    <td className="pt-2.5 pb-1.5 text-end tabular-nums">
                      {money2(charges, cur, locale)}
                    </td>
                  </tr>
                  {paid > 0 ? (
                    <tr className="text-success">
                      <td className="py-1.5">{t("paid")}</td>
                      <td className="py-1.5 text-end tabular-nums">{money2(paid, cur, locale)}</td>
                    </tr>
                  ) : null}
                  <tr>
                    <td className="py-1.5">{t("balance")}</td>
                    <td className="py-1.5 text-end tabular-nums" data-testid="guest-balance">
                      {money2(p.folio.balanceMinor, cur, locale)}
                    </td>
                  </tr>
                </tbody>
              </table>
              {p.extras.length > 0 && !cancelled ? (
                <div className="mt-2 border-t border-border pt-3">
                  <h3 className="text-sm font-semibold">{t("extras")}</h3>
                  <ul className="mt-1.5 flex flex-col gap-1.5 text-sm">
                    {p.extras.map((e) => (
                      <li key={e.id} className="flex items-center justify-between gap-3">
                        <span>
                          {e.name} ·{" "}
                          {t("extraPrice", { price: money(e.priceMinor, cur, locale), per: e.per })}
                        </span>
                        <form action={addExtraAction}>
                          <input type="hidden" name="propertyId" value={p.property.id} />
                          <input type="hidden" name="extraId" value={e.id} />
                          <SubmitButton
                            variant="secondary"
                            size="sm"
                            testId="add-extra"
                            aria-label={t("addExtraNamed", { extra: e.name })}
                          >
                            {t("addExtra")}
                          </SubmitButton>
                        </form>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {!cancelled ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {p.cancellation.allowed ? (
                    <details className="group w-full">
                      <summary
                        className={cn(
                          pill,
                          "h-8 cursor-pointer list-none border-border px-3 text-[13px] text-foreground hover:bg-default",
                        )}
                      >
                        {p.cancellation.feeNowMinor > 0
                          ? t("cancelWithFee", {
                              fee: money(p.cancellation.feeNowMinor, cur, locale),
                            })
                          : t("cancelFreeShort")}
                      </summary>
                      <form
                        action={cancelBookingAction}
                        className="mt-2 flex flex-col gap-2 rounded-xl bg-default p-3 text-sm"
                      >
                        <p>
                          {p.cancellation.feeNowMinor > 0
                            ? t("cancelFee", {
                                fee: money(p.cancellation.feeNowMinor, cur, locale),
                              })
                            : t("cancelFree")}
                        </p>
                        <SubmitButton
                          variant="danger"
                          size="sm"
                          className="self-start"
                          testId="cancel-booking"
                          pendingLabel={t("cancelling")}
                        >
                          {t("cancelConfirm")}
                        </SubmitButton>
                      </form>
                    </details>
                  ) : (
                    <p className="text-[13px] text-muted">{t("cancelNotAllowed")}</p>
                  )}
                </div>
              ) : null}
            </Tile>
            <Tile title={t("messagesTitle")} className="p-5" id="messages">
              <ul className="flex flex-col gap-2 text-sm" data-testid="guest-messages">
                {p.messages.length === 0 ? (
                  <li className="text-[13px] text-muted">{t("noMessages", { host })}</li>
                ) : null}
                {p.messages.map((m, i) => (
                  <li
                    key={i}
                    data-direction={m.direction}
                    className={cn(
                      "max-w-[85%] rounded-2xl px-3 py-2",
                      m.direction === "inbound"
                        ? "self-end bg-accent-soft text-accent-soft-foreground"
                        : "self-start bg-default",
                    )}
                  >
                    <p className="whitespace-pre-wrap">{m.body}</p>
                    <span className="mt-0.5 block text-[11px] text-muted">
                      {m.direction === "inbound" ? t("you") : host} · {day(m.sentAt, locale)}
                    </span>
                  </li>
                ))}
              </ul>
              <form action={sendGuestMessageAction} className="mt-2 flex gap-2">
                <Input
                  name="body"
                  placeholder={t("messagePlaceholder")}
                  required
                  aria-label={t("messages")}
                  className="rounded-full"
                />
                <SubmitButton testId="send-guest-message" pendingLabel={t("sending")}>
                  {t("send")}
                </SubmitButton>
              </form>
            </Tile>
          </div>
        </div>
      </SiteMain>
      <SiteFooter
        left={<span>© {org.name}</span>}
        right={
          <span>
            {t("poweredBy")} <strong className="font-semibold text-accent">OTAbridge</strong>
          </span>
        }
      />
    </>
  );
}
