import { publicRoute } from "@/server/public";
import { preflight, revocationEndpoint } from "@/server/oauth";

/** RFC 7009 token revocation (spec 04 §4.7b). */
export const POST = publicRoute("oauth", (req) => revocationEndpoint(req));
export const OPTIONS = publicRoute("oauth", async () => preflight());
