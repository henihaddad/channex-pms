import type { NextRequest } from "next/server";
import { problemResponse, type RouteHandler, type RouteParams } from "./with-permission";
import { kickOutbox } from "./outbox-kick";

export type PublicReason =
  "health" | "auth" | "webhook" | "booking_engine" | "guest_portal" | "catalogue" | "test_hook";

const PUBLIC = Symbol.for("pms.public");

/**
 * Deliberately unauthenticated handlers. The reason is a literal so the build
 * check can list every public surface (spec 02 RBAC-1: nothing is unwrapped by accident).
 */
export function publicRoute(
  reason: PublicReason,
  handler: (req: NextRequest, params: RouteParams) => Promise<Response>,
): RouteHandler {
  const fn: RouteHandler = async (req, { params }) => {
    try {
      const res = await handler(req, await params);
      await kickOutbox();
      return res;
    } catch (e) {
      return problemResponse(e);
    }
  };
  return Object.assign(fn, { [PUBLIC]: reason });
}

export function publicAction<A extends unknown[], O>(
  reason: PublicReason,
  handler: (...args: A) => Promise<O>,
): (...args: A) => Promise<O> {
  const wrapped = async (...args: A): Promise<O> => {
    const out = await handler(...args);
    await kickOutbox();
    return out;
  };
  return Object.assign(wrapped, { [PUBLIC]: reason });
}
