import { DrizzleReservationRepository, type ReservationFilters } from "@pms/db";
import { withPermission } from "@/server/with-permission";
import { container } from "@/server/container";

/** RES-2: every list exportable under export:execute. CSV, no PII beyond the abbreviated guest name the list shows. */
export const GET = withPermission.route<ReservationFilters>(
  "export:execute",
  {
    scope: "organization",
    input: (req) =>
      Object.fromEntries(
        [...req.nextUrl.searchParams.entries()].filter(([k]) =>
          [
            "view",
            "dateType",
            "from",
            "to",
            "propertyId",
            "channel",
            "status",
            "mappingState",
            "q",
          ].includes(k),
        ),
      ) as ReservationFilters,
    subject: () => ({ kind: "export", id: "reservations" }),
  },
  async (ctx, filters) => {
    const c = await container();
    const { rows } = await new DrizzleReservationRepository(ctx.tx, ctx.orgId, c.crypto).list(
      { ...filters, limit: 5000 },
      c.clock.today("UTC").toString(),
    );
    const head = [
      "id",
      "property",
      "guest",
      "channel",
      "reference",
      "status",
      "arrival",
      "departure",
      "nights",
      "currency",
      "total",
      "balance",
      "units",
      "mapping",
    ];
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const body = [
      head.join(","),
      ...rows.map((r) =>
        [
          r.id,
          r.propertyTitle,
          r.guestName,
          r.otaName,
          r.otaReservationCode,
          r.status,
          r.arrivalDate,
          r.departureDate,
          r.nights,
          r.currency,
          (r.totalAmountMinor / 100).toFixed(2),
          (r.balanceMinor / 100).toFixed(2),
          r.unitNames,
          r.mappingState,
        ]
          .map(esc)
          .join(","),
      ),
    ].join("\n");
    return new Response(body, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="reservations-${c.clock.today("UTC").toString()}.csv"`,
      },
    });
  },
);
