import { getLocale, getTranslations } from "next-intl/server";
import type { BookingRequestRow } from "@pms/db";
import { Chip, Input, Select, SubmitButton } from "@/components/ui";
import { clock } from "@/lib/format";
import { resolveRequestAction } from "./requests.actions";

/** "Tue 24 Nov, 14:00" in the given time zone (the property's when known; spec 08). */
const fmt = (iso: string, timeZone: string, locale: string) =>
  `${new Intl.DateTimeFormat(locale === "en" ? "en-GB" : locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone,
  }).format(new Date(iso))}, ${clock(iso, timeZone, locale)}`;
const STATE_COLOR: Record<string, "default" | "accent" | "success" | "warning" | "danger"> = {
  open: "warning",
  deciding: "accent",
  accepted: "success",
  preapproved: "success",
  special_offer: "success",
  declined: "danger",
  cancelled: "danger",
  expired: "default",
  resolved_elsewhere: "default",
};

/**
 * One Airbnb request (spec 09 §9.8): the stay as the guest asked for it, the OTA's deadline,
 * and the answers Airbnb accepts for this kind. Shown in the requests queue and on the thread.
 */
export async function RequestCard({
  r,
  compact = false,
  timeZone,
}: {
  r: BookingRequestRow;
  compact?: boolean;
  /** The property's time zone; without it the deadline reads in UTC and says so. */
  timeZone?: string;
}) {
  const [t, locale] = await Promise.all([getTranslations("inbox"), getLocale()]);
  const d = r.details;
  const hidden = (
    <>
      <input type="hidden" name="requestId" value={r.id} />
      <input type="hidden" name="propertyId" value={r.propertyId} />
    </>
  );
  return (
    <div
      className="rounded-2xl bg-accent-soft px-3 py-2 text-xs text-accent-soft-foreground"
      data-testid="request-card"
      data-state={r.state}
      data-kind={r.kind}
    >
      <p className="flex flex-wrap items-center gap-2 font-semibold">
        {t(`inquiryKinds.${r.kind}`)}
        <Chip size="sm" color={STATE_COLOR[r.state] ?? "default"} data-testid="request-state">
          {t(`requestStates.${r.state}`)}
        </Chip>
        {!compact ? <span className="font-normal text-muted">· {r.propertyTitle}</span> : null}
      </p>
      <p>
        {r.guestName ? `${r.guestName} · ` : ""}
        {d.checkIn ?? "?"} → {d.checkOut ?? "?"}
        {d.nights ? ` · ${t("nightsCount", { n: d.nights })}` : ""} ·{" "}
        {d.guests ? t("guestsCount", { n: d.guests }) : `? ${t("guests")}`}
        {d.payoutText ? ` · ${d.payoutText}` : ""}
        {d.listingName ? ` · ${d.listingName}` : ""}
      </p>
      {r.state === "open" && r.respondBy ? (
        <p className="text-danger">
          {t("respondByAt", {
            when: timeZone
              ? fmt(r.respondBy, timeZone, locale)
              : `${fmt(r.respondBy, "UTC", locale)} UTC`,
          })}
        </p>
      ) : null}
      {r.state === "open" ? (
        <div className="mt-2 flex flex-wrap items-end gap-2">
          {r.kind === "inquiry" ? (
            <>
              <form action={resolveRequestAction} className="flex items-center gap-1">
                {hidden}
                <input type="hidden" name="decision" value="preapproval" />
                <SubmitButton size="sm" testId="request-preapprove">
                  {t("preApprove")}
                </SubmitButton>
              </form>
              <form action={resolveRequestAction} className="flex items-center gap-1">
                {hidden}
                <input type="hidden" name="decision" value="special_offer" />
                <Input
                  name="totalPrice"
                  type="number"
                  min={1}
                  step="1"
                  required
                  placeholder={t("specialOfferTotal", { currency: d.currency ?? "" })}
                  aria-label={t("specialOfferTotal", { currency: d.currency ?? "" })}
                  className="w-36"
                />
                <SubmitButton size="sm" variant="secondary" testId="request-special-offer">
                  {t("sendSpecialOffer")}
                </SubmitButton>
              </form>
            </>
          ) : r.kind === "reservation_request" ? (
            <>
              <form action={resolveRequestAction}>
                {hidden}
                <input type="hidden" name="decision" value="accept" />
                <SubmitButton size="sm" testId="request-accept">
                  {t("acceptRequest")}
                </SubmitButton>
              </form>
              <form action={resolveRequestAction} className="flex items-center gap-1">
                {hidden}
                <input type="hidden" name="decision" value="decline" />
                <Select
                  name="reason"
                  size="sm"
                  defaultValue="dates_not_available"
                  aria-label={t("declineReason")}
                >
                  {[
                    "dates_not_available",
                    "not_a_good_fit",
                    "waiting_for_better_reservation",
                    "not_comfortable",
                  ].map((k) => (
                    <option key={k} value={k}>
                      {t(`declineReasons.${k}`)}
                    </option>
                  ))}
                </Select>
                <Input
                  name="messageToGuest"
                  placeholder={t("messageToGuest")}
                  aria-label={t("messageToGuest")}
                  className="w-48"
                />
                <SubmitButton size="sm" variant="danger" testId="request-decline">
                  {t("declineRequest")}
                </SubmitButton>
              </form>
            </>
          ) : (
            <>
              {(["accept", "decline", "cancel"] as const).map((k) => (
                <form key={k} action={resolveRequestAction}>
                  {hidden}
                  <input type="hidden" name="decision" value={k} />
                  <SubmitButton
                    size="sm"
                    variant={k === "accept" ? "primary" : k === "decline" ? "danger" : "ghost"}
                    testId={`request-${k}`}
                  >
                    {t(`alterationAnswers.${k}`)}
                  </SubmitButton>
                </form>
              ))}
            </>
          )}
        </div>
      ) : r.state === "deciding" ? (
        <p className="text-muted">{t("decisionOnItsWay")}</p>
      ) : null}
    </div>
  );
}
