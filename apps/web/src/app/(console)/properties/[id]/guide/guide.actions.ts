"use server";

import { revalidatePath } from "next/cache";
import { GUIDE_SECTIONS, type GuideSection } from "@pms/core";
import { DrizzleGuideRepository } from "@pms/db";
import { withPermission } from "@/server/with-permission";

const propertyScope = {
  scope: "property" as const,
  resolveScope: (fd: FormData) => ({ kind: "property" as const, id: String(fd.get("propertyId")) }),
};
const str = (fd: FormData, k: string): string => String(fd.get(k) ?? "").trim();
const locale = (fd: FormData): string =>
  /^[a-z]{2}$/.test(str(fd, "locale")) ? str(fd, "locale") : "en";
const back = (fd: FormData) => revalidatePath(`/properties/${str(fd, "propertyId")}/guide`);

/** Read the sections off the form: one body, one heading and the spec's fields per section. */
const sectionsFrom = (fd: FormData): GuideSection[] =>
  GUIDE_SECTIONS.map((spec) => ({
    kind: spec.kind,
    heading: str(fd, `heading.${spec.kind}`) || null,
    body: str(fd, `body.${spec.kind}`),
    fields: Object.fromEntries(spec.fields.map((f) => [f, str(fd, `field.${spec.kind}.${f}`)])),
    sensitive: fd.get(`sensitive.${spec.kind}`) === "on",
  }));

/** The guest guide (spec 10 §10.6b): property content, so `property:publish_content`. */
export const saveGuideAction = withPermission<[FormData], void>(
  "property:publish_content",
  propertyScope,
  async (ctx, fd) => {
    await new DrizzleGuideRepository(ctx.tx, ctx.orgId).save(
      str(fd, "propertyId"),
      locale(fd),
      { sections: sectionsFrom(fd) },
      ctx.userId,
    );
    back(fd);
  },
);

/** GUIDE-1: publishing is its own action, so a half-written guide never reaches a guest by accident. */
export const publishGuideAction = withPermission<[FormData], void>(
  "property:publish_content",
  propertyScope,
  async (ctx, fd) => {
    const repo = new DrizzleGuideRepository(ctx.tx, ctx.orgId);
    const propertyId = str(fd, "propertyId");
    const published = fd.get("published") === "1";
    const existing = await repo.get(propertyId, locale(fd));
    if (existing) await repo.setPublished(propertyId, locale(fd), published);
    else await repo.save(propertyId, locale(fd), { sections: [], published }, ctx.userId);
    back(fd);
  },
);
