import { z } from "zod";
import { publicRoute } from "@/server/public";
import { loginFlow } from "@/server/auth-flows";
import { badRequest } from "@/server/errors";

const schema = z.object({ email: z.string().email(), password: z.string().min(1) });

export const POST = publicRoute("auth", async (req) => {
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) throw badRequest("Validation failed", parsed.error.issues);
  return Response.json(await loginFlow(parsed.data.email, parsed.data.password));
});
