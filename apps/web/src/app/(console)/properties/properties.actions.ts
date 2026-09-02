"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  createProperty,
  fromCsvRow,
  fromTemplate,
  Id,
  type Id as IdT,
  type PropertyInput,
  type PropertyTemplate,
} from "@pms/core";
import { DrizzlePropertyRepository, rawRows, sql, type PropertySummary } from "@pms/db";
import { withPermission, type ActorCtx } from "@/server/with-permission";
import { propertyInputSchema } from "@/api/schemas";
import { container } from "@/server/container";
import { HttpProblem } from "@/server/errors";

export const listProperties = withPermission<[], PropertySummary[]>(
  "property:read",
  { scope: "organization", audit: false },
  (ctx) => new DrizzlePropertyRepository(ctx.tx, ctx.orgId).list(),
);

export const listTemplates = withPermission<[], PropertyTemplate[]>(
  "template:read",
  { scope: "organization", audit: false },
  (ctx) => new DrizzlePropertyRepository(ctx.tx, ctx.orgId).listTemplates(),
);

export const listGroups = withPermission<[], Array<{ id: string; name: string; kind: string }>>(
  "group:read",
  { scope: "organization", audit: false },
  (ctx) => new DrizzlePropertyRepository(ctx.tx, ctx.orgId).listGroups(),
);

async function createInTx(ctx: ActorCtx, input: PropertyInput) {
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
    input,
  );
  if (!r.ok) throw new HttpProblem(422, r.error.code, r.error.message);
  await repo.saveProvisioning(r.value.property.id, {
    step: "group",
    refs: {},
    attempts: 0,
    lastError: null,
  });
  return r.value;
}

export interface CreateState {
  error?: string;
  createdId?: string;
}

/** Wizard submit (spec 03 §3.2, MODEL-1): a template pre-fills, the form overrides. */
export const createPropertyAction = withPermission<[CreateState, FormData], CreateState>(
  "property:create",
  {
    scope: "organization",
    subject: () => ({ kind: "property", id: "new" }),
    auditInput: (_p, fd) => ({ title: fd.get("title"), kind: fd.get("kind") }),
  },
  async (ctx, _prev, fd) => {
    const parsed = propertyInputSchema.safeParse({
      title: fd.get("title"),
      kind: fd.get("kind"),
      currency: fd.get("currency"),
      timezone: fd.get("timezone"),
      address: { city: String(fd.get("city") ?? ""), country: String(fd.get("country") ?? "") },
      groupIds: fd.getAll("groupIds").map(String).filter(Boolean),
      roomTypes: JSON.parse(String(fd.get("roomTypes") || "[]")) as unknown,
      ratePlans: JSON.parse(String(fd.get("ratePlans") || "[]")) as unknown,
      templateId: String(fd.get("templateId") ?? "") || undefined,
    });
    if (!parsed.success)
      return {
        error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      };
    const { templateId, ...rest } = parsed.data;
    const form: PropertyInput = { ...rest, groupIds: rest.groupIds as IdT[] | undefined };
    let input: PropertyInput = form;
    if (templateId) {
      const t = await new DrizzlePropertyRepository(ctx.tx, ctx.orgId).getTemplate(templateId);
      if (!t) return { error: "Template not found" };
      input = fromTemplate(t, {
        ...form,
        ...(form.ratePlans?.length ? {} : { ratePlans: t.payload.ratePlans }),
        ...(form.roomTypes?.length ? {} : { roomTypes: t.payload.roomTypes }),
      } as PropertyInput);
    }
    const created = await createInTx(ctx, input);
    revalidatePath("/properties");
    return { createdId: created.property.id };
  },
);

export interface ImportState {
  error?: string;
  created?: number;
  errors?: string[];
}

/** Bulk CSV import (spec 03 §3.2): title,kind,currency,timezone,city,country,base_rate,min_stay per row. */
export const importCsvAction = withPermission<[ImportState, FormData], ImportState>(
  "property:bulk_import",
  {
    scope: "organization",
    subject: () => ({ kind: "property", id: "import" }),
    auditInput: (_p, fd) => ({ bytes: String(fd.get("csv") ?? "").length }),
  },
  async (ctx, _prev, fd) => {
    const csv = String(fd.get("csv") ?? "").trim();
    const templateId = String(fd.get("templateId") ?? "");
    const [org] = await rawRows<{ default_currency: string }>(
      ctx.tx,
      sql`select default_currency from organization where id = ${ctx.orgId}`,
    );
    const lines = csv.split(/\r?\n/).filter((l) => l.trim());
    const header = (lines.shift() ?? "").split(",").map((h) => h.trim().toLowerCase());
    if (!header.includes("title"))
      return { error: "CSV needs a header row with at least a title column" };
    const template = templateId
      ? await new DrizzlePropertyRepository(ctx.tx, ctx.orgId).getTemplate(templateId)
      : null;
    const errors: string[] = [];
    let created = 0;
    for (const [i, line] of lines.entries()) {
      const cells = line.split(",").map((c) => c.trim());
      const row = Object.fromEntries(header.map((h, j) => [h, cells[j] ?? ""]));
      const parsed = fromCsvRow(row, {
        currency: org?.default_currency ?? "EUR",
        timezone: String(fd.get("timezone") || "UTC"),
      });
      if (!parsed.ok) {
        errors.push(`row ${String(i + 2)}: ${parsed.error.message}`);
        continue;
      }
      const input = template
        ? fromTemplate(template, { ...parsed.value, ratePlans: parsed.value.ratePlans })
        : parsed.value;
      await createInTx(ctx, input);
      created++;
    }
    revalidatePath("/properties");
    return { created, errors };
  },
);

export const saveTemplateAction = withPermission<[FormData], void>(
  "template:manage",
  {
    scope: "organization",
    subject: (fd) => ({ kind: "property_template", id: String(fd.get("templateName")) }),
  },
  async (ctx, fd) => {
    const payload = propertyInputSchema
      .omit({ title: true, address: true, groupIds: true, templateId: true })
      .safeParse({
        kind: fd.get("kind"),
        currency: fd.get("currency"),
        timezone: fd.get("timezone"),
        roomTypes: JSON.parse(String(fd.get("roomTypes") || "[]")) as unknown,
        ratePlans: JSON.parse(String(fd.get("ratePlans") || "[]")) as unknown,
      });
    if (!payload.success)
      throw new HttpProblem(
        422,
        "invalid_template",
        payload.error.issues.map((i) => i.message).join("; "),
      );
    await new DrizzlePropertyRepository(ctx.tx, ctx.orgId).insertTemplate({
      id: Id.next(),
      name: String(fd.get("templateName") || "Template"),
      payload: payload.data,
      createdBy: ctx.userId,
    });
    revalidatePath("/properties");
  },
);

/** Clone: the source property's shape, new title (spec 03 §3.2). */
export const clonePropertyAction = withPermission<[FormData], { createdId: string }>(
  "property:clone",
  {
    scope: "organization",
    subject: (fd) => ({ kind: "property", id: String(fd.get("sourceId")) }),
  },
  async (ctx, fd) => {
    const repo = new DrizzlePropertyRepository(ctx.tx, ctx.orgId);
    const src = await repo.get(String(fd.get("sourceId")));
    if (!src) throw new HttpProblem(404, "not_found", "Property not found");
    const base = src.ratePlans.filter((r) => !r.parentRatePlanId);
    const created = await createInTx(ctx, {
      title: String(fd.get("title")),
      kind: src.property.kind,
      currency: src.property.currency,
      timezone: src.property.timezone,
      address: src.property.address,
      roomTypes: src.roomTypes.map((r) => ({
        title: r.title,
        countOfRooms: r.countOfRooms,
        occAdults: r.occAdults,
        occChildren: r.occChildren,
      })),
      ratePlans: base.map((r) => ({
        title: r.title,
        roomTypeTitle: src.roomTypes.find((t) => t.id === r.roomTypeId)?.title ?? "",
        baseRateMinor: 10000,
      })),
    });
    revalidatePath("/properties");
    return { createdId: created.property.id };
  },
);

/** Q7: adopt an existing Channex property. Provider ids are recorded; provisioning resumes at the webhook step. */
export const adoptPropertyAction = withPermission<[CreateState, FormData], CreateState>(
  "property:create",
  {
    scope: "organization",
    subject: (_p, fd) => ({
      kind: "property",
      id: `channex:${String(fd.get("channexPropertyId"))}`,
    }),
  },
  async (ctx, _prev, fd) => {
    const c = await container();
    const remoteId = String(fd.get("channexPropertyId") ?? "").trim();
    if (!remoteId) return { error: "Channex property id is required" };
    const imp = await c.provider.importProperty(
      { id: remoteId },
      { dedupeKey: `adopt:${remoteId}`, requestId: ctx.requestId },
    );
    const kind =
      imp.roomTypes.length === 1 && imp.roomTypes[0]!.countOfRooms === 1
        ? "single_unit"
        : "multi_unit";
    const created = await createInTx(ctx, {
      title: imp.property.title,
      kind,
      currency: imp.property.currency,
      timezone: imp.property.timezone,
      ...(kind === "multi_unit"
        ? {
            roomTypes: imp.roomTypes.map((r) => ({
              title: r.title,
              countOfRooms: r.countOfRooms,
              occAdults: r.occAdults,
              occChildren: r.occChildren,
            })),
          }
        : {}),
      ratePlans: imp.ratePlans
        .filter((r) => !r.parentRatePlanId)
        .map((r) => ({
          title: r.title,
          roomTypeTitle: imp.roomTypes.find((t) => t.id === r.roomTypeId)?.title ?? "",
          baseRateMinor: 10000,
        })),
    });
    const repo = new DrizzlePropertyRepository(ctx.tx, ctx.orgId);
    const rtMap = created.roomTypes.map((rt, i) => ({
      local: rt.id,
      remote: imp.roomTypes[kind === "single_unit" ? 0 : i]!.id,
    }));
    const rpMap = created.ratePlans.map((rp) => ({
      local: rp.id,
      remote: imp.ratePlans.find((r) => r.title === rp.title && !r.parentRatePlanId)!.id,
    }));
    await repo.setRemoteIds({
      propertyId: { local: created.property.id, remote: remoteId },
      roomTypes: rtMap,
      ratePlans: rpMap,
    });
    await repo.saveProvisioning(created.property.id, {
      step: "webhook",
      attempts: 0,
      lastError: null,
      refs: {
        property: remoteId,
        ...Object.fromEntries(rtMap.map((r) => [`rt:${r.local}`, r.remote])),
        ...Object.fromEntries(rpMap.map((r) => [`rp:${r.local}`, r.remote])),
      },
    });
    revalidatePath("/properties");
    return { createdId: created.property.id };
  },
);
