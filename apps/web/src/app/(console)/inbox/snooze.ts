import { localToInstant } from "@pms/core";

/** The snooze presets the conversation menu offers, read in the property's time zone. */
export type SnoozePreset = "tomorrow" | "next_week";

const SNOOZE_TIME = "09:00";

/** "2026-11-23" for this instant on the property's wall calendar. */
export function zonedToday(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

const plusDays = (iso: string, n: number): string => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** The local date a preset wakes the conversation on: tomorrow, or next Monday. */
export function presetDate(preset: SnoozePreset, now: Date, timeZone: string): string {
  const today = zonedToday(now, timeZone);
  if (preset === "tomorrow") return plusDays(today, 1);
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay(); // 0 Sunday … 6 Saturday
  return plusDays(today, (8 - weekday) % 7 || 7);
}

/**
 * When a snoozed conversation comes back, as an ISO instant. A preset is 09:00 on its day in the
 * property's time zone; a custom "YYYY-MM-DDTHH:mm" is that wall time in the property's time
 * zone too (the browser's zone is not the property's). Null clears the snooze.
 */
export function snoozeUntil(
  input: { preset?: string | null; until?: string | null },
  now: Date,
  timeZone: string,
): string | null {
  if (input.preset === "tomorrow" || input.preset === "next_week")
    return new Date(
      localToInstant(presetDate(input.preset, now, timeZone), SNOOZE_TIME, timeZone),
    ).toISOString();
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(input.until ?? "");
  if (!m) return null;
  return new Date(localToInstant(m[1]!, m[2]!, timeZone)).toISOString();
}

export { SNOOZE_TIME };
