import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { isPermission } from "@pms/authz";
import { apiKeyPermissions, API_KEY_ACCESS_LEVELS } from "@pms/core";
import { PERMISSIONS } from "@pms/authz";
import { OPS } from "./ops";
import { opPaths } from "../../api/openapi";
import { HttpProblem } from "../errors";
import { toolError } from "./mcp";

const web = resolve(import.meta.dirname, "../../..");
const manifest = JSON.parse(readFileSync(resolve(web, "handlers.manifest.json"), "utf8")) as Array<{
  file: string;
  export: string;
  permission?: string;
}>;
const routeFile = (path: string) => `src/app${path.replace(/\{id\}/g, "[id]")}/route.ts`;

/**
 * The op table is the contract behind both doors (spec 04 §4.7a): every MCP tool has a REST
 * route with the same permission, and the OpenAPI document lists it.
 */
describe("agent operations", () => {
  it("has the tools the host's assistant needs, uniquely named", () => {
    const names = OPS.map((o) => o.name);
    expect(new Set(names).size).toBe(names.length);
    for (const n of names) expect(n).toMatch(/^[a-z]+(_[a-z]+)*$/);
    expect(names).toEqual(
      expect.arrayContaining([
        "list_properties",
        "get_calendar",
        "set_prices",
        "set_availability",
        "set_min_stay",
        "list_reservations",
        "get_reservation",
        "create_reservation",
        "cancel_reservation",
        "list_conversations",
        "read_conversation",
        "send_message",
        "add_note",
        "list_reviews",
        "reply_to_review",
        "list_channels",
        "get_sync_health",
        "get_today",
        "connect_airbnb",
        "list_airbnb_listings",
        "import_airbnb_listing",
        "activate_channel",
        "pause_channel",
        "resume_channel",
      ]),
    );
  });

  it("each REST door is a wrapped route with the op's own permission", () => {
    for (const o of OPS) {
      expect(isPermission(o.permission)).toBe(true);
      const file = routeFile(o.rest.path);
      expect(existsSync(resolve(web, file)), file).toBe(true);
      const entry = manifest.find((m) => m.file === file && m.export === o.rest.method);
      expect(entry?.permission, `${o.rest.method} ${file}`).toBe(o.permission);
    }
  });

  it("every write lands on a property scope and reads never claim to write", () => {
    for (const o of OPS) {
      if (o.write && o.orgWide) {
        expect(o.scope, o.name).toBe("organization");
        expect(o.rest.method).not.toBe("GET");
      } else if (o.write) {
        expect(o.scope, o.name).toBe("property");
        expect(o.resolveScope, o.name).toBeDefined();
        expect(o.rest.method).not.toBe("GET");
      } else expect(o.rest.method, o.name).toBe("GET");
    }
  });

  it("a read-only key holds no permission a write op needs", () => {
    const ro = new Set(apiKeyPermissions("read_only", PERMISSIONS));
    for (const o of OPS.filter((x) => x.write)) expect(ro.has(o.permission), o.name).toBe(false);
    // and every level can at least read something an op serves
    for (const level of API_KEY_ACCESS_LEVELS) {
      const ps = new Set(apiKeyPermissions(level, PERMISSIONS));
      expect(
        OPS.some((o) => ps.has(o.permission)),
        level,
      ).toBe(true);
    }
  });

  it("the OpenAPI document lists every operation", () => {
    const paths = opPaths();
    for (const o of OPS) expect(paths[o.rest.path]?.[o.rest.method.toLowerCase()]).toBeDefined();
  });

  it("a refusal reads as a tool error naming what the key lacks", () => {
    const r = toolError(
      new HttpProblem(403, "forbidden", "Permission denied", "Missing permission ari:update_rate", {
        missing: "ari:update_rate",
        reason: "no_grant",
      }),
      {
        orgId: "o",
        apiKeyId: "k",
        serviceAccountId: "s",
        name: "Claude",
        scopes: ["read_only"],
        createdBy: null,
        surface: "mcp",
        oauth: false,
      },
    );
    expect(r.isError).toBe(true);
    const text = (r.content[0] as { text: string }).text;
    expect(text).toContain("ari:update_rate");
    expect(text).toContain("Read only");
    expect(text).toContain("Prices & availability");
  });
});
