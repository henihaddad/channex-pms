import { getTranslations } from "next-intl/server";
import { Button, Card, Chip, PageTitle, Select } from "@/components/ui";
import { guard } from "@/server/guard";
import { loadUnmappedQueue, resolveUnmappedAction } from "../reservations.actions";

/** Mapping resolution queue (spec 08 §8.5): OTA codes, ranked suggestions, one-click resolve. */
export default async function UnmappedPage() {
  const t = await getTranslations("reservations");
  const queue = await guard(() => loadUnmappedQueue());
  return (
    <div className="space-y-4">
      <PageTitle>{t("unmappedQueue")}</PageTitle>
      <Card>
        {queue.length === 0 ? <p className="text-sm text-muted">{t("queueEmpty")}</p> : null}
        {queue.map((b) => (
          <div
            key={b.id}
            className="border-t border-border py-2 text-sm"
            data-testid="unmapped-row"
          >
            <p className="font-medium">
              {b.propertyTitle} · {b.otaName} {b.otaReservationCode} · {b.arrivalDate} →{" "}
              {b.departureDate}{" "}
              <Chip color="danger" size="sm">
                {b.mappingState}
              </Chip>
            </p>
            <p className="text-xs text-muted">
              OTA codes: room {b.rooms[0]?.otaRoomCode ?? "?"} · rate{" "}
              {b.rooms[0]?.otaRateCode ?? "?"}
            </p>
            <form action={resolveUnmappedAction} className="mt-1 flex items-center gap-2">
              <input type="hidden" name="bookingId" value={b.id} />
              <input type="hidden" name="propertyId" value={b.propertyId} />
              <Select
                name="pick"
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
              <Button type="submit" data-testid="resolve" size="sm">
                {t("resolve")}
              </Button>
              <span className="text-xs text-muted">{t("thenFixMapping")}</span>
            </form>
          </div>
        ))}
      </Card>
    </div>
  );
}
