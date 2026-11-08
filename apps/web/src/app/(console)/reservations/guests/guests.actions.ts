"use server";

import { DrizzleReservationRepository, rawRows, sql, type GuestListRow } from "@pms/db";
import { withPermission } from "@/server/with-permission";
import { container } from "@/server/container";

export type GuestPill = "all" | "returning" | "emailable" | "flagged";

export interface GuestsView {
  today: string;
  rows: GuestListRow[];
  /** Rows matching the pill and search, before the page limit. */
  matching: number;
  kpi: { guests: number; returning: number; directAfterOta: number; consent: number };
  /** Guests who stayed through a channel, can be emailed and said yes: the win-back audience. */
  winBack: number;
}

const fold = (x: string) =>
  x
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
const DIRECT = new Set(["direct", "staff", "phone", "walk_in"]);

/** The guest list (design canvas, November 2026). Persona: `property_manager`, `reservations_agent`. */
export const loadGuests = withPermission<
  [{ pill: GuestPill; q?: string; limit: number }],
  GuestsView
>("booking:read", { scope: "organization", audit: false }, async (ctx, { pill, q, limit }) => {
  const c = await container();
  const [tz] = await rawRows<{ timezone: string }>(
    ctx.tx,
    sql`select timezone from property where archived_at is null order by created_at limit 1`,
  );
  const today = c.clock.today(tz?.timezone ?? "UTC").toString();
  const all = await new DrizzleReservationRepository(ctx.tx, ctx.orgId, c.crypto).guestList(today);
  const keep = (g: GuestListRow) =>
    (pill === "all" ||
      (pill === "returning" && g.stays >= 2) ||
      (pill === "emailable" && g.consent && g.hasEmail) ||
      (pill === "flagged" && g.pinnedNote !== null)) &&
    (!q || fold(g.name).includes(fold(q)) || fold(g.country ?? "") === fold(q));
  const matching = all.filter(keep);
  return {
    today,
    rows: matching.slice(0, limit),
    matching: matching.length,
    kpi: {
      guests: all.length,
      returning: all.filter((g) => g.stays >= 2).length,
      directAfterOta: all.filter((g) => g.directAfterOta).length,
      consent: all.filter((g) => g.consent).length,
    },
    winBack: all.filter(
      (g) => g.consent && g.hasEmail && g.channels.some((x) => !DIRECT.has(x.toLowerCase())),
    ).length,
  };
});
