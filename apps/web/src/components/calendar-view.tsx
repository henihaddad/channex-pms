"use client";

import { useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import type { CalendarLabels } from "@/components/calendar-labels";
import { plural } from "@/components/calendar-shared";
import { useLocale } from "next-intl";

/** A placeholder at the view's real height, so nothing below it moves when the view arrives. */
function StripSkeleton() {
  return (
    <div aria-hidden="true" className="space-y-4">
      <div className="h-[34px] w-full max-w-[640px] animate-pulse rounded-full bg-default" />
      <div className="h-[max(320px,72vh)] max-h-[640px] animate-pulse rounded-card border border-border bg-surface" />
    </div>
  );
}
function MonthSkeleton() {
  return (
    <div aria-hidden="true" className="flex w-full max-w-[560px] flex-col gap-3">
      <div className="h-9 animate-pulse rounded-full bg-default" />
      <div className="aspect-[7/6] w-full animate-pulse rounded-card bg-default" />
    </div>
  );
}

// Each view is its own chunk: a phone never downloads the strip, a desktop never the month.
const CalendarGrid = dynamic(
  () => import("@/components/calendar-grid").then((m) => m.CalendarGrid),
  {
    loading: StripSkeleton,
  },
);
const CalendarMonth = dynamic(
  () => import("@/components/calendar-month").then((m) => m.CalendarMonth),
  { loading: MonthSkeleton },
);
const CalendarDayView = dynamic(
  () => import("@/components/calendar-day-view").then((m) => m.CalendarDayView),
  { loading: MonthSkeleton },
);

const QUERY = "(min-width: 1024px)";
const subscribeToWidth = (onChange: () => void): (() => void) => {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
};
const isDesktop = (): boolean => window.matchMedia(QUERY).matches;
/** The server cannot know the viewport: until the browser says, no view loads its nights. */
const unknownWidth = (): null => null;

export type CalendarMode = "strip" | "month" | "year" | "day";

/** Strip / Month / Year (design): one segmented control, each a link so the view survives a reload. */
export function CalendarViewSwitch({
  active,
  propertyId,
  labels: L,
}: {
  active: CalendarMode;
  propertyId?: string;
  labels: Pick<CalendarLabels, "viewStrip" | "viewMonth" | "viewYear" | "views">;
}) {
  const q = propertyId ? `&propertyId=${propertyId}` : "";
  return (
    <nav
      aria-label={L.views}
      className="inline-flex overflow-hidden rounded-full border border-border bg-surface text-[13px]"
    >
      {(
        [
          ["strip", L.viewStrip],
          ["month", L.viewMonth],
          ["year", L.viewYear],
        ] as const
      ).map(([m, label]) => (
        <Link
          key={m}
          href={`/calendar?view=${m}${q}`}
          aria-current={active === m ? "page" : undefined}
          className={`px-[13px] py-[7px] font-semibold ${active === m ? "bg-foreground text-background" : "text-muted hover:text-foreground"}`}
          data-testid={`view-${m}`}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}

/**
 * Which calendar you get. A desktop opens the strip of every listing; a phone opens one
 * listing's month, because a 400-cell strip does not work in a hand (CAL-9). Any view is
 * one press away on any screen, and the one-night close-out stays reachable from the month.
 * With no view in the link, the page shows a placeholder shaped like the view the device's
 * user agent suggests until the browser reports its width; only then does a view mount and
 * load its nights, so neither a phone nor a desktop fetches a view it will not show.
 */
export function CalendarView({
  view,
  start,
  days,
  propertyId,
  groups,
  properties,
  tips,
  phone = false,
  labels: L,
}: {
  view?: CalendarMode;
  start: string;
  days: number;
  propertyId?: string;
  groups: Array<{ id: string; name: string }>;
  properties: Array<{ id: string; title: string }>;
  tips: Array<{ propertyId: string | null; title: string; link: string }>;
  /** What the request's user agent suggests, for the placeholder's shape only. */
  phone?: boolean;
  labels: CalendarLabels;
}) {
  const locale = useLocale();
  const desktop = useSyncExternalStore<boolean | null>(subscribeToWidth, isDesktop, unknownWidth);
  if (!view && desktop === null) return phone ? <MonthSkeleton /> : <StripSkeleton />;
  const mode: CalendarMode = view ?? (desktop ? "strip" : "month");
  const yearHref = `/calendar?view=year${propertyId ? `&propertyId=${propertyId}` : ""}`;
  const viewSwitch = <CalendarViewSwitch active={mode} propertyId={propertyId} labels={L} />;
  if (mode === "strip")
    return (
      <CalendarGrid
        start={start}
        days={days}
        propertyId={propertyId}
        groups={groups}
        properties={properties}
        tips={tips}
        viewSwitch={viewSwitch}
        labels={L}
      />
    );
  return (
    <div className="space-y-3">
      <div className="hidden lg:flex">{viewSwitch}</div>
      <div className="flex items-center justify-end gap-2 lg:hidden">
        <Link
          href="/calendar?view=strip"
          className={`inline-flex h-[34px] items-center rounded-full border px-3 text-[13px] font-semibold ${tips.length > 0 ? "border-amber-300 bg-amber-50 text-warning-soft-foreground" : "border-border bg-surface"}`}
        >
          {tips.length > 0 ? plural(L.tipsShort, { n: tips.length }, locale) : L.priceTips}
        </Link>
        <Link
          href={yearHref}
          className="inline-flex h-[34px] items-center rounded-full border border-border bg-surface px-3 text-[13px] font-semibold"
        >
          {L.viewYear}
        </Link>
      </div>
      {mode === "day" ? (
        <DayWrapper start={start} propertyId={propertyId} groups={groups} labels={L} />
      ) : (
        <CalendarMonth
          properties={properties}
          propertyId={propertyId}
          start={start}
          tipsCount={tips.length}
          labels={L}
        />
      )}
    </div>
  );
}

function DayWrapper({
  start,
  propertyId,
  groups,
  labels,
}: {
  start: string;
  propertyId?: string;
  groups: Array<{ id: string; name: string }>;
  labels: CalendarLabels;
}) {
  const [date, setDate] = useState(start);
  return (
    <CalendarDayView
      date={date}
      propertyId={propertyId}
      groups={groups}
      labels={labels}
      onDateChange={setDate}
    />
  );
}
