"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { DrizzlePlatformRepository, type PluginRow } from "@pms/db";
import { installPlugin } from "@pms/jobs";
import type { PluginManifest } from "@pms/core";
import { withPermission } from "@/server/with-permission";
import { container } from "@/server/container";
import { HttpProblem } from "@/server/errors";

const str = (fd: FormData, k: string): string => String(fd.get(k) ?? "").trim();

export const loadPlugins = withPermission<
  [],
  { plugins: PluginRow[]; deliveries: Awaited<ReturnType<DrizzlePlatformRepository["deliveries"]>> }
>("plugin:read", { scope: "organization", audit: false }, async (ctx) => {
  const c = await container();
  const repo = new DrizzlePlatformRepository(ctx.tx, ctx.orgId, c.crypto);
  return { plugins: await repo.plugins(), deliveries: await repo.deliveries() };
});

/** Install (§12.7): the manifest pasted in, or fetched from `<endpoint>/manifest`; the secret is shown once. */
export const installPluginAction = withPermission<
  [{ secret?: string; error?: string }, FormData],
  { secret?: string; error?: string }
>(
  "plugin:install",
  {
    scope: "organization",
    subject: (_p, fd) => ({ kind: "plugin", id: String(fd.get("endpointUrl")) }),
    auditInput: (_p, fd) => ({ endpoint: fd.get("endpointUrl") }),
  },
  async (ctx, _prev, fd) => {
    const c = await container();
    const t = await getTranslations("plugins");
    const endpointUrl = str(fd, "endpointUrl");
    let manifest: PluginManifest;
    const pasted = str(fd, "manifest");
    try {
      manifest = pasted ? (JSON.parse(pasted) as PluginManifest) : await fetchManifest(endpointUrl);
    } catch (e) {
      // what happened, and what to do about it; never the parser's or the HTTP client's own words
      return {
        error: pasted
          ? t("errors.manifestJson")
          : e instanceof HttpProblem
            ? t("errors.manifestUnreachable")
            : t("errors.endpoint"),
      };
    }
    if (!manifest.key || !Array.isArray(manifest.events))
      return { error: t("errors.manifestIncomplete") };
    const r = await installPlugin(c, ctx.tx, ctx.orgId, {
      manifest,
      endpointUrl,
      config: {},
      installedBy: ctx.userId,
    });
    revalidatePath("/settings/plugins");
    return { secret: r.secret };
  },
);

async function fetchManifest(endpointUrl: string): Promise<PluginManifest> {
  const url = new URL(endpointUrl);
  url.pathname = url.pathname.replace(/\/?$/, "/manifest");
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok)
    throw new HttpProblem(
      400,
      "manifest_unreachable",
      `manifest at ${url.toString()} answered ${String(res.status)}`,
    );
  return (await res.json()) as PluginManifest;
}

export const setPluginEnabledAction = withPermission<[FormData], void>(
  "plugin:configure",
  { scope: "organization", subject: (fd) => ({ kind: "plugin", id: String(fd.get("pluginId")) }) },
  async (ctx, fd) => {
    const c = await container();
    await new DrizzlePlatformRepository(ctx.tx, ctx.orgId, c.crypto).setPluginEnabled(
      str(fd, "pluginId"),
      fd.get("enabled") === "1",
    );
    revalidatePath("/settings/plugins");
  },
);

export const retryDeliveriesAction = withPermission<[FormData], void>(
  "plugin:configure",
  { scope: "organization", subject: (fd) => ({ kind: "plugin", id: String(fd.get("pluginId")) }) },
  async (ctx, fd) => {
    const c = await container();
    await new DrizzlePlatformRepository(ctx.tx, ctx.orgId, c.crypto).retryDeliveries(
      str(fd, "pluginId"),
    );
    revalidatePath("/settings/plugins");
  },
);
