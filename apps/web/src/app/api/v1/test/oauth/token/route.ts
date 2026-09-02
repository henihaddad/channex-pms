import { notFound } from "@/server/errors";
import { publicRoute } from "@/server/public";
import { testHooksEnabled } from "@/server/test-hooks";

/** PMS_TEST_HOOKS=1 only: token exchange for the fake authorisation server. */
export const POST = publicRoute("test_hook", async (req) => {
  if (!testHooksEnabled()) throw notFound();
  const form = new URLSearchParams(await req.text());
  if (!form.get("code")?.startsWith("fake-code-"))
    return Response.json({ error: "invalid_grant" }, { status: 400 });
  return Response.json({
    access_token: `at-${form.get("code") ?? ""}`,
    refresh_token: "rt-fake",
    expires_in: 3600,
    account_label: "Fake Airbnb host",
  });
});
