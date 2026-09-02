"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { sql, rawRows } from "@pms/db";
import { withPermission } from "@/server/with-permission";

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

export const updateOrganization = withPermission<
  [{ error?: string }, FormData],
  { error?: string; saved?: true }
>(
  "org:update",
  {
    scope: "organization",
    subject: () => ({ kind: "organization", id: "current" }),
    auditInput: (_prev, fd) => ({ name: fd.get("name"), locale: fd.get("locale") }),
  },
  async (ctx, _prev, fd) => {
    const parsed = z
      .object({ name: z.string().min(1).max(120), locale: z.enum(["en", "fr", "ar"]) })
      .safeParse({ name: fd.get("name"), locale: fd.get("locale") });
    if (!parsed.success) return { error: parsed.error.issues.map((i) => i.message).join("; ") };
    await ctx.tx.execute(
      sql`update organization set name = ${parsed.data.name}, locale = ${parsed.data.locale}, updated_at = now() where id = ${ctx.orgId}`,
    );
    revalidatePath("/settings/organization");
    return { saved: true };
  },
);
