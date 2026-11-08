import Link from "next/link";
import { getTranslations } from "next-intl/server";
import {
  INTEGRATIONS,
  INTEGRATION_GROUPS,
  integrationState,
  type IntegrationEntry,
  type IntegrationState,
} from "@pms/core";
import { integrationUsage, type IntegrationUsage } from "@pms/jobs";
import { Chip, cn } from "@/components/ui";
import { container } from "@/server/container";
import { withPermission } from "@/server/with-permission";
import { guard } from "@/server/guard";

/**
 * What this deployment can actually reach, and what this organisation uses. Behind
 * `org:read` because it names the services the organisation has wired, which is nobody's
 * business but theirs.
 */
const loadIntegrations = withPermission<
  [],
  { configured: Record<string, boolean>; usage: IntegrationUsage; channexEnv: string }
>("org:read", { scope: "organization", audit: false }, async (ctx) => {
  const c = await container();
  return {
    configured: {
      stripe_payments: Boolean(process.env.STRIPE_SECRET_KEY),
      stripe_connect: Boolean(process.env.STRIPE_SECRET_KEY),
      stripe_billing: Boolean(process.env.STRIPE_SECRET_KEY) && c.hosted,
      mail: c.config.MAIL_TRANSPORT !== "console",
      llm: c.llm.name !== "none",
    },
    usage: await integrationUsage(ctx.tx),
    channexEnv: process.env.CHANNEX_ENV === "production" ? "production" : "staging",
  };
});

const TONE: Record<IntegrationState, "success" | "default"> = {
  connected: "success",
  available: "default",
  planned: "default",
};
const FILTERS = ["all", "connected", "available", "planned"] as const;
type Filter = (typeof FILTERS)[number];

/**
 * Integrations (spec 12 §12.7b, design board "Settings — Integrations"). Every competitor's
 * integrations page is a wall of logos you cannot verify; this one says, per card, whether
 * it runs here for you (Connected), can be set up today (Available) or is only on the
 * roadmap (Planned), from the registry in core and the running container.
 */
export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>;
}) {
  const sp = await searchParams;
  const t = await getTranslations("integrations");
  const { configured, usage, channexEnv } = await guard(() => loadIntegrations());
  const inUse: Record<string, boolean | undefined> = {
    channex: usage.channelConnections > 0,
    booking_engine: usage.bookingSites > 0,
    pricing: usage.rateImports > 0,
    plugins: usage.plugins > 0,
  };
  const stateOf = (i: IntegrationEntry): IntegrationState =>
    integrationState(i, { configured: configured[i.key], inUse: inUse[i.key] });
  const filter: Filter = (FILTERS as readonly string[]).includes(sp.show ?? "")
    ? (sp.show as Filter)
    : "all";
  const count = (s: IntegrationState) => INTEGRATIONS.filter((i) => stateOf(i) === s).length;
  const shown = (i: IntegrationEntry) => filter === "all" || stateOf(i) === filter;

  const card = (i: IntegrationEntry) => {
    const state = stateOf(i);
    const chip =
      i.key === "channex" && state === "connected"
        ? t("connectedEnv", { env: t(`env.${channexEnv}`) })
        : t(`state.${state}`);
    const action =
      state === "planned"
        ? null
        : i.href
          ? { href: i.href, label: state === "connected" ? t("manage") : t("setUp") }
          : null;
    return (
      <li
        key={i.key}
        className="flex min-w-0 flex-col gap-2 rounded-card border border-border bg-surface p-4.5"
        data-testid="integration-card"
        data-state={state}
      >
        <div className="flex items-start justify-between gap-2">
          <strong className="text-[15px] font-bold text-foreground">{i.name}</strong>
          <Chip
            color={
              i.key === "channex" && state === "connected" && channexEnv !== "production"
                ? "warning"
                : TONE[state]
            }
            size="sm"
            data-testid={`integration-${i.key}`}
            data-status={i.status}
          >
            {chip}
          </Chip>
        </div>
        <p className="text-[13px] text-muted">{i.summary}</p>
        {i.configurable ? (
          <span className="sr-only" data-testid={`integration-configured-${i.key}`}>
            {configured[i.key] ? t("configured") : t("notConfigured")}
          </span>
        ) : null}
        <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-[13px]">
          {action ? (
            <Link href={action.href} className="font-semibold text-accent hover:underline">
              {action.label}
            </Link>
          ) : null}
          {i.configurable && !configured[i.key] && state !== "planned" ? (
            <span className="text-xs text-muted">{t("needsKey")}</span>
          ) : null}
          {i.status === "port" ? <span className="text-xs text-muted">{t("portHint")}</span> : null}
          {state === "planned" ? (
            <span className="text-xs text-muted">{t("onRoadmap")}</span>
          ) : null}
        </div>
      </li>
    );
  };

  return (
    <div className="flex flex-col gap-5">
      <nav className="flex flex-wrap gap-2" aria-label={t("filter")}>
        {FILTERS.map((f) => {
          const label =
            f === "all"
              ? t("all")
              : f === "planned"
                ? t("state.planned")
                : `${t(`state.${f}`)} · ${String(count(f))}`;
          return (
            <Link
              key={f}
              href={f === "all" ? "/settings/integrations" : `/settings/integrations?show=${f}`}
              aria-current={filter === f ? "page" : undefined}
              className={cn(
                "inline-flex h-9 items-center rounded-full border px-3.5 text-sm font-semibold transition-colors",
                filter === f
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-surface text-foreground hover:bg-default",
              )}
            >
              {label}
            </Link>
          );
        })}
      </nav>

      {INTEGRATION_GROUPS.map((g) => {
        const items = INTEGRATIONS.filter((i) => i.group === g && shown(i));
        if (items.length === 0) return null;
        return (
          <section key={g} className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-muted">{t(`group.${g}`)}</h2>
            <ul
              className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
              data-testid={`integrations-${g}`}
            >
              {items.map(card)}
            </ul>
          </section>
        );
      })}

      <p className="text-sm text-muted">
        {t("writeOne")}{" "}
        <Link href="/settings/plugins" className="font-semibold text-accent hover:underline">
          {t("plugins")}
        </Link>
        .
      </p>
    </div>
  );
}
