import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { DataTable, PageHeader } from "@/components/ui";
import { guard } from "@/server/guard";
import { loadInventory } from "../properties.actions";

/** Every room type and its units across the portfolio (spec 03 §3.2a, tab "Rooms & units"). */
export default async function RoomsPage() {
  const t = await getTranslations("properties");
  const inv = await guard(() => loadInventory());
  return (
    <div className="space-y-5">
      <PageHeader title={t("title")} titleOnPhone={false} description={t("tabs.roomsLead")} />
      <DataTable
        testId="rooms-table"
        columns={[t("cols.property"), t("cols.roomType"), t("cols.units"), t("cols.sleeps")]}
        empty={t("tabs.roomsEmpty")}
        rows={inv.roomTypes.map((rt) => [
          <Link
            key="p"
            href={`/properties/${rt.propertyId}`}
            className="font-semibold text-foreground hover:underline"
          >
            {rt.propertyTitle}
          </Link>,
          rt.isSystemManaged && rt.propertyKind === "single_unit" ? (
            <span key="r" className="text-muted">
              {t("wholeProperty")}
            </span>
          ) : (
            rt.title
          ),
          <span key="u">
            {rt.countOfRooms}
            {rt.units.length > 0 && !(rt.isSystemManaged && rt.propertyKind === "single_unit") ? (
              <span className="block text-xs text-muted">{rt.units.join(", ")}</span>
            ) : null}
          </span>,
          t("sleeps", { count: rt.maxOccupancy }),
        ])}
      />
    </div>
  );
}
