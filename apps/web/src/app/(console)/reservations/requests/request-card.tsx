import { getTranslations } from "next-intl/server";
import type { BookingRequestRow } from "@pms/db";
import { Button, Chip, Input, Select } from "@/components/ui";
import { resolveRequestAction } from "./requests.actions";

const fmt = (iso: string | null | undefined) => (iso ? iso.slice(0, 16).replace("T", " ") : "");
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
}: {
  r: BookingRequestRow;
  compact?: boolean;
}) {
  const t = await getTranslations("inbox");
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
        {d.nights ? ` · ${d.nights} ${t("nights")}` : ""} · {d.guests ?? "?"} {t("guests")}
        {d.payoutText ? ` · ${d.payoutText}` : ""}
        {d.listingName ? ` · ${d.listingName}` : ""}
      </p>
      {r.state === "open" && r.respondBy ? (
        <p className="text-danger">
          {t("respondBy")} {fmt(r.respondBy)}
        </p>
      ) : null}
      {r.state === "open" ? (
        <div className="mt-2 flex flex-wrap items-end gap-2">
          {r.kind === "inquiry" ? (
            <>
              <form action={resolveRequestAction} className="flex items-center gap-1">
                {hidden}
                <input type="hidden" name="decision" value="preapproval" />
                <Button type="submit" size="sm" data-testid="request-preapprove">
                  {t("preApprove")}
                </Button>
              </form>
              <form action={resolveRequestAction} className="flex items-center gap-1">
                {hidden}
                <input type="hidden" name="decision" value="special_offer" />
                <Input
                  name="totalPrice"
                  type="number"
                  min={1}
                  step="0.01"
                  required
                  placeholder={t("specialOfferTotal", { currency: d.currency ?? "" })}
                  className="w-36"
                />
                <Button
                  type="submit"
                  size="sm"
                  variant="secondary"
                  data-testid="request-special-offer"
                >
                  {t("sendSpecialOffer")}
                </Button>
              </form>
            </>
          ) : r.kind === "reservation_request" ? (
            <>
              <form action={resolveRequestAction}>
                {hidden}
                <input type="hidden" name="decision" value="accept" />
                <Button type="submit" size="sm" data-testid="request-accept">
                  {t("acceptRequest")}
                </Button>
              </form>
              <form action={resolveRequestAction} className="flex items-center gap-1">
                {hidden}
                <input type="hidden" name="decision" value="decline" />
                <Select name="reason" size="sm" defaultValue="dates_not_available">
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
                <Input name="messageToGuest" placeholder={t("messageToGuest")} className="w-48" />
                <Button type="submit" size="sm" variant="danger" data-testid="request-decline">
                  {t("declineRequest")}
                </Button>
              </form>
            </>
          ) : (
            <>
              {(["accept", "decline", "cancel"] as const).map((k) => (
                <form key={k} action={resolveRequestAction}>
                  {hidden}
                  <input type="hidden" name="decision" value={k} />
                  <Button
                    type="submit"
                    size="sm"
                    variant={k === "accept" ? "primary" : k === "decline" ? "danger" : "ghost"}
                    data-testid={`request-${k}`}
                  >
                    {t(`alterationAnswers.${k}`)}
                  </Button>
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
