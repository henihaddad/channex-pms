import { notFound } from "@/server/errors";
import { publicRoute } from "@/server/public";
import { testHooksEnabled } from "@/server/test-hooks";

/** PMS_TEST_HOOKS=1 only: stands in for Channex's embedded channel screen so the connect page can be exercised without Channex. */
export const GET = publicRoute("test_hook", async (req) => {
  if (!testHooksEnabled()) throw notFound();
  const u = new URL(req.url);
  const html = `<!doctype html><html><body style="font-family:sans-serif;padding:24px"><h1 data-testid="fake-channex-screen">Channex channel screen (fake)</h1><p>property ${u.searchParams.get("property_id") ?? ""} · session ${u.searchParams.get("oauth_session_key") ?? ""}</p></body></html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
});
