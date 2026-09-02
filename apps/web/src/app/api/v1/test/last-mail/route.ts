import { notFound } from "@/server/errors";
import { publicRoute } from "@/server/public";
import { sentMail, testHooksEnabled } from "@/server/test-hooks";

/** PMS_TEST_HOOKS=1 only: the last mail of a template to an address (magic links, statements). */
export const GET = publicRoute("test_hook", async (req) => {
  if (!testHooksEnabled()) throw notFound();
  const url = new URL(req.url);
  const to = (url.searchParams.get("to") ?? "").toLowerCase();
  const template = url.searchParams.get("template") ?? "";
  const mail = [...sentMail]
    .reverse()
    .find((m) => m.template === template && m.to.toLowerCase() === to);
  if (!mail) return Response.json({ mail: null }, { status: 404 });
  return Response.json({ mail });
});
