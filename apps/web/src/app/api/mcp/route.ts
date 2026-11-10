import { publicRoute } from "@/server/public";
import { handleMcp } from "@/server/agent/mcp";

/**
 * Remote MCP server (spec 04 §4.7b), Streamable HTTP, stateless. Public at the route: the
 * handler refuses any request without a live API key (`Authorization: Bearer otab_…`), and
 * each tool call is permission-checked and audited by `withPermission` as that key.
 */
export const POST = publicRoute("mcp", (req) => handleMcp(req));
export const GET = publicRoute("mcp", (req) => handleMcp(req));
export const DELETE = publicRoute("mcp", (req) => handleMcp(req));
