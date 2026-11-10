import type { NextRequest } from "next/server";
import type { z } from "zod";
import type { Permission, ScopeKind, ScopeRef } from "@pms/authz";
import { withPermission, type ActorCtx, type RouteParams } from "../with-permission";
import { badRequest } from "../errors";

/**
 * One thing a host does every day, described once (spec 04 §4.7a): the permission it needs,
 * where it lands, its input schema, and the code that does it. The REST route and the MCP tool
 * are two doors onto the same operation, so both pass the same permission, scope and audit.
 */
export interface Op<S extends z.ZodObject = z.ZodObject, O = unknown> {
  /** The MCP tool name. */
  name: string;
  title: string;
  /** Written for the model that calls the tool: what it does, when to use it, what it returns. */
  description: string;
  permission: Permission;
  scope: ScopeKind;
  /** False for reads: MCP clients can run those without asking. */
  write: boolean;
  /** Cannot be undone from here (a cancellation, a message the guest already read). */
  destructive?: boolean;
  schema: S;
  resolveScope?: (i: z.output<S>) => ScopeRef;
  subject?: (i: z.output<S>) => { kind: string; id: string };
  /** Reads of non-PII data are not written to the audit log. */
  audit?: boolean;
  redact?: readonly string[];
  /** The REST door: method, path under the origin, and which input key the `{id}` fills. */
  rest: { method: "GET" | "POST" | "PUT"; path: string; idKey?: string; status?: number };
  run: (ctx: ActorCtx, input: z.output<S>) => Promise<O>;
}

export const op = <S extends z.ZodObject, O>(o: Op<S, O>): Op<S, O> => o;

function options<S extends z.ZodObject, O>(o: Op<S, O>) {
  return {
    scope: o.scope,
    ...(o.resolveScope ? { resolveScope: o.resolveScope } : {}),
    ...(o.subject ? { subject: o.subject } : {}),
    ...(o.audit === false ? { audit: false } : {}),
    ...(o.redact ? { redact: o.redact } : {}),
  };
}

function parse<S extends z.ZodObject>(schema: S, raw: unknown): z.output<S> {
  const r = schema.safeParse(raw);
  if (!r.success) throw badRequest("Validation failed", r.error.issues);
  return r.data;
}

/** Call an operation as the current principal (person or API key), through `withPermission`. */
export function invoke<S extends z.ZodObject, O>(o: Op<S, O>, raw: unknown): Promise<O> {
  return withPermission<[z.output<S>], O>(o.permission, options(o), (ctx, i) => o.run(ctx, i))(
    parse(o.schema, raw),
  );
}

/** What a REST route spreads into `withPermission.route`: the op's options and its input parser. */
export function restOptions<S extends z.ZodObject, O>(o: Op<S, O>) {
  return {
    ...options(o),
    input: async (req: NextRequest, params: RouteParams): Promise<z.output<S>> => {
      const raw: Record<string, unknown> =
        o.rest.method === "GET"
          ? Object.fromEntries(req.nextUrl.searchParams)
          : ((await req.json().catch(() => {
              throw badRequest("Body must be JSON");
            })) as Record<string, unknown>);
      if (o.rest.idKey && typeof params.id === "string") raw[o.rest.idKey] = params.id;
      return parse(o.schema, raw);
    },
  };
}

/** The REST answer: the op's result as JSON. */
export async function restRun<S extends z.ZodObject, O>(
  o: Op<S, O>,
  ctx: ActorCtx,
  input: z.output<S>,
): Promise<Response> {
  return Response.json(await o.run(ctx, input), {
    status: o.rest.status ?? 200,
    headers: { "cache-control": "no-store" },
  });
}
