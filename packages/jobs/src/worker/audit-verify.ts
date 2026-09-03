import { asSystem, DrizzleAuditWriter, rawRows, sql, type Db } from "@pms/db";

/** Weekly: recompute every org's audit chain and report breaks (spec 13 §13.1). */
export async function verifyAllAuditChains(
  db: Db,
  sha256Hex: (s: string) => string,
): Promise<Array<{ orgId: string; ok: boolean; brokenAtSeq?: number }>> {
  const orgs = await rawRows<{ id: string }>(db, sql`select id from organization`);
  const out: Array<{ orgId: string; ok: boolean; brokenAtSeq?: number }> = [];
  for (const o of orgs) {
    const v = await asSystem(db, o.id, (tx) => new DrizzleAuditWriter(tx, sha256Hex).verify(o.id));
    out.push({
      orgId: o.id,
      ok: v.ok,
      ...(v.brokenAtSeq !== undefined ? { brokenAtSeq: v.brokenAtSeq } : {}),
    });
  }
  return out;
}
