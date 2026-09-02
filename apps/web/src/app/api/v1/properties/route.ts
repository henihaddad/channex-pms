import { z } from "zod";
import { createProperty, type PropertyInput } from "@pms/core";
import { DrizzlePropertyRepository } from "@pms/db";
import { withPermission } from "@/server/with-permission";
import { container } from "@/server/container";
import { HttpProblem } from "@/server/errors";
import { propertyInputSchema } from "@/api/schemas";

export const GET = withPermission.route(
  "property:read",
  { scope: "organization", audit: false, input: () => ({}) },
  async (ctx) => Response.json(await new DrizzlePropertyRepository(ctx.tx, ctx.orgId).list()),
);

const bodySchema = propertyInputSchema.omit({ templateId: true });

export const POST = withPermission.route<z.infer<typeof bodySchema>>(
  "property:create",
  {
    scope: "organization",
    input: async (req) => bodySchema.parse(await req.json()),
    subject: (b) => ({ kind: "property", id: b.title }),
  },
  async (ctx, body) => {
    const c = await container();
    const repo = new DrizzlePropertyRepository(ctx.tx, ctx.orgId);
    const r = await createProperty(
      {
        repo,
        clock: c.clock,
        orgId: ctx.orgId,
        webhookCredentials: async () => ({
          token: c.crypto.randomToken(24),
          secretSealed: await c.crypto.seal(c.crypto.randomToken(32)),
        }),
      },
      body as PropertyInput,
    );
    if (!r.ok) throw new HttpProblem(422, r.error.code, r.error.message);
    await repo.saveProvisioning(r.value.property.id, {
      step: "group",
      refs: {},
      attempts: 0,
      lastError: null,
    });
    return Response.json(
      {
        ...r.value.property,
        roomTypes: r.value.roomTypes.length,
        ratePlans: r.value.ratePlans.length,
        units: r.value.units.length,
      },
      { status: 201 },
    );
  },
);
