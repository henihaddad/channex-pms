import { DrizzleReservationRepository, rawRows, sql } from "@pms/db";
import { withPermission } from "@/server/with-permission";
import { container } from "@/server/container";

/**
 * "Export registrations" on the check-in board: one CSV row per guest named on a check-in form,
 * for stays arriving in the next 7 days or in house. Guest names are PII: `booking:read_pii`,
 * audited, never available to an impersonating operator. No filing integration yet (SEF,
 * Alloggiati): this is what a manager uploads by hand.
 */
export const GET = withPermission.route<Record<string, never>>(
  "booking:read_pii",
  {
    scope: "organization",
    input: () => ({}),
    subject: () => ({ kind: "export", id: "registrations" }),
  },
  async (ctx) => {
    const c = await container();
    const today = c.clock.today("UTC").toString();
    const rows = await new DrizzleReservationRepository(ctx.tx, ctx.orgId, c.crypto).checkinBoard(
      today,
      7,
    );
    const forms = await rawRows<{
      booking_id: string;
      guests: Array<{ name: string; surname: string }>;
    }>(ctx.tx, sql`select booking_id, guests from pre_checkin where completed_at is not null`);
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [
      ["property", "arrival", "departure", "reference", "guest", "lead guest", "id on file"].join(
        ",",
      ),
    ];
    for (const r of rows) {
      const named = forms.find((f) => f.booking_id === r.id)?.guests ?? [];
      const people =
        named.length > 0 ? named.map((g) => `${g.name} ${g.surname}`.trim()) : [r.guestName];
      for (const p of people)
        lines.push(
          [
            r.propertyTitle,
            r.arrivalDate,
            r.departureDate,
            r.id.slice(0, 8).toUpperCase(),
            p,
            r.guestName,
            r.idOnFile ? "yes" : "no",
          ]
            .map(esc)
            .join(","),
        );
    }
    return new Response(lines.join("\n"), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="registrations-${today}.csv"`,
      },
    });
  },
);
