import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { DrizzleOperatorRepository, withoutTenant, type Tx } from "@pms/db";
import { container } from "./container";
import { forbidden, unauthorized } from "./errors";
import { problemResponse, type RouteHandler, type RouteParams } from "./with-permission";
import { currentSession, requestId } from "./session";

/**
 * The operator console chokepoint (spec 12 §12.1, spec 02 §2.7): outside tenancy, only
 * for accounts in `platform_operator`, every call written to the operator audit log and,
 * when it touches a tenant, to that tenant's own log through the ordinary writer.
 * OPCON-1: nothing here reads guest PII or message bodies; the repository methods it calls
 * return states, ids, codes and timings.
 */
export const IMPERSONATION_COOKIE = "pms_impersonation";
const PUBLIC = Symbol.for("pms.public");

export interface OperatorCtx {
  operatorId: string;
  tx: Tx;
  repo: DrizzleOperatorRepository;
  requestId: string;
  /** Records the action on the operator log (and the tenant log when `orgId` is set). */
  audit(
    action: string,
    subject: { kind: string; id: string },
    orgId?: string | null,
    detail?: Record<string, unknown>,
  ): Promise<void>;
}

async function resolveOperator(): Promise<{ userId: string } | null> {
  const session = await currentSession();
  if (!session) return null;
  const c = await container();
  const ok = await withoutTenant(c.db.db, (tx) =>
    new DrizzleOperatorRepository(tx).isOperator(session.userId),
  );
  return ok ? { userId: session.userId } : null;
}

/** For pages: null when the signed-in user is not an operator. */
export async function currentOperator(): Promise<{ userId: string } | null> {
  return resolveOperator();
}

async function runAsOperator<O>(
  action: string,
  fn: (ctx: OperatorCtx) => Promise<O>,
  opts: { audit: boolean },
): Promise<O> {
  const session = await currentSession();
  if (!session) throw unauthorized();
  const op = await resolveOperator();
  if (!op) throw forbidden("platform_operator", "not a platform operator");
  const c = await container();
  const rid = await requestId();
  return withoutTenant(c.db.db, async (tx) => {
    const repo = new DrizzleOperatorRepository(tx);
    const ctx: OperatorCtx = {
      operatorId: op.userId,
      tx,
      repo,
      requestId: rid,
      audit: async (a, subject, orgId, detail) => {
        await repo.audit({
          operatorId: op.userId,
          orgId: orgId ?? null,
          action: a,
          subject,
          ...(detail ? { detail } : {}),
          requestId: rid,
        });
      },
    };
    if (opts.audit) await ctx.audit(action, { kind: "operator_console", id: action });
    return fn(ctx);
  });
}

type OperatorFn = {
  <A extends unknown[], O>(
    action: string,
    opts: { audit?: boolean },
    handler: (ctx: OperatorCtx, ...args: A) => Promise<O>,
  ): (...args: A) => Promise<O>;
  route<I = unknown>(
    action: string,
    opts: { audit?: boolean; input?: (req: NextRequest, params: RouteParams) => I },
    handler: (ctx: OperatorCtx, input: I, req: NextRequest) => Promise<Response>,
  ): RouteHandler;
};

export const withOperator: OperatorFn = Object.assign(
  <A extends unknown[], O>(
    action: string,
    opts: { audit?: boolean },
    handler: (ctx: OperatorCtx, ...args: A) => Promise<O>,
  ) => {
    const wrapped = (...args: A): Promise<O> =>
      runAsOperator(action, (ctx) => handler(ctx, ...args), { audit: opts.audit !== false });
    return Object.assign(wrapped, { [PUBLIC]: "operator" });
  },
  {
    route<I>(
      action: string,
      opts: { audit?: boolean; input?: (req: NextRequest, params: RouteParams) => I },
      handler: (ctx: OperatorCtx, input: I, req: NextRequest) => Promise<Response>,
    ): RouteHandler {
      const fn: RouteHandler = async (req, { params }) => {
        try {
          const input = opts.input ? opts.input(req, await params) : (undefined as I);
          return await runAsOperator(action, (ctx) => handler(ctx, input, req), {
            audit: opts.audit !== false,
          });
        } catch (e) {
          return problemResponse(e);
        }
      };
      return Object.assign(fn, { [PUBLIC]: "operator" });
    },
  },
);

/** The impersonation session an operator is inside, if any (cookie → active row inside its cap). */
export async function currentImpersonation(): Promise<{
  id: string;
  orgId: string;
  orgName: string;
  writeApproved: boolean;
  expiresAt: string;
} | null> {
  const id = (await cookies()).get(IMPERSONATION_COOKIE)?.value;
  if (!id) return null;
  const op = await resolveOperator();
  if (!op) return null;
  const c = await container();
  const row = await withoutTenant(c.db.db, (tx) =>
    new DrizzleOperatorRepository(tx).impersonation(id),
  );
  if (
    !row ||
    row.state !== "active" ||
    row.operatorId !== op.userId ||
    !row.expiresAt ||
    row.expiresAt <= c.clock.now().toString()
  )
    return null;
  return {
    id: row.id,
    orgId: row.orgId,
    orgName: row.orgName,
    writeApproved: row.writeApproved,
    expiresAt: row.expiresAt,
  };
}
