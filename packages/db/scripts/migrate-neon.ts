/**
 * Migrate a Neon database from a machine without a TCP path to Postgres (the
 * CI runner, an agent sandbox behind an HTTPS proxy): the Neon serverless
 * driver speaks the wire protocol over a WebSocket. Same migrator, same
 * folder, same forward-only rules as `db:migrate` (spec 14 §14.7).
 */
import { readFileSync } from "node:fs";
import { neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { migrate } from "drizzle-orm/neon-serverless/migrator";
import WebSocket from "ws";
import { migrationsFolder } from "../src/client.js";
import * as schema from "../src/schema/index.js";

const url = process.env.NEON_DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error("NEON_DIRECT_URL or DATABASE_URL is required");

const proxy = process.env.HTTPS_PROXY ?? process.env.https_proxy;
if (proxy) {
  const { HttpsProxyAgent } = await import("https-proxy-agent");
  const ca = process.env.NODE_EXTRA_CA_CERTS
    ? readFileSync(process.env.NODE_EXTRA_CA_CERTS)
    : undefined;
  const agent = new HttpsProxyAgent(proxy, ca ? { ca } : {});
  class ProxiedWebSocket extends WebSocket {
    constructor(address: string, protocols?: string | string[]) {
      super(address, protocols, { agent, ...(ca ? { ca } : {}) });
    }
  }
  neonConfig.webSocketConstructor = ProxiedWebSocket as unknown as typeof WebSocket;
} else {
  neonConfig.webSocketConstructor = WebSocket as unknown as typeof WebSocket;
}

const pool = new Pool({ connectionString: url });
const db = drizzle(pool, { schema, casing: "snake_case" });
console.log("db: migrating (neon over websocket)");
await migrate(db, { migrationsFolder: await migrationsFolder() });
// `set local role pms_app` (packages/db/src/tenant.ts) needs membership WITH SET: Postgres 16 gives
// the creator only ADMIN OPTION, which cannot SET ROLE.
const member = await pool.query("select pg_has_role(current_user, 'pms_app', 'set') as ok");
if (!(member.rows[0] as { ok: boolean }).ok) {
  await pool.query("grant pms_app to current_user with set true");
  console.log("db: granted pms_app to the connecting role");
}
await pool.end();
console.log("db: migrations applied");
