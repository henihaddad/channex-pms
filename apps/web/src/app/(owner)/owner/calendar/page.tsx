import { getLocale, getTranslations } from "next-intl/server";
import { Card, PageTitle } from "@/components/ui";
import { guard } from "@/server/guard";
import { channelLabel, dayMonth } from "@/lib/format";
import { loadPortalCalendar } from "../portal.actions";
import { OwnerStayForm } from "../owner-stay-form";

export async function generateMetadata() {
  const t = await getTranslations("owner");
  return { title: t("nav.calendar") };
}

/** The next 90 days; computed outside render so the component stays pure. */
const window90 = (): { from: string; to: string } => {
  const start = new Date();
  const end = new Date(start.getTime() + 90 * 86_400_000);
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
};

/**
 * Calendar (PORT-1; persona: the owner): bookings with first name, dates and channel only;
 * owner stays go through the ARI pipeline (PORT-3). The stay form asks for the first and the
 * last night, the way an owner thinks of a stay; the block ends the morning after.
 */
export default async function OwnerCalendar() {
  const [t, locale] = await Promise.all([getTranslations("owner"), getLocale()]);
  const { from, to } = window90();
  const v = await guard(() => loadPortalCalendar({ from, to }));
  const range = (a: string, b: string) => `${dayMonth(a, locale)} → ${dayMonth(b, locale)}`;
  return (
    <div className="space-y-4">
      <PageTitle>{t("nav.calendar")}</PageTitle>
      <p className="text-sm text-muted">{t("calendarHint")}</p>
      <Card className="text-sm" title={t("bookings")}>
        {v.bookings.length === 0 ? <p className="text-xs text-muted">{t("noBookings")}</p> : null}
        {v.bookings.map((b) => (
          <p key={b.id} className="border-t border-border py-1 text-xs" data-testid="owner-booking">
            {range(b.arrivalDate, b.departureDate)} · {b.guestFirstName} ·{" "}
            {channelLabel(b.channel, t("direct"))} · {b.propertyTitle} {b.unit ? `· ${b.unit}` : ""}
            {b.status === "cancelled" ? ` · ${t("cancelled")}` : ""}
          </p>
        ))}
        <p className="mt-2 font-medium">{t("blocks")}</p>
        {v.blocks.map((b) => (
          <p
            key={b.id}
            className="border-t border-border py-1 text-xs"
            data-testid="owner-block"
            data-reason={b.reason}
          >
            {range(b.dateFrom, b.dateTo)} ·{" "}
            {b.reason === "owner_stay" ? t("ownerStayReason") : b.reason.replace(/_/g, " ")} ·{" "}
            {b.propertyTitle}
          </p>
        ))}
      </Card>
      <Card>
        <OwnerStayForm
          withNote
          properties={v.properties}
          min={from}
          labels={{
            title: t("ownerStay"),
            property: t("property"),
            firstNight: t("firstNight"),
            lastNight: t("lastNight"),
            note: t("note"),
            block: t("block"),
            blocking: t("blocking"),
          }}
        />
      </Card>
    </div>
  );
}
