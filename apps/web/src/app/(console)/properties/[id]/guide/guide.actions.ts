"use server";

import { revalidatePath } from "next/cache";
import { guideSectionSpec, withSection, type GuideSection } from "@pms/core";
import { DrizzleGuideRepository } from "@pms/db";
import { withPermission } from "@/server/with-permission";
import { HttpProblem } from "@/server/errors";

const propertyScope = {
  scope: "property" as const,
  resolveScope: (fd: FormData) => ({ kind: "property" as const, id: String(fd.get("propertyId")) }),
};
const str = (fd: FormData, k: string): string => String(fd.get(k) ?? "").trim();
const locale = (fd: FormData): string =>
  /^[a-z]{2}$/.test(str(fd, "locale")) ? str(fd, "locale") : "en";
const back = (fd: FormData) => revalidatePath(`/properties/${str(fd, "propertyId")}/guide`);

/**
 * "Save section" (spec 10 §10.6b): one section off the form — its body, heading, the spec's
 * fields and whether it waits for the access window — written into the guide with every other
 * section left as it was. Property content, so `property:publish_content`.
 */
export const saveGuideSectionAction = withPermission<[FormData], void>(
  "property:publish_content",
  propertyScope,
  async (ctx, fd) => {
    const spec = guideSectionSpec(str(fd, "kind"));
    if (!spec) throw new HttpProblem(422, "invalid", "Unknown guide section");
    const section: GuideSection = {
      kind: spec.kind,
      heading: str(fd, "heading") || null,
      body: str(fd, "body"),
      fields: Object.fromEntries(spec.fields.map((f) => [f, str(fd, `field.${f}`)])),
      sensitive: fd.get("sensitive") === "on",
    };
    const repo = new DrizzleGuideRepository(ctx.tx, ctx.orgId);
    const propertyId = str(fd, "propertyId");
    const existing = await repo.get(propertyId, locale(fd));
    await repo.save(
      propertyId,
      locale(fd),
      { sections: withSection(existing?.sections, section) },
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
