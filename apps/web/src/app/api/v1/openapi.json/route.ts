import { publicRoute } from "@/server/public";
import { openApiDocument } from "@/api/openapi";

/** The API description is public; it lists nothing a caller could not learn from the spec. */
export const GET = publicRoute("catalogue", async (req) =>
  Response.json(openApiDocument(req.nextUrl.origin)),
);
