import { publicRoute } from "@/server/public";
import { preflight, tokenEndpoint } from "@/server/oauth";

/** OAuth 2.1 token endpoint: authorization_code with PKCE, and rotating refresh_token (spec 04 §4.7b). */
export const POST = publicRoute("oauth", (req) => tokenEndpoint(req));
export const OPTIONS = publicRoute("oauth", async () => preflight());
