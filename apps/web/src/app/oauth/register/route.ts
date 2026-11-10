import { publicRoute } from "@/server/public";
import { preflight, registerClient } from "@/server/oauth";

/** RFC 7591 dynamic client registration for MCP clients (spec 04 §4.7b). */
export const POST = publicRoute("oauth", (req) => registerClient(req));
export const OPTIONS = publicRoute("oauth", async () => preflight());
