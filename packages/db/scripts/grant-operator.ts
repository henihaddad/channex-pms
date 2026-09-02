// Bootstrap the first platform operator (spec 02 §2.7): pnpm --filter @pms/db operator:grant you@example.com
import { connect, DrizzleOperatorRepository, rawRows, sql, withoutTenant } from "../src/index.js";

const email = process.argv[2]?.toLowerCase();
if (!email) {
  console.error("usage: operator:grant <email>");
  process.exit(2);
}
const handle = await connect();
const [u] = await withoutTenant(handle.db, (tx) =>
  rawRows<{ id: string }>(tx, sql`select id from "user" where email = ${email}`),
);
if (!u) {
  console.error(`no user with email ${email}; sign up first`);
  process.exit(1);
}
await withoutTenant(handle.db, (tx) => new DrizzleOperatorRepository(tx).grantOperator(u.id, null));
console.log(`${email} is now a platform operator (${u.id})`);
await handle.close();
