"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { sql, rawRows } from "@pms/db";
import { withPermission } from "@/server/with-permission";
import { LOCALES } from "@/i18n/request";

export interface OrgSettings {
  id: string;
  name: string;
  slug: string;
  country: string;
  defaultCurrency: string;
  locale: string;
  state: string;
}

export const loadOrganization = withPermission<[], OrgSettings>(
  "org:read",
  { scope: "organization", audit: false },
  async (ctx) => {
    const [row] = await rawRows<OrgSettings>(
      ctx.tx,
      sql`select id, name, slug, country, default_currency as "defaultCurrency", locale, state from organization where id = ${ctx.orgId}`,
    );
    if (!row) throw new Error("organization missing");
    return row;
  },
);

export interface OrgFormState {
  error?: string;
  fieldErrors?: { name?: string; locale?: string };
  saved?: true;
}

export const updateOrganization = withPermission<[OrgFormState, FormData], OrgFormState>(
  "org:update",
  {
    scope: "organization",
    subject: () => ({ kind: "organization", id: "current" }),
    auditInput: (_prev, fd) => ({ name: fd.get("name"), locale: fd.get("locale") }),
  },
  async (ctx, _prev, fd) => {
    const parsed = z
      .object({ name: z.string().trim().min(1).max(120), locale: z.enum(LOCALES) })
      .safeParse({ name: fd.get("name"), locale: fd.get("locale") });
    if (!parsed.success) {
      const t = await getTranslations("org");
      const bad = new Set(parsed.error.issues.map((i) => String(i.path[0])));
      return {
        error: t("errors.summary"),
        fieldErrors: {
          ...(bad.has("name") ? { name: t("errors.name") } : {}),
          ...(bad.has("locale") ? { locale: t("errors.locale") } : {}),
        },
      };
    }
    await ctx.tx.execute(
      sql`update organization set name = ${parsed.data.name}, locale = ${parsed.data.locale}, updated_at = now() where id = ${ctx.orgId}`,
    );
    revalidatePath("/settings/organization");
    return { saved: true };
  },
);
