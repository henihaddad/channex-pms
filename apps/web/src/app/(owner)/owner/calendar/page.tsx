import { getTranslations } from "next-intl/server";
import { Button, Card, Field, PageTitle, Select } from "@/components/ui";
import { guard } from "@/server/guard";
import { loadPortalCalendar, ownerStayAction } from "../portal.actions";

/** Calendar (PORT-1): bookings with first name, dates and channel only; owner stays through the ARI pipeline (PORT-3). */
/** The next 90 days; computed outside render so the component stays pure. */
const window90 = (): { from: string; to: string } => {
  const start = new Date();
  const end = new Date(start.getTime() + 90 * 86_400_000);
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
};

export default async function OwnerCalendar() {
  const t = await getTranslations("owner");
  const { from, to } = window90();
  const v = await guard(() => loadPortalCalendar({ from, to }));
  return (
    <div className="space-y-4">
      <PageTitle>{t("nav.calendar")}</PageTitle>
      <p className="text-sm text-muted">{t("calendarHint")}</p>
      <Card className="text-sm">
        <p className="font-medium">{t("bookings")}</p>
        {v.bookings.length === 0 ? <p className="text-xs text-muted">{t("noBookings")}</p> : null}
        {v.bookings.map((b) => (
          <p key={b.id} className="border-t border-line py-1 text-xs" data-testid="owner-booking">
            {b.arrivalDate} → {b.departureDate} · {b.guestFirstName} · {b.channel} ·{" "}
            {b.propertyTitle} {b.unit ? `· ${b.unit}` : ""} · {b.status}
          </p>
        ))}
        <p className="mt-2 font-medium">{t("blocks")}</p>
        {v.blocks.map((b) => (
          <p
            key={b.id}
            className="border-t border-line py-1 text-xs"
            data-testid="owner-block"
            data-reason={b.reason}
          >
            {b.dateFrom} → {b.dateTo} · {b.reason.replace("_", " ")} · {b.propertyTitle}
          </p>
        ))}
      </Card>
      <Card>
        <form
          action={ownerStayAction}
          className="grid grid-cols-2 gap-2 text-sm"
          data-testid="owner-stay-form"
        >
          <p className="col-span-2 font-medium">{t("ownerStay")}</p>
          <div className="col-span-2">
            <label htmlFor="propertyId" className="text-sm font-medium">
              {t("property")}
            </label>
            <Select id="propertyId" name="propertyId">
              {v.properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </Select>
          </div>
          <Field label={t("from")} name="dateFrom" type="date" />
          <Field label={t("to")} name="dateTo" type="date" />
          <div className="col-span-2">
            <Field label={t("note")} name="note" required={false} />
          </div>
          <div className="col-span-2">
            <Button type="submit" data-testid="block-owner-stay">
              {t("block")}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
