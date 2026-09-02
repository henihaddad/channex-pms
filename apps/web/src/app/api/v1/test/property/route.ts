import { Id } from "@pms/core";
import { asSystem, schema } from "@pms/db";
import { container } from "@/server/container";
import { notFound } from "@/server/errors";
import { publicRoute } from "@/server/public";
import { testHooksEnabled } from "@/server/test-hooks";

/** PMS_TEST_HOOKS=1 only: create a live property with a webhook token so e2e can exercise the receiver. */
export const POST = publicRoute("test_hook", async (req) => {
  if (!testHooksEnabled()) throw notFound();
  const c = await container();
  const body = (await req.json()) as { orgId: string; secret?: string };
  const propertyId = Id.next();
  const token = c.crypto.randomToken(24);
  await asSystem(c.db.db, body.orgId, async (tx) => {
    await tx.insert(schema.property).values({
      id: propertyId,
      orgId: body.orgId,
      kind: "single_unit",
      title: "E2E Flat",
      currency: "EUR",
      timezone: "Europe/Lisbon",
      state: "live",
      webhookToken: token,
      webhookSecretEnc: body.secret ? await c.crypto.seal(body.secret) : null,
    });
  });
  return Response.json({ propertyId, token }, { status: 201 });
});
