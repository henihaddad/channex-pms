import type { NextRequest } from "next/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { HttpProblem } from "../errors";
import { invalidApiKey, resolvePresentedKey, runAsApiKey, type ApiKeyPrincipal } from "../api-key";
import { invoke, type Op } from "./op";
import { OPS } from "./ops";

const INSTRUCTIONS = `OTAbridge is the host's channel manager: it holds the calendar (prices, availability, restrictions), reservations, guest conversations and reviews for every property, and pushes changes to Airbnb, Booking.com and the other connected channels.
Start with get_today or list_properties. Ids returned by one tool are what the others take; write tools that change a property also need its propertyId.
Money is always an integer in minor units of the property's currency (12000 = 120.00 EUR). Dates are YYYY-MM-DD; a range is firstNight..lastNight, both included.
Write tools act immediately and are recorded in the host's activity log under this API key. Before sending a guest message, replying to a review or cancelling, be sure the host asked for it.`;

/** Which access level would allow a permission this key lacks, in the words of Settings → API & AI. */
function accessFor(permission: string): string {
  if (/^(ari|rate_plan|room_type):/.test(permission)) return "Prices & availability or Full access";
  if (/^(message|review|template):/.test(permission)) return "Messages or Full access";
  return "Full access";
}

const ACCESS_LABEL: Record<string, string> = {
  full: "Full access",
  read_only: "Read only",
  messages: "Messages only",
  prices: "Prices & availability only",
};

/** A refusal or failure as a tool error the model can read and act on, never a protocol error. */
export function toolError(e: unknown, principal: ApiKeyPrincipal): CallToolResult {
  let text = "Something went wrong on our side; try again in a moment.";
  if (e instanceof HttpProblem) {
    if (e.status === 403 && e.code === "forbidden") {
      const missing = String(e.extras.missing ?? "");
      const level = ACCESS_LABEL[principal.scopes[0] ?? ""] ?? "this access level";
      text = `Not allowed: this API key ("${principal.name}", ${level}) does not include ${missing}. The host can create a key with ${accessFor(missing)} on Settings → API & AI.`;
    } else {
      text = [e.title, e.detail, e.extras.issues ? JSON.stringify(e.extras.issues) : ""]
        .filter(Boolean)
        .join(": ");
    }
  } else if (e instanceof Error && e.name === "DomainError") text = e.message;
  else console.error("[pms] mcp tool failed", e instanceof Error ? e.message : e);
  return { content: [{ type: "text", text }], isError: true };
}

/** A fresh server per request (stateless Streamable HTTP): the tools, each through `withPermission`. */
function buildServer(principal: ApiKeyPrincipal): McpServer {
  const server = new McpServer(
    { name: "otabridge", title: "OTAbridge", version: "0.1.0" },
    { instructions: INSTRUCTIONS },
  );
  for (const o of OPS as readonly Op[])
    server.registerTool(
      o.name,
      {
        title: o.title,
        description: o.description,
        inputSchema: o.schema,
        annotations: {
          title: o.title,
          readOnlyHint: !o.write,
          destructiveHint: o.destructive ?? false,
          idempotentHint: !o.write || o.rest.method === "PUT",
          openWorldHint: o.write,
        },
      },
      async (args: unknown): Promise<CallToolResult> => {
        try {
          const out = await invoke(o, args);
          return { content: [{ type: "text", text: JSON.stringify(out) }] };
        } catch (e) {
          return toolError(e, principal);
        }
      },
    );
  return server;
}

/** The key from `Authorization: Bearer otab_…`, or the last path segment for clients that cannot set headers. */
function presentedKey(req: NextRequest, fromPath?: string): string | null {
  if (fromPath) return fromPath;
  const auth = req.headers.get("authorization");
  return auth?.startsWith("Bearer ") ? auth.slice(7).trim() : null;
}

/**
 * The remote MCP server (spec 04 §4.7b): Streamable HTTP, stateless, JSON responses. The key
 * is resolved once per request; every tool call inside runs as that key's service account.
 */
export async function handleMcp(req: NextRequest, fromPath?: string): Promise<Response> {
  const secret = presentedKey(req, fromPath);
  const principal = secret ? await resolvePresentedKey(secret, "mcp") : null;
  if (!principal) {
    const res = invalidApiKey().toResponse();
    res.headers.set("www-authenticate", 'Bearer realm="otabridge"');
    return res;
  }
  return runAsApiKey(principal, async () => {
    const server = buildServer(principal);
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    await server.connect(transport);
    try {
      return await transport.handleRequest(req);
    } finally {
      await server.close();
    }
  });
}
