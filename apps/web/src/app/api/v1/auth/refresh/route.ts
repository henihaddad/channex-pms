import { publicRoute } from "@/server/public";
import { refreshFlow } from "@/server/auth-flows";
import { unauthorized } from "@/server/errors";

export const POST = publicRoute("auth", async () => {
  if (!(await refreshFlow())) throw unauthorized();
  return Response.json({ ok: true });
});
