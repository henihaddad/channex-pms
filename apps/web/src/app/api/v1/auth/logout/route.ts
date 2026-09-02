import { publicRoute } from "@/server/public";
import { logoutFlow } from "@/server/auth-flows";

export const POST = publicRoute("auth", async () => {
  await logoutFlow();
  return Response.json({ ok: true });
});
