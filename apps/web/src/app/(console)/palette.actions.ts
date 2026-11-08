"use server";

import { DrizzlePropertyRepository, DrizzleReservationRepository } from "@pms/db";
import { withPermission } from "@/server/with-permission";
import { getTranslations } from "next-intl/server";
import { container } from "@/server/container";
import { paletteRows, type PaletteResults } from "@/server/palette";

export type { PaletteHit, PaletteResults } from "@/server/palette";

/**
 * What ⌘K searches: guests and reservations by name, reference or property,
 * and properties by title. A read of a few rows, never audited, so typing in
 * the palette does not fill the audit log.
 */
export const paletteSearch = withPermission<[{ q: string }], PaletteResults>(
  "booking:read",
  { scope: "organization", audit: false },
  async (ctx, { q }) => {
    const query = q.trim();
    if (query.length < 2) return { reservations: [], properties: [] };
    const c = await container();
    const today = c.clock.today("UTC").toString();
    const [list, properties] = await Promise.all([
      new DrizzleReservationRepository(ctx.tx, ctx.orgId, c.crypto).list(
        { q: query, limit: 6 },
        today,
      ),
      new DrizzlePropertyRepository(ctx.tx, ctx.orgId).list(),
    ]);
    const t = await getTranslations("nav.palette.rows");
    return paletteRows(query, list.rows, properties, today, {
      arrivesIn: (n) => t("arrivesIn", { n }),
      arrivesToday: t("arrivesToday"),
      inHouse: t("inHouse"),
      checkedOut: t("checkedOut"),
      confirmed: t("confirmed"),
      cancelled: t("cancelled"),
      due: (amount) => t("due", { amount }),
      direct: t("direct"),
      live: t("live"),
    });
  },
);
