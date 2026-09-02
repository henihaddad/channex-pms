import { getTranslations } from "next-intl/server";
import { Button, Card, PageTitle, Select } from "@/components/ui";
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
        {queue.length === 0 ? <p className="text-sm text-slate-500">{t("queueEmpty")}</p> : null}
        {queue.map((b) => (
          <div
            key={b.id}
            className="border-t border-slate-100 py-2 text-sm"
            data-testid="unmapped-row"
          >
            <p className="font-medium">
              {b.propertyTitle} · {b.otaName} {b.otaReservationCode} · {b.arrivalDate} →{" "}
              {b.departureDate}{" "}
              <span className="rounded bg-rose-100 px-1.5 text-[10px] text-rose-800">
                {b.mappingState}
              </span>
            </p>
            <p className="text-xs text-slate-500">
              OTA codes: room {b.rooms[0]?.otaRoomCode ?? "?"} · rate{" "}
              {b.rooms[0]?.otaRateCode ?? "?"}
            </p>
            <form action={resolveUnmappedAction} className="mt-1 flex items-center gap-2">
              <input type="hidden" name="bookingId" value={b.id} />
              <input type="hidden" name="propertyId" value={b.propertyId} />
              <Select
                name="pick"
                className="h-8 max-w-md"
                defaultValue={
                  b.suggestions[0]
                    ? `${b.suggestions[0].roomTypeId}|${b.suggestions[0].ratePlanId}`
                    : ""
                }
              >
                {b.suggestions.map((s) => (
                  <option key={s.ratePlanId} value={`${s.roomTypeId}|${s.ratePlanId}`}>
                    {s.roomTypeTitle} / {s.ratePlanTitle}
                  </option>
                ))}
              </Select>
              <input type="hidden" name="roomTypeId" value={b.suggestions[0]?.roomTypeId ?? ""} />
              <input type="hidden" name="ratePlanId" value={b.suggestions[0]?.ratePlanId ?? ""} />
              <Button type="submit" className="h-8" data-testid="resolve">
                {t("resolve")}
              </Button>
              <span className="text-xs text-slate-500">{t("thenFixMapping")}</span>
            </form>
          </div>
        ))}
      </Card>
    </div>
  );
}
