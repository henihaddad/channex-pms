import { getLocale, getTranslations } from "next-intl/server";
import {
  Card,
  Chip,
  EmptyState,
  LinkButton,
  PageHeader,
  Select,
  SubmitButton,
} from "@/components/ui";
import { stay } from "@/lib/format";
import { channelLook } from "@/lib/channel";
import { guard } from "@/server/guard";
import { loadUnmappedQueue, resolveUnmappedAction } from "../reservations.actions";

export async function generateMetadata() {
  const t = await getTranslations("reservations");
  return { title: t("unmappedQueue") };
}

/**
 * Reservations that need a room (spec 08 §8.5): the channel's room and rate codes, ranked
 * suggestions, one click to give the stay a room; then match rooms so it does not happen again.
 */
export default async function UnmappedPage() {
  const [t, locale] = await Promise.all([getTranslations("reservations"), getLocale()]);
  const queue = await guard(() => loadUnmappedQueue());
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t("unmappedQueue")} description={t("unmappedLead")} />
      <Card>
        {queue.length === 0 ? (
          <EmptyState
            title={t("queueEmpty")}
            action={
              <LinkButton href="/reservations" variant="secondary" size="sm">
                {t("backToReservations")}
              </LinkButton>
            }
          />
        ) : null}
        {queue.map((b) => (
          <div
            key={b.id}
            className="border-t border-border py-3 text-sm first:border-t-0 first:pt-0"
            data-testid="unmapped-row"
          >
            <p className="flex flex-wrap items-center gap-2 font-medium">
              {b.propertyTitle} · {channelLook(b.otaName).label} {b.otaReservationCode} ·{" "}
              {stay(b.arrivalDate, b.departureDate, locale)}
              <Chip color="warning" size="sm">
                {t("stayStatus.needs_room_short")}
              </Chip>
            </p>
            <p className="text-xs text-muted">
              {t("channelCodes", {
                room: b.rooms[0]?.otaRoomCode ?? "?",
                rate: b.rooms[0]?.otaRateCode ?? "?",
              })}
            </p>
            <form action={resolveUnmappedAction} className="mt-2 flex flex-wrap items-end gap-2">
              <input type="hidden" name="bookingId" value={b.id} />
              <input type="hidden" name="propertyId" value={b.propertyId} />
              <Select
                name="pick"
                id={`pick-${b.id}`}
                label={t("roomAndRate")}
                className="max-w-md"
                defaultValue={
                  b.suggestions[0]
                    ? `${b.suggestions[0].roomTypeId}|${b.suggestions[0].ratePlanId}`
                    : ""
                }
                size="sm"
              >
                {b.suggestions.map((s) => (
                  <option key={s.ratePlanId} value={`${s.roomTypeId}|${s.ratePlanId}`}>
                    {s.roomTypeTitle} / {s.ratePlanTitle}
                  </option>
                ))}
              </Select>
              <input type="hidden" name="roomTypeId" value={b.suggestions[0]?.roomTypeId ?? ""} />
              <input type="hidden" name="ratePlanId" value={b.suggestions[0]?.ratePlanId ?? ""} />
              <SubmitButton testId="resolve" size="sm">
                {t("resolve")}
              </SubmitButton>
              <span className="text-xs text-muted">{t("thenFixMapping")}</span>
            </form>
          </div>
        ))}
      </Card>
    </div>
  );
}
