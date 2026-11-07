"use server";

import { DrizzlePropertyRepository, DrizzleReservationRepository } from "@pms/db";
import { withPermission } from "@/server/with-permission";
import { container } from "@/server/container";

export interface PaletteHit {
  id: string;
  title: string;
  subtitle: string;
  href: string;
}

export interface PaletteResults {
  reservations: PaletteHit[];
  properties: PaletteHit[];
}

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
    const repo = new DrizzleReservationRepository(ctx.tx, ctx.orgId, c.crypto);
    const today = c.clock.today("UTC").toString();
    const [list, properties] = await Promise.all([
      repo.list({ q: query, limit: 6 }, today),
      new DrizzlePropertyRepository(ctx.tx, ctx.orgId).list(),
    ]);
    const needle = query.toLowerCase();
    return {
      reservations: list.rows.map((r) => ({
        id: r.id,
        title: r.guestName,
        subtitle: `${r.propertyTitle} · ${r.arrivalDate} → ${r.departureDate} · ${r.otaName ?? "Direct"}${r.otaReservationCode ? ` · ${r.otaReservationCode}` : ""}`,
        href: `/reservations/${r.id}`,
      })),
      properties: properties
        .filter((p) => p.title.toLowerCase().includes(needle))
        .slice(0, 5)
        .map((p) => ({
          id: p.id,
          title: p.title,
          subtitle: p.state,
          href: `/properties/${p.id}`,
        })),
    };
  },
);
