import { z } from "zod";
import { publicRoute } from "@/server/public";
import { totpFlow } from "@/server/auth-flows";
import { badRequest } from "@/server/errors";

export const POST = publicRoute("auth", async (req) => {
  const parsed = z.object({ code: z.string().min(6) }).safeParse(await req.json());
  if (!parsed.success) throw badRequest("Validation failed", parsed.error.issues);
  return Response.json(await totpFlow(parsed.data.code));
});
