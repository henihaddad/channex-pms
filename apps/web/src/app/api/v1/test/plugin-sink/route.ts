import { createHmac, timingSafeEqual } from "node:crypto";
import { notFound } from "@/server/errors";
import { publicRoute } from "@/server/public";
import { testHooksEnabled } from "@/server/test-hooks";

/**
 * PMS_TEST_HOOKS=1 only: a plugin endpoint inside the app so end-to-end tests can watch
 * signed deliveries land. POST verifies the signature with the secret the test registered
 * (via `?secret=` on the GET), GET returns what arrived.
 */
declare global {
  var __pmsPluginSink:
    { secret: string; received: Array<{ event: string; valid: boolean }> } | undefined;
}
const sink = (globalThis.__pmsPluginSink ??= { secret: "", received: [] });

export const GET = publicRoute("test_hook", async (req) => {
  if (!testHooksEnabled()) throw notFound();
  const secret = new URL(req.url).searchParams.get("secret");
  if (secret) sink.secret = secret;
  return Response.json({ received: sink.received });
});

export const POST = publicRoute("test_hook", async (req) => {
  if (!testHooksEnabled()) throw notFound();
  const body = await req.text();
  const ts = req.headers.get("x-pms-timestamp") ?? "";
  const sig = req.headers.get("x-pms-signature") ?? "";
  const expected = `v1=${createHmac("sha256", sink.secret).update(`v1.${ts}.${body}`).digest("hex")}`;
  const valid =
    expected.length === sig.length && timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
  sink.received.push({ event: req.headers.get("x-pms-event") ?? "", valid });
  return Response.json({ ok: valid }, { status: valid ? 200 : 401 });
});
