import { notFound } from "@/server/errors";
import { publicRoute } from "@/server/public";
import { testHooksEnabled } from "@/server/test-hooks";

/** PMS_TEST_HOOKS=1 only: a fake OAuth authorisation server that consents immediately. */
export const GET = publicRoute("test_hook", async (req) => {
  if (!testHooksEnabled()) throw notFound();
  const redirect = req.nextUrl.searchParams.get("redirect_uri") ?? "";
  const state = req.nextUrl.searchParams.get("state") ?? "";
  const url = new URL(redirect);
  url.searchParams.set("code", `fake-code-${state.slice(0, 6)}`);
  url.searchParams.set("state", state);
  return Response.redirect(url.toString(), 302);
});
