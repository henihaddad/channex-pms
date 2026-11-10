import { publicRoute } from "@/server/public";
import { handleMcp } from "@/server/agent/mcp";

/**
 * The same MCP server with the key as the last path segment, for clients that cannot send a
 * header (a claude.ai custom connector without OAuth). The URL is the secret: Settings says so.
 */
const key = (p: Record<string, unknown>) => (typeof p.key === "string" ? p.key : "");
export const POST = publicRoute("mcp", (req, params) => handleMcp(req, key(params)));
export const GET = publicRoute("mcp", (req, params) => handleMcp(req, key(params)));
export const DELETE = publicRoute("mcp", (req, params) => handleMcp(req, key(params)));
