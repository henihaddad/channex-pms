import type { Id } from "../shared/id.js";

export interface AuditActor {
  type: "user" | "service_account" | "system" | "guest" | "owner" | "automation";
  id: string;
  impersonatedBy?: string;
  /** For a service account: the API key's name, so the log reads "via API key ‘Claude’". */
  label?: string;
  /** For a service account: the person who created the key (spec 02 §2.8). */
  createdBy?: string;
  /** For a service account: an API key, or an app connected by sign-in ("via Claude (claude.ai)"). */
  via?: "api_key" | "app";
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
