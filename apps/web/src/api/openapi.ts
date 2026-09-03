import { z } from "zod";
import {
  bulkSchema,
  gridQuerySchema,
  propertyInputSchema,
  rateEditSchema,
  restrictionEditSchema,
} from "./schemas";

const schema = (s: z.ZodType) =>
  z.toJSONSchema(s, { target: "openapi-3.0", unrepresentable: "any" }) as Record<string, unknown>;
const json = (ref: string) => ({
  content: { "application/json": { schema: { $ref: `#/components/schemas/${ref}` } } },
});
const problem = {
  description: "Problem (RFC 9457)",
  content: { "application/problem+json": { schema: { $ref: "#/components/schemas/Problem" } } },
};

/** OpenAPI 3.1 for /api/v1 (spec 04 §4.7). Generated from the same Zod schemas the handlers validate with. */
export function openApiDocument(baseUrl: string) {
  return {
    openapi: "3.1.0",
    info: {
      title: "OTAbridge API",
      version: "0.1.0",
      description:
        "Public API v1. Authenticate with the session cookie or `Authorization: Bearer <access token>` from POST /api/v1/auth/login; select the organization with `x-pms-org`.",
      license: {
        name: "Sustainable Use License",
        url: "https://github.com/henihaddad/channex-pms/blob/main/LICENSE.md",
      },
    },
    servers: [{ url: baseUrl }],
    security: [{ bearer: [] }, { cookie: [] }],
    components: {
      securitySchemes: {
        bearer: { type: "http", scheme: "bearer" },
        cookie: { type: "apiKey", in: "cookie", name: "pms_at" },
      },
      schemas: {
        Problem: {
          type: "object",
          properties: {
            type: { type: "string" },
            title: { type: "string" },
            status: { type: "integer" },
            detail: { type: "string" },
            missing: { type: "string" },
          },
        },
        PropertyInput: schema(propertyInputSchema.omit({ templateId: true })),
        PropertySummary: {
          type: "object",
          required: ["id", "title", "kind", "state", "currency", "timezone"],
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            kind: { type: "string", enum: ["single_unit", "multi_unit", "hotel"] },
            state: { type: "string" },
            currency: { type: "string" },
            timezone: { type: "string" },
            channexPropertyId: { type: ["string", "null"] },
            roomTypes: { type: "integer" },
            ratePlans: { type: "integer" },
            units: { type: "integer" },
            provisioningStep: { type: ["string", "null"] },
          },
        },
        GridQuery: schema(gridQuerySchema),
        Grid: {
          type: "object",
          properties: {
            from: { type: "string" },
            to: { type: "string" },
            properties: { type: "array", items: { type: "object" } },
          },
        },
        RateEdits: schema(rateEditSchema),
        RestrictionEdits: schema(restrictionEditSchema),
        EditResult: {
          type: "object",
          properties: {
            undoId: { type: ["string", "null"] },
            outcomes: { type: "array", items: { type: "object" } },
          },
        },
        BulkRequest: schema(bulkSchema),
        BulkResult: {
          type: "object",
          properties: {
            applied: { type: "boolean" },
            id: { type: ["string", "null"] },
            cellCount: { type: "integer" },
            warnings: { type: "array", items: { type: "string" } },
            blocked: { type: "array", items: { type: "string" } },
          },
        },
      },
    },
    paths: {
      "/api/v1/properties": {
        get: {
          operationId: "listProperties",
          summary: "List properties",
          responses: {
            "200": {
              description: "OK",
              content: {
                "application/json": {
                  schema: {
                    type: "array",
                    items: { $ref: "#/components/schemas/PropertySummary" },
                  },
                },
              },
            },
            "401": problem,
            "403": problem,
          },
        },
        post: {
          operationId: "createProperty",
          summary: "Create a property (MODEL-1)",
          requestBody: json("PropertyInput"),
          responses: {
            "201": {
              description: "Created",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/PropertySummary" } },
              },
            },
            "422": problem,
          },
        },
      },
      "/api/v1/ari/grid": {
        get: {
          operationId: "getGrid",
          summary: "Portfolio calendar grid",
          parameters: [
            { name: "from", in: "query", required: true, schema: { type: "string" } },
            { name: "to", in: "query", required: true, schema: { type: "string" } },
            {
              name: "propertyId",
              in: "query",
              schema: { type: "array", items: { type: "string" } },
            },
            { name: "groupId", in: "query", schema: { type: "string" } },
          ],
          responses: {
            "200": {
              description: "OK",
              content: { "application/json": { schema: { $ref: "#/components/schemas/Grid" } } },
            },
          },
        },
      },
      "/api/v1/ari/rates": {
        patch: {
          operationId: "editRates",
          summary: "Edit rates with expected_version (CAL-5)",
          requestBody: json("RateEdits"),
          responses: {
            "200": { description: "Applied", ...json("EditResult") },
            "409": {
              description: "Version conflict; outcomes carry both values",
              ...json("EditResult"),
            },
          },
        },
      },
      "/api/v1/ari/restrictions": {
        patch: {
          operationId: "editRestrictions",
          summary: "Edit restrictions",
          requestBody: json("RestrictionEdits"),
          responses: {
            "200": { description: "Applied", ...json("EditResult") },
            "409": { description: "Version conflict", ...json("EditResult") },
          },
        },
      },
      "/api/v1/ari/bulk": {
        post: {
          operationId: "bulkUpdate",
          summary: "Bulk update (dry run by default, BULK-1)",
          requestBody: json("BulkRequest"),
          responses: {
            "200": { description: "Plan or result", ...json("BulkResult") },
            "422": { description: "Blocked by guard rails", ...json("BulkResult") },
          },
        },
      },
      "/api/v1/ari/bulk/{id}/undo": {
        post: {
          operationId: "undoOperation",
          summary: "Undo a recorded operation (BULK-2)",
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string" } },
            { name: "propertyId", in: "query", required: true, schema: { type: "string" } },
          ],
          responses: { "200": { description: "Undone" }, "409": problem },
        },
      },
      "/api/v1/ari/events": {
        get: {
          operationId: "ariEvents",
          summary: "Server-sent events: cell sync states",
          responses: { "200": { description: "text/event-stream" } },
        },
      },
      "/api/v1/authz/permissions": {
        get: {
          operationId: "permissions",
          summary: "Permission catalogue (RBAC-8)",
          security: [],
          responses: { "200": { description: "OK" } },
        },
      },
    },
  };
}
