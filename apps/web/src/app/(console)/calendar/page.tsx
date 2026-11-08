import { getTranslations } from "next-intl/server";
import { rawRows, sql } from "@pms/db";
import { Card, EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { guard } from "@/server/guard";
import { withPermission } from "@/server/with-permission";
import { listGroups } from "../properties/properties.actions";
import { CalendarView, type CalendarMode } from "@/components/calendar-view";
import { CALENDAR_LABEL_KEYS, type CalendarLabels } from "@/components/calendar-labels";
import { YearView } from "./year-view";

/** The listings the switchers offer, and the pricing engine's open proposals (the price tips). */
const loadCalendarContext = withPermission<
  [],
  {
    properties: Array<{ id: string; title: string }>;
    tips: Array<{ propertyId: string | null; title: string; link: string }>;
  }
>("ari:read", { scope: "organization", audit: false }, async (ctx) => ({
  properties: await rawRows<{ id: string; title: string }>(
    ctx.tx,
    sql`select id, title from property where archived_at is null and state <> 'archived' order by title, id`,
  ),
  tips: await rawRows<{ propertyId: string | null; title: string; link: string }>(
    ctx.tx,
    sql`select property_id as "propertyId", title, link from alert where type = 'rate_import_pending' and state = 'open' order by created_at desc limit 20`,
  ),
}));

const VIEWS: readonly CalendarMode[] = ["strip", "month", "year", "day"];
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The calendar (spec 06 §6.2): strip, month and year views of the same nights. Older links
 * say `property` and `date` (low-occupancy alerts); they open the same nights as
 * `propertyId` and `from`.
 */
export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const t = await getTranslations("calendar");
  const [groups, ctx] = await Promise.all([
    guard(() => listGroups()),
    guard(() => loadCalendarContext()),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const labels = Object.fromEntries(CALENDAR_LABEL_KEYS.map((k) => [k, t(k)])) as CalendarLabels;
  const propertyId = sp.propertyId ?? sp.property;
  const fromParam = sp.from ?? sp.date;
  const from = fromParam && ISO.test(fromParam) ? fromParam : today;
  const view = VIEWS.includes(sp.view as CalendarMode) ? (sp.view as CalendarMode) : undefined;
  const days = [14, 30, 60, 90].includes(Number(sp.days)) ? Number(sp.days) : 14;

  if (ctx.properties.length === 0)
    return (
      <div className="space-y-5">
        <PageHeader title={t("title")} titleOnPhone={false} />
        <Card>
          <EmptyState
            data-testid="calendar-empty"
            title={t("emptyTitle")}
            description={t("emptyBody")}
            action={
              <LinkButton href="/properties/new" variant="primary">
                {t("addProperty")}
              </LinkButton>
            }
            preview={<EmptyGridPreview />}
          />
        </Card>
      </div>
    );

  return (
    <div className="space-y-5">
      <PageHeader title={t("title")} titleOnPhone={false} />
      {view === "year" ? (
        <YearView
          propertyId={
            ctx.properties.some((p) => p.id === propertyId) ? propertyId! : ctx.properties[0]!.id
          }
          properties={ctx.properties}
          from={sp.from && ISO.test(sp.from) ? sp.from : today}
          tipsCount={ctx.tips.length}
          labels={labels}
        />
      ) : (
        <CalendarView
          view={view}
          start={from}
          days={days}
          propertyId={propertyId}
          groups={groups}
          properties={ctx.properties}
          tips={ctx.tips}
          labels={labels}
        />
      )}
    </div>
  );
}

/** The empty state's picture: a few rows of nights, some booked, some selected. */
function EmptyGridPreview() {
  const rows = ["........", "....sss.", "..bb..sss"];
  return (
    <div className="flex flex-col gap-1.5">
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[2fr_repeat(7,1fr)] gap-1.5">
          <span className="h-6 rounded-md bg-default" />
          {Array.from({ length: 7 }, (_, j) => {
            const c = r[j + 1];
            return (
              <span
                key={j}
                className={`h-6 rounded-md ${c === "b" ? "bg-accent" : c === "s" ? "bg-teal-200" : "bg-surface"}`}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}
