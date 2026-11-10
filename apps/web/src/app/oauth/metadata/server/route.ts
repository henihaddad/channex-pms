import { publicRoute } from "@/server/public";
import { authorizationServerMetadata, preflight } from "@/server/oauth";

/**
 * RFC 8414 authorization server metadata, served at `/.well-known/oauth-authorization-server`
 * (a rewrite in next.config.ts). Spec 04 §4.7b.
 */
export const GET = publicRoute("oauth", async () => authorizationServerMetadata());
export const OPTIONS = publicRoute("oauth", async () => preflight());
