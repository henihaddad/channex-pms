import { rawRows, sql, type Tx } from "@pms/db";

/**
 * Whether this organisation uses each built connection (spec 12 §12.7b): a channel
 * connection made, a booking site switched on, a pricing import set up, a plugin installed.
 * The integrations page reads this so "Connected" means connected here, not merely shipped.
 */
export interface IntegrationUsage {
  channelConnections: number;
  bookingSites: number;
  rateImports: number;
  plugins: number;
  lockCredentials: number;
}

export async function integrationUsage(tx: Tx): Promise<IntegrationUsage> {
  const [r] = await rawRows<IntegrationUsage>(
    tx,
    sql`select
          (select count(*)::int from channel_connection where adapter_code <> 'direct' and state <> 'removed') as "channelConnections",
          (select count(*)::int from booking_engine_settings where enabled) as "bookingSites",
          (select count(*)::int from rate_import_settings) as "rateImports",
          (select count(*)::int from plugin) as "plugins",
          (select count(*)::int from access_credential) as "lockCredentials"`,
  );
  return (
    r ?? { channelConnections: 0, bookingSites: 0, rateImports: 0, plugins: 0, lockCredentials: 0 }
  );
}
