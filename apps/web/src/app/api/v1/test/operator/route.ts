import { DrizzleOperatorRepository, rawRows, sql, withoutTenant } from "@pms/db";
import { container } from "@/server/container";
import { notFound } from "@/server/errors";
import { publicRoute } from "@/server/public";
import { testHooksEnabled } from "@/server/test-hooks";

/** PMS_TEST_HOOKS=1 only: make a user a platform operator (production uses `pnpm operator:grant`). */
export const POST = publicRoute("test_hook", async (req) => {
  if (!testHooksEnabled()) throw notFound();
  const c = await container();
  const body = (await req.json()) as { email: string };
  const [u] = await withoutTenant(c.db.db, (tx) =>
    rawRows<{ id: string }>(
      tx,
      sql`select id from "user" where email = ${body.email.toLowerCase()}`,
    ),
  );
  if (!u) return Response.json({ error: "no such user" }, { status: 404 });
  await withoutTenant(c.db.db, (tx) => new DrizzleOperatorRepository(tx).grantOperator(u.id, null));
  return Response.json({ userId: u.id });
});
