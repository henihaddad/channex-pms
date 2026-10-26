"use client";

import { useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui";
import { CalendarGrid } from "@/components/calendar-grid";
import { CalendarDayView } from "@/components/calendar-day-view";
import type { CalendarLabels } from "@/components/calendar-labels";

const QUERY = "(min-width: 1024px)";
const subscribeToWidth = (onChange: () => void): (() => void) => {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
};
const isDesktop = (): boolean => window.matchMedia(QUERY).matches;
/** The server cannot know the viewport, and a phone is the one that must not get the grid. */
const serverIsPhone = (): boolean => false;

/**
 * Which calendar you get. A phone gets the day view, a desktop gets the grid, and either
 * can switch — "close out tonight" is useful at a desk too (CAL-9). The choice is made
 * once on mount so only one of the two ever fetches.
 */
export function CalendarView({
  start,
  days,
  propertyId,
  groups,
  labels: L,
}: {
  start: string;
  days: number;
  propertyId?: string;
  groups: Array<{ id: string; name: string }>;
  labels: CalendarLabels;
}) {
  // Read the viewport the way React reads any external system, so neither view mounts
  // before we know which one is wanted and nothing fetches twice.
  const desktop = useSyncExternalStore(subscribeToWidth, isDesktop, serverIsPhone);
  const [chosen, setChosen] = useState<"grid" | "day" | null>(null);
  const [date, setDate] = useState(start);
  const mode = chosen ?? (desktop ? "grid" : "day");
  const setMode = setChosen;
  return (
    <div className="space-y-3">
      <div className="flex gap-1" role="group" aria-label={L.dayView}>
        <Button
          type="button"
          size="sm"
          variant={mode === "day" ? "secondary" : "ghost"}
          onClick={() => setMode("day")}
          aria-pressed={mode === "day"}
          data-testid="view-day"
        >
          {L.dayView}
        </Button>
        <Button
          type="button"
          size="sm"
          variant={mode === "grid" ? "secondary" : "ghost"}
          onClick={() => setMode("grid")}
          aria-pressed={mode === "grid"}
          data-testid="view-grid"
        >
          {L.gridView}
        </Button>
      </div>
      {mode === "day" ? (
        <CalendarDayView
          date={date}
          propertyId={propertyId}
          groups={groups}
          labels={L}
          onDateChange={setDate}
        />
      ) : (
        <CalendarGrid
          start={start}
          days={days}
          propertyId={propertyId}
          groups={groups}
          labels={L}
        />
      )}
    </div>
  );
}
