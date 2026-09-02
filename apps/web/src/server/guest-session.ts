import { cookies } from "next/headers";
import { rawRows, sql, withoutTenant, withTenant, type Tx } from "@pms/db";
import { container } from "./container";
import { HttpProblem, unauthorized } from "./errors";
import { currentLocale, requestId } from "./session";

/**
 * Guest portal sessions (spec 10 §10.6): the confirmation mail carries a single
 * token scoped to one booking; the cookie holds it; every portal action runs as
 * `actor_type = guest` inside the booking's tenant. No enumeration: the token is
 * the only way in and it names exactly one booking.
 */
export const GUEST_COOKIE = "pms_guest";
const PUBLIC = Symbol.for("pms.public");

export interface GuestCtx {
  orgId: string;
  bookingId: string;
  sessionId: string;
  tx: Tx;
  locale: string;
  requestId: string;
}

interface GuestRow {
  org_id: string;
  id: string;
  booking_id: string;
}

async function resolveGuest(token: string | undefined): Promise<GuestRow | null> {
  if (!token) return null;
  const c = await container();
  const hash = c.sha256Hex(token);
  const [row] = await withoutTenant(c.db.db, (tx) =>
    rawRows<GuestRow>(
      tx,
      sql`select org_id, id, booking_id from guest_session where token_hash = ${hash} and expires_at > now()`,
    ),
  );
  return row ?? null;
}

/** Start a portal session from the mailed token: validates, sets the cookie, returns the booking id. */
export async function enterGuestPortal(token: string): Promise<string> {
  const row = await resolveGuest(token);
  if (!row) throw new HttpProblem(401, "guest_link_invalid", "This link is invalid or has expired");
  const c = await container();
  await withoutTenant(c.db.db, (tx) =>
    tx.execute(sql`update guest_session set last_seen_at = now() where id = ${row.id}`),
  );
  (await cookies()).set(GUEST_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 60,
  });
  return row.booking_id;
}

/** The current portal visitor, for page reads; null sends the page to the "link required" state. */
export async function currentGuest(): Promise<{ orgId: string; bookingId: string } | null> {
  const row = await resolveGuest((await cookies()).get(GUEST_COOKIE)?.value);
  return row ? { orgId: row.org_id, bookingId: row.booking_id } : null;
}

/** Portal Server Actions: the build check accepts this wrapper next to withPermission and publicAction. */
export function withGuestSession<A extends unknown[], O>(
  handler: (ctx: GuestCtx, ...args: A) => Promise<O>,
): (...args: A) => Promise<O> {
  const wrapped = async (...args: A): Promise<O> => {
    const row = await resolveGuest((await cookies()).get(GUEST_COOKIE)?.value);
    if (!row) throw unauthorized();
    const c = await container();
    const [rid, locale] = await Promise.all([requestId(), currentLocale()]);
    return withTenant(
      c.db.db,
      { orgId: row.org_id, actor: { type: "guest", id: row.id }, requestId: rid },
      (tx) =>
        handler(
          {
            orgId: row.org_id,
            bookingId: row.booking_id,
            sessionId: row.id,
            tx,
            locale,
            requestId: rid,
          },
          ...args,
        ),
    );
  };
  return Object.assign(wrapped, { [PUBLIC]: "guest_portal" });
}
