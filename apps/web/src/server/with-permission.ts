import type { NextRequest } from "next/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ZodType } from "zod";
import {
  evaluate,
  type Permission,
  type ScopeKind,
  type ScopeRef,
  type ScopeGraph,
  type RowFilter,
} from "@pms/authz";
import type { Id, AuditActor } from "@pms/core";
import {
  DrizzleAuditWriter,
  DrizzleIdentityRepository,
  rawRows,
  sql,
  withTenant,
  type Tx,
  type Actor,
} from "@pms/db";
import type { Logger } from "@pms/runtime";
import { container } from "./container";
import { badRequest, forbidden, HttpProblem, stepUpRequired, unauthorized } from "./errors";
import { clientIp, currentLocale, currentOrgId, currentSession, requestId } from "./session";

/** What a permission-wrapped handler receives. Everything it needs; nothing it could misuse. */
export interface ActorCtx {
  orgId: Id;
  userId: Id;
  actor: Actor;
  tx: Tx;
  audit: DrizzleAuditWriter;
  /** Row filter the repository must honour (`⊙` cells), if any. */
  rowFilter?: RowFilter;
  requestId: string;
  locale: string;
  log: Logger;
}

export interface PermissionOptions<A extends unknown[]> {
  scope: ScopeKind;
  /** Where the action lands; defaults to the current organization. */
  resolveScope?: (...args: A) => ScopeRef | Promise<ScopeRef>;
  /** Audit subject; defaults to the scope. */
  subject?: (...args: A) => { kind: string; id: string };
  /** Validates the first argument. */
  schema?: ZodType<A[0]>;
  /** What to record as the audit `after` payload; defaults to the first argument. */
  auditInput?: (...args: A) => unknown;
  /** Force step-up even when the role table does not mark the permission `!`. */
  stepUp?: boolean;
  /** Redact these input keys from the audit `after` payload. */
  redact?: readonly string[];
  /** Reads of non-PII data are permission-checked but not written to the audit log. Default true. */
  audit?: boolean;
  /** Set by `withPermission.route`: the route flavour builds its own step-up redirect. */
  routeFlavour?: boolean;
}

const WRAPPED = Symbol.for("pms.wrapped");
const STEP_UP_WINDOW_MS = 5 * 60 * 1000;

async function scopeGraph(tx: Tx, orgId: Id): Promise<ScopeGraph> {
  const rows = await rawRows<{ group_id: string; property_id: string }>(
    tx,
    sql`select group_id, property_id from property_group_membership`,
  );
  const groupProperties = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!groupProperties.has(r.group_id)) groupProperties.set(r.group_id, new Set());
    groupProperties.get(r.group_id)!.add(r.property_id);
  }
  return { orgId, groupProperties };
}

/**
 * The single authorization chokepoint (spec 14 §14.3, C2; spec 02 RBAC-1..7).
 * Order: parse input → session → tenant transaction → grants → evaluate →
 * step-up → audit (same transaction) → handler. A throw anywhere rolls back.
 */
export function withPermission<A extends unknown[], O>(
  permission: Permission,
  opts: PermissionOptions<A>,
  handler: (ctx: ActorCtx, ...args: A) => Promise<O>,
): (...args: A) => Promise<O> {
  const wrapped = async (...rawArgs: A): Promise<O> => {
    const args = rawArgs;
    if (opts.schema) args[0] = parseInput(opts.schema, rawArgs[0]);
    const session = await currentSession();
    if (!session) throw unauthorized();
    const orgId = await currentOrgId();
    if (!orgId) throw new HttpProblem(400, "no_organization", "No organization selected");
    const c = await container();
    const [rid, locale, ip] = await Promise.all([requestId(), currentLocale(), clientIp()]);
    const actor: Actor = { type: "user", id: session.userId };

    try {
      return await withTenant(c.db.db, { orgId, actor, requestId: rid }, async (tx) => {
        const repo = new DrizzleIdentityRepository(tx);
        const grants = await repo.listGrantsForSubject("user", session.userId);
        const target = opts.resolveScope
          ? await opts.resolveScope(...args)
          : { kind: "organization" as const, id: orgId };
        const decision = evaluate({
          permission,
          target,
          graph: await scopeGraph(tx, orgId),
          now: c.clock.now().toString(),
          grants: grants.map((g) => ({
            role: g.roleKey
              ? (g.roleKey as Parameters<typeof evaluate>[0]["grants"][number]["role"])
              : {
                  custom: {
                    key: "custom",
                    allow: new Set(),
                    stepUp: new Set(),
                    rowFilter: new Map(),
                    grantable: new Set(),
                    maxScope: new Map(),
                  },
                },
            scope: { kind: g.scopeType, id: g.scopeId },
            ...(g.overrides
              ? {
                  overrides: {
                    ...(g.overrides.allow ? { allow: g.overrides.allow as Permission[] } : {}),
                    ...(g.overrides.deny ? { deny: g.overrides.deny as Permission[] } : {}),
                  },
                }
              : {}),
            expiresAt: g.expiresAt,
          })),
        });
        if (!decision.allow) throw forbidden(decision.missing, decision.reason);
        if (decision.stepUp || opts.stepUp) {
          // same transaction: a second connection would deadlock a single-connection driver (PGlite)
          const row = await repo.findSessionById(session.sessionId);
          const fresh =
            row?.stepUpAt && Date.now() - new Date(row.stepUpAt).getTime() < STEP_UP_WINDOW_MS;
          if (!fresh) throw stepUpRequired(permission);
        }
        const audit = new DrizzleAuditWriter(tx, c.sha256Hex);
        const subject = opts.subject ? opts.subject(...args) : { kind: target.kind, id: target.id };
        if (opts.audit !== false)
          await audit.append({
            orgId,
            actor: actor as AuditActor,
            action: permission,
            subject,
            after: redact(opts.auditInput ? opts.auditInput(...args) : args[0], opts.redact),
            surface: "web",
            ...(ip ? { ip } : {}),
            requestId: rid,
            occurredAt: c.clock.now().toString(),
          });
        const ctx: ActorCtx = {
          orgId,
          userId: session.userId,
          actor,
          tx,
          audit,
          requestId: rid,
          locale,
          log: c.log.child({ requestId: rid, orgId }),
        };
        if (decision.rowFilter) ctx.rowFilter = decision.rowFilter;
        return handler(ctx, ...args);
      });
    } catch (e) {
      // a form action that needs step-up sends the browser to re-authenticate and back (spec 02 §2.6)
      if (e instanceof HttpProblem && e.code === "step_up_required" && !opts.routeFlavour) {
        const referer = (await headers()).get("referer");
        let next = "/";
        if (referer) {
          const u = new URL(referer);
          next = `${u.pathname}${u.search}`;
        }
        redirect(`/step-up?next=${encodeURIComponent(next)}`);
      }
      throw e;
    }
  };
  return Object.assign(wrapped, { [WRAPPED]: permission });
}

export type RouteParams = Record<string, string | string[] | undefined>;
export type RouteHandler = (
  req: NextRequest,
  ctx: { params: Promise<RouteParams> },
) => Promise<Response>;

/** Route-handler flavour: the same chokepoint, with problem+json on failure. */
withPermission.route = function route<I>(
  permission: Permission,
  opts: PermissionOptions<[I, NextRequest]> & {
    input: (req: NextRequest, params: RouteParams) => I | Promise<I>;
  },
  handler: (ctx: ActorCtx, input: I, req: NextRequest) => Promise<Response>,
): RouteHandler {
  const inner = withPermission<[I, NextRequest], Response>(
    permission,
    { ...opts, auditInput: (input) => input, routeFlavour: true },
    (ctx, input, req) => handler(ctx, input, req),
  );
  const routeFn: RouteHandler = async (req, { params }) => {
    try {
      return await inner(await opts.input(req, await params), req);
    } catch (e) {
      // a browser navigation that needs step-up goes to the re-authentication page and comes back (spec 02 §2.6)
      if (
        e instanceof HttpProblem &&
        e.code === "step_up_required" &&
        req.headers.get("accept")?.includes("text/html")
      ) {
        const to = new URL("/step-up", req.nextUrl.origin);
        to.searchParams.set("next", req.nextUrl.pathname + req.nextUrl.search);
        return Response.redirect(to.toString(), 302);
      }
      return problemResponse(e);
    }
  };
  return Object.assign(routeFn, { [WRAPPED]: permission });
};

export function problemResponse(e: unknown): Response {
  if (e instanceof HttpProblem) return e.toResponse();
  if (e instanceof Error && e.name === "DomainError") {
    return new HttpProblem(422, (e as Error & { code: string }).code, e.message).toResponse();
  }
  // Unexpected: log with stack (never the request body), answer generically.
  console.error(
    "[pms] unhandled error in handler",
    e instanceof Error ? { name: e.name, message: e.message, stack: e.stack, cause: e.cause } : e,
  );
  return new HttpProblem(500, "internal", "Internal error").toResponse();
}

function parseInput<I>(schema: ZodType<I>, raw: I): I {
  const r = schema.safeParse(raw);
  if (!r.success) throw badRequest("Validation failed", r.error.issues);
  return r.data;
}

function redact(input: unknown, keys: readonly string[] = []): unknown {
  if (input instanceof FormData)
    input = Object.fromEntries(
      [...input.entries()].map(([k, v]) => [k, typeof v === "string" ? v : "[file]"]),
    );
  if (!input || typeof input !== "object") return input;
  const secret = new Set([...keys, "password", "token", "secret", "refreshToken"]);
  return Object.fromEntries(
    Object.entries(input as Record<string, unknown>).map(([k, v]) => [
      k,
      secret.has(k) ? "[redacted]" : v,
    ]),
  );
}

export function isWrapped(fn: unknown): boolean {
  return typeof fn === "function" && WRAPPED in fn;
}
