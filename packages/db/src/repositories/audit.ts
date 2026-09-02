import { asc, desc, eq, sql } from "drizzle-orm";
import {
  chainHash,
  verifyChain,
  Id,
  type AuditActor,
  type AuditEntry,
  type AuditInput,
  type ChainVerification,
  type Sha256Hex,
} from "@pms/core";
import * as s from "../schema/index.js";
import type { Tx } from "../tenant.js";

/**
 * Append-only, hash-chained audit log per organization (spec 03 §3.9). The
 * per-org advisory lock serialises writers so seq and prev_hash never race.
 */
export class DrizzleAuditWriter {
  constructor(
    private readonly tx: Tx,
    private readonly sha256Hex: Sha256Hex,
  ) {}

  async append(raw: AuditInput): Promise<AuditEntry> {
    // Timestamps are normalised to ISO so the hash input matches what the database gives back.
    const input: AuditInput = { ...raw, occurredAt: new Date(raw.occurredAt).toISOString() };
    await this.tx.execute(sql`select pg_advisory_xact_lock(hashtext(${input.orgId}))`);
    const [last] = await this.tx
      .select({ seq: s.auditLog.seq, hash: s.auditLog.hash })
      .from(s.auditLog)
      .where(eq(s.auditLog.orgId, input.orgId))
      .orderBy(desc(s.auditLog.seq))
      .limit(1);
    const seq = (last?.seq ?? 0) + 1;
    const prevHash = last?.hash ?? "";
    const hash = chainHash(this.sha256Hex, prevHash, seq, input);
    const entry: AuditEntry = { ...input, id: Id.next(), seq, prevHash, hash };
    await this.tx.insert(s.auditLog).values({
      id: entry.id,
      orgId: entry.orgId,
      seq,
      prevHash,
      hash,
      actor: entry.actor,
      action: entry.action,
      subject: entry.subject,
      before: entry.before ?? null,
      after: entry.after ?? null,
      surface: entry.surface,
      ip: entry.ip ?? null,
      requestId: entry.requestId ?? null,
      occurredAt: entry.occurredAt,
    });
    return entry;
  }

  async verify(orgId: string): Promise<ChainVerification> {
    const rows = await this.tx
      .select()
      .from(s.auditLog)
      .where(eq(s.auditLog.orgId, orgId))
      .orderBy(asc(s.auditLog.seq));
    const entries: AuditEntry[] = rows.map((r) => {
      const e: AuditEntry = {
        id: r.id as Id,
        orgId: r.orgId as Id,
        seq: r.seq,
        prevHash: r.prevHash,
        hash: r.hash,
        actor: r.actor as AuditActor,
        action: r.action,
        subject: r.subject,
        surface: r.surface,
        occurredAt: new Date(r.occurredAt).toISOString(),
      };
      if (r.before !== null) e.before = r.before;
      if (r.after !== null) e.after = r.after;
      if (r.ip !== null) e.ip = r.ip;
      if (r.requestId !== null) e.requestId = r.requestId;
      return e;
    });
    return verifyChain(this.sha256Hex, entries);
  }
}
