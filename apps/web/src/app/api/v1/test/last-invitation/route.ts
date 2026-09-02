import { publicRoute } from "@/server/public";
import { sentMail, testHooksEnabled } from "@/server/test-hooks";
import { notFound } from "@/server/errors";

export const dynamic = "force-dynamic";

/** Only with PMS_TEST_HOOKS=1: the last invitation token mailed to an address. */
export const GET = publicRoute("test_hook", async (req) => {
  if (!testHooksEnabled()) throw notFound();
  const email = new URL(req.url).searchParams.get("email")?.toLowerCase();
  const mail = [...sentMail]
    .reverse()
    .find((m) => m.template === "invitation" && m.to.toLowerCase() === email);
  if (!mail) throw notFound();
  return Response.json({ orgId: mail.params.orgId, token: mail.params.token });
});
