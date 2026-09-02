import type { Id } from "../shared/id.js";

export interface AuditActor {
  type: "user" | "service_account" | "system" | "guest" | "owner" | "automation";
  id: string;
  impersonatedBy?: string;
}

/** One audit entry before hashing. `before`/`after` are redacted by the caller. */
export interface AuditInput {
  orgId: Id;
  actor: AuditActor;
  action: string;
  subject: { kind: string; id: string };
  before?: unknown;
  after?: unknown;
  surface: string;
  ip?: string;
  requestId?: string;
  occurredAt: string;
}

export interface AuditEntry extends AuditInput {
  id: Id;
  seq: number;
  prevHash: string;
  hash: string;
}
