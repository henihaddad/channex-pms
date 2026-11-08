import { rawRows, sql, withoutTenant } from "@pms/db";
import type { EngineDeps } from "@pms/jobs";
import { container } from "./container";

/** The engine's job dependencies from the web container (fake payments and lock unless configured). */
export async function engineDeps(): Promise<EngineDeps> {
  const c = await container();
  return {
    db: c.db.db,
    clock: c.clock,
    crypto: c.crypto,
    log: c.log,
    mailer: c.mailer,
    payments: c.payments,
    lock: c.lock,
    appUrl: c.config.NEXT_PUBLIC_APP_URL,
  };
}

/** Public pages know a property id, not a tenant: the storefront resolves the organization first. */
export async function orgForProperty(propertyId: string): Promise<string | null> {
  const c = await container();
  const [r] = await withoutTenant(c.db.db, (tx) =>
    rawRows<{ org_id: string }>(
      tx,
      sql`select p.org_id from property p join booking_engine_settings s on s.property_id = p.id
          where p.id = ${propertyId} and s.enabled and p.archived_at is null`,
    ),
  );
  return r?.org_id ?? null;
}

export async function orgForHold(holdId: string): Promise<string | null> {
  const c = await container();
  const [r] = await withoutTenant(c.db.db, (tx) =>
    rawRows<{ org_id: string }>(tx, sql`select org_id from booking_hold where id = ${holdId}`),
  );
  return r?.org_id ?? null;
}

export async function orgForBooking(bookingId: string): Promise<string | null> {
  const c = await container();
  const [r] = await withoutTenant(c.db.db, (tx) =>
    rawRows<{ org_id: string }>(tx, sql`select org_id from booking where id = ${bookingId}`),
  );
  return r?.org_id ?? null;
}

/** The organization a public page belongs to, for the booking site's header and footer. */
export async function orgBrand(orgId: string): Promise<{ id: string; name: string }> {
  const c = await container();
  const [r] = await withoutTenant(c.db.db, (tx) =>
    rawRows<{ name: string }>(tx, sql`select name from organization where id = ${orgId}`),
  );
  return { id: orgId, name: r?.name ?? "" };
}

export function money(minor: number, currency: string, locale = "en"): string {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(minor / 100);
  } catch {
    return `${(minor / 100).toFixed(2)} ${currency}`;
  }
}
