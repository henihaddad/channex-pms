import { DrizzleReservationRepository } from "@pms/db";
import { withPermission } from "@/server/with-permission";
import { container } from "@/server/container";

/**
 * The guest list as CSV, contact details included: guest PII, so `booking:read_pii`, audited,
 * never available to an impersonating operator.
 */
export const GET = withPermission.route<Record<string, never>>(
  "booking:read_pii",
  { scope: "organization", input: () => ({}), subject: () => ({ kind: "export", id: "guests" }) },
  async (ctx) => {
    const c = await container();
    const today = c.clock.today("UTC").toString();
    const repo = new DrizzleReservationRepository(ctx.tx, ctx.orgId, c.crypto);
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [
      "name,email,phone,country,language,stays,properties,lifetime value,booked via,marketing consent",
    ];
    for (const g of await repo.guestList(today)) {
      const pii = await repo.guestPii(g.id);
      lines.push(
        [
          g.name,
          pii?.email,
          pii?.phone,
          g.country,
          g.language,
          g.stays,
          g.properties.join("; "),
          g.value.map((v) => `${v.currency} ${(v.amountMinor / 100).toFixed(2)}`).join("; "),
          g.channels.join("; "),
          g.consent ? "yes" : "no",
        ]
          .map(esc)
          .join(","),
      );
    }
    return new Response(lines.join("\n"), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="guests-${today}.csv"`,
      },
    });
  },
);
