import { getTranslations } from "next-intl/server";
import { PageTitle } from "@/components/ui";
import { guard } from "@/server/guard";
import { listGroups } from "../properties/properties.actions";
import { CalendarGrid } from "@/components/calendar-grid";

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const t = await getTranslations("calendar");
  const groups = await guard(() => listGroups());
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="space-y-4">
      <PageTitle>{t("title")}</PageTitle>
      <CalendarGrid
        start={sp.from ?? today}
        days={Number(sp.days ?? 30)}
        propertyId={sp.propertyId}
        groups={groups}
      />
    </div>
  );
}
