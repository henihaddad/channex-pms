import { z } from "zod";
import { publicRoute } from "@/server/public";
import { signUpFlow } from "@/server/auth-flows";
import { badRequest } from "@/server/errors";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(12),
  name: z.string().min(1),
  organizationName: z.string().min(1),
  slug: z.string().regex(/^[a-z0-9-]{3,40}$/),
  country: z.string().length(2),
  currency: z.string().length(3),
  locale: z.string().optional(),
});

export const POST = publicRoute("auth", async (req) => {
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) throw badRequest("Validation failed", parsed.error.issues);
  return Response.json(await signUpFlow(parsed.data), { status: 201 });
});
