import { LocalDate, type Clock } from "@pms/core";
import { asSystem, rawRows, rowsOf, schema, sql, type Db } from "@pms/db";

/**
 * Nightly on-the-books snapshot (spec 11 §11.5, Q14). Runs hourly; each
 * property is snapshotted once per property-local day, after 02:00 local.
 * Pace and pickup are computed from these rows later (M6); they cannot be
 * backfilled, which is why the job exists before there are bookings.
 */
export interface SnapshotSource {
  /** rooms available and sold per stay date for the horizon; empty until inventory (M2) and bookings (M3) exist. */
  onTheBooks(
    tx: Parameters<Parameters<typeof asSystem>[2]>[0],
    propertyId: string,
    from: LocalDate,
    days: number,
  ): Promise<
    Array<{
      stayDate: LocalDate;
      roomsAvailable: number;
      roomsSold: number;
      roomRevenueMinor: number;
      currency: string;
    }>
  >;
}

export const HORIZON_DAYS = 365;

export async function runOtbSnapshots(
  db: Db,
  clock: Clock,
  source: SnapshotSource,
  log: { info: (o: object, m: string) => void },
): Promise<number> {
  const props = await rawRows<{ id: string; org_id: string; timezone: string; currency: string }>(
    db,
    sql`select id, org_id, timezone, currency from property where state <> 'archived' and archived_at is null`,
  );
  let written = 0;
  for (const p of props) {
    const local = clock.now().toZonedDateTimeISO(p.timezone);
    if (local.hour < 2) continue;
    const today = LocalDate.of(local.year, local.month, local.day);
    const n = await asSystem(db, p.org_id, async (tx) => {
      const existing = rowsOf(
        await tx.execute(
          sql`select 1 from otb_snapshot where property_id = ${p.id} and snapshot_date = ${today.toString()} limit 1`,
        ),
      );
      if (existing.length > 0) return 0;
      const rows = await source.onTheBooks(tx, p.id, today, HORIZON_DAYS);
      if (rows.length === 0) return 0;
      await tx
        .insert(schema.otbSnapshot)
        .values(
          rows.map((r) => ({
            orgId: p.org_id,
            propertyId: p.id,
            stayDate: r.stayDate.toString(),
            snapshotDate: today.toString(),
            roomsAvailable: r.roomsAvailable,
            roomsSold: r.roomsSold,
            roomRevenueMinor: r.roomRevenueMinor,
            currency: r.currency,
          })),
        )
        .onConflictDoNothing();
      return rows.length;
    });
    written += n;
    if (n > 0)
      log.info({ propertyId: p.id, rows: n, snapshotDate: today.toString() }, "otb.snapshot");
  }
  return written;
}

/** Until M2/M3 land, the source is inventory-less: zero rows, so nothing is written but the job runs. */
export const emptySnapshotSource: SnapshotSource = { onTheBooks: async () => [] };
