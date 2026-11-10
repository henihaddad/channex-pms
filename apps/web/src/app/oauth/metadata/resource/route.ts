import { publicRoute } from "@/server/public";
import { preflight, protectedResourceMetadata } from "@/server/oauth";

/**
 * RFC 9728 protected resource metadata for the MCP server, served at
 * `/.well-known/oauth-protected-resource` and `/.well-known/oauth-protected-resource/api/mcp`
 * (rewrites in next.config.ts). Spec 04 §4.7b.
 */
export const GET = publicRoute("oauth", async () => protectedResourceMetadata());
export const OPTIONS = publicRoute("oauth", async () => preflight());
