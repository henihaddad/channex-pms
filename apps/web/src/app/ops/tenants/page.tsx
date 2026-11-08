import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { sumByCurrency, tenantMonthlyMinor } from "@pms/core";
import type { ReactNode } from "react";
import type { FleetHealth, TenantRow } from "@pms/db";
import {
  Button,
  Card,
  Chip,
  Facts,
  Input,
  PageHeader,
  SectionTabs,
  Stat,
  TBody,
  THead,
  Table,
  Td,
  Th,
  Tr,
  cn,
} from "@/components/ui";
import { amounts } from "@/components/finance";
import { money } from "@/lib/format";
import { withOperator } from "@/server/operator";
import { guard } from "@/server/guard";
import { compTenantAction, tenantEventAction } from "../ops.actions";

const loadTenants = withOperator<
  [string],
  { tenants: TenantRow[]; fleet: FleetHealth; channexEnv: string }
>("tenants.read", { audit: false }, async (ctx, q) => ({
  tenants: await ctx.repo.tenants(q),
  fleet: await ctx.repo.fleetHealth(),
  channexEnv: process.env.CHANNEX_ENV === "production" ? "production" : "staging",
}));

const DAY = 86_400_000;
/** Now, read once per request outside render (React compiler: render stays pure). */
const nowMs = () => Date.now();
const daysBetween = (fromIso: string, toMs: number) =>
  Math.floor((toMs - Date.parse(fromIso)) / DAY);

const FILTERS = ["all", "paying", "trials", "attention"] as const;
type Filter = (typeof FILTERS)[number];
const matches = (f: Filter, r: TenantRow) =>
  f === "all"
    ? true
    : f === "paying"
      ? tenantMonthlyMinor(r) > 0
      : f === "trials"
        ? r.state === "trial"
        : ["past_due", "suspended", "expired"].includes(r.state);

const STATE_TONE: Record<string, "success" | "info" | "warning" | "danger" | "default"> = {
  active: "success",
  trial: "info",
  past_due: "warning",
  expired: "warning",
  suspended: "danger",
  offboarding: "default",
};

/**
 * Tenants (spec 12 §12.1, design board "Operator · Tenants"): every organisation on the
 * hosted platform with its plan, what it pays, its state, activity and how many of its
 * properties are live; MRR and trials ending at the top; platform health and the latest
 * sign-ups below. No guest data anywhere (OPCON-1).
 */
export default async function TenantsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; show?: string }>;
}) {
  const sp = await searchParams;
  const t = await getTranslations("ops");
  const locale = await getLocale();
  const { tenants: rows, fleet, channexEnv } = await guard(() => loadTenants(sp.q ?? ""));
  const now = nowMs();
  const filter: Filter = (FILTERS as readonly string[]).includes(sp.show ?? "")
    ? (sp.show as Filter)
    : "all";
  const shown = rows.filter((r) => matches(filter, r));
  const monthly = (r: TenantRow) => tenantMonthlyMinor(r);
  const mrr = sumByCurrency(
    rows.map((r) => ({ currency: r.planCurrency ?? "EUR", minor: monthly(r) })),
  );
  const paying = rows.filter((r) => monthly(r) > 0).length;
  const trialsEnding = rows.filter(
    (r) =>
      r.state === "trial" &&
      r.trialEndsOn !== null &&
      Date.parse(`${r.trialEndsOn}T00:00:00Z`) - now <= 7 * DAY &&
      Date.parse(`${r.trialEndsOn}T23:59:59Z`) >= now,
  ).length;
  const live = rows.reduce((a, r) => a + r.liveProperties, 0);
  const units = rows
    .filter((r) => r.state === "active" || r.state === "past_due")
    .reduce((a, r) => a + r.activeUnits, 0);
  const country = (code: string) => {
    try {
      return new Intl.DisplayNames([locale], { type: "region" }).of(code) ?? code;
    } catch {
      return code;
    }
  };
  const ago = (iso: string | null) => {
    if (!iso) return "—";
    const min = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
    if (min < 60) return t("minAgo", { n: Math.max(1, min) });
    if (min < 24 * 60) return t("hAgo", { n: Math.round(min / 60) });
    const d = Math.floor(min / (24 * 60));
    return d === 1 ? t("yesterday") : t("dAgo", { n: d });
  };
  const plan = (r: TenantRow) => {
    if (r.state === "trial")
      return t("trialDay", { n: Math.max(1, daysBetween(r.createdAt, now) + 1) });
    if (r.state === "expired" && !r.planKey) return t("trialExpired");
    if (!r.planName) return "—";
    return `${r.planName} · ${t("unitsN", { n: r.activeUnits })}`;
  };
  const health: Array<[string, number]> = [
    [t("outboxUnpublished"), fleet.outboxUnpublished],
    [t("syncQueued"), fleet.syncQueued],
    [t("syncFailed"), fleet.syncFailed + fleet.syncDead],
    [t("webhooksPending"), fleet.webhooksPending],
    [t("providerErrors"), fleet.providerErrorsLast24h],
    [t("pluginDead"), fleet.pluginDeliveriesDead],
  ];
  const recent = [...rows].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 4);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("tenantsTitle")} description={t("tenantsLead")}>
        <SectionTabs
          ariaLabel={t("title")}
          items={[
            { href: "/ops/tenants", label: t("tenants") },
            { href: "/ops", label: t("fleet"), exact: true },
            { href: "/ops/jobs", label: t("jobs") },
            { href: "/ops/flags", label: t("flags") },
          ]}
        />
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5" data-testid="tenant-stats">
        <Stat
          label={t("tenants")}
          value={String(rows.length)}
          hint={t("tenantsHint", {
            active: rows.filter((r) => r.state === "active").length,
            trial: rows.filter((r) => r.state === "trial").length,
          })}
        />
        <Stat
          label={t("liveProperties")}
          value={String(live)}
          hint={t("ofProperties", { n: rows.reduce((a, r) => a + r.properties, 0) })}
        />
        <Stat
          label={t("mrr")}
          value={amounts(mrr, "EUR", locale)}
          hint={t("payingN", { n: paying })}
        />
        <Stat
          label={t("trialsEnding")}
          value={
            <span className={trialsEnding > 0 ? "text-warning" : undefined}>{trialsEnding}</span>
          }
          hint={t("trialsEndingHint")}
        />
        <Stat label={t("billedUnits")} value={String(units)} hint={t("billedUnitsHint")} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="flex flex-wrap gap-2" aria-label={t("filter")}>
          {FILTERS.map((f) => (
            <Link
              key={f}
              href={`/ops/tenants?${new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), ...(f === "all" ? {} : { show: f }) }).toString()}`}
              aria-current={filter === f ? "page" : undefined}
              className={cn(
                "inline-flex h-9 items-center rounded-full border px-3.5 text-sm font-semibold transition-colors",
                filter === f
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-surface text-foreground hover:bg-default",
              )}
            >
              {t(`show.${f}`)}
            </Link>
          ))}
        </nav>
        <form className="flex w-full max-w-xs gap-2">
          {filter !== "all" ? <input type="hidden" name="show" value={filter} /> : null}
          <Input
            name="q"
            defaultValue={sp.q ?? ""}
            placeholder={t("findTenant")}
            aria-label={t("search")}
            className="rounded-full"
          />
        </form>
      </div>

      <Table data-testid="tenants">
        <THead>
          <Tr className="hover:bg-transparent">
            <Th>{t("tenantColumn")}</Th>
            <Th>{t("plan")}</Th>
            <Th>{t("billing")}</Th>
            <Th>{t("state")}</Th>
            <Th>{t("lastActivity")}</Th>
            <Th>{t("propertiesLive")}</Th>
            <Th />
          </Tr>
        </THead>
        <TBody>
          {shown.length === 0 ? (
            <Tr>
              <Td colSpan={7} className="text-muted">
                {t("noTenants")}
              </Td>
            </Tr>
          ) : null}
          {shown.map((r) => (
            <Tr key={r.id} data-testid="tenant-row" data-state={r.state}>
              <Td>
                <span className="font-semibold text-foreground">{r.name}</span>
                <span className="block text-xs text-muted">
                  {r.slug} · {r.country}
                </span>
              </Td>
              <Td>{plan(r)}</Td>
              <Td className="tabular-nums">
                {monthly(r) > 0
                  ? t("perMonth", { amount: money(monthly(r), r.planCurrency ?? "EUR", locale) })
                  : r.planKey === "complimentary"
                    ? t("free")
                    : "—"}
              </Td>
              <Td>
                <Chip color={STATE_TONE[r.state] ?? "default"} size="sm">
                  {t.has(`states.${r.state}`) ? t(`states.${r.state}`) : r.state}
                </Chip>
                {r.openIncidents > 0 ? (
                  <Chip color="danger" size="sm" className="ms-1">
                    {t("p1N", { n: r.openIncidents })}
                  </Chip>
                ) : null}
              </Td>
              <Td className="whitespace-nowrap">{ago(r.lastActivityAt)}</Td>
              <Td className="tabular-nums">
                {r.properties} / {r.liveProperties}
                {r.pendingCells > 0 ? (
                  <span className="block text-xs text-warning">
                    {t("pendingCellsN", { n: r.pendingCells })}
                  </span>
                ) : null}
                {r.unackedBookings > 0 ? (
                  <span className="block text-xs text-warning">
                    {t("unackedN", { n: r.unackedBookings })}
                  </span>
                ) : null}
              </Td>
              <Td className="text-end whitespace-nowrap">
                <Link
                  href={`/ops/impersonation?orgId=${r.id}`}
                  className="text-xs text-accent hover:underline"
                >
                  {t("impersonation")}
                </Link>
                {r.planKey !== "complimentary" && r.state !== "offboarding" ? (
                  <form action={compTenantAction} className="inline">
                    <input type="hidden" name="orgId" value={r.id} />
                    <Button
                      type="submit"
                      variant="secondary"
                      className="ms-2"
                      size="sm"
                      data-testid="comp-tenant"
                    >
                      {t("comp")}
                    </Button>
                  </form>
                ) : null}
                {r.state === "suspended" ? (
                  <form action={tenantEventAction} className="inline">
                    <input type="hidden" name="orgId" value={r.id} />
                    <input type="hidden" name="event" value="reactivated" />
                    <Button type="submit" variant="secondary" className="ms-2" size="sm">
                      {t("reactivate")}
                    </Button>
                  </form>
                ) : null}
              </Td>
            </Tr>
          ))}
        </TBody>
      </Table>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card
          title={t("platformHealth")}
          actions={
            <Link href="/ops" className="text-[13px] font-semibold text-accent hover:underline">
              {t("fleet")}
            </Link>
          }
        >
          <Facts
            className="grid-cols-[1fr_auto] [&_dd]:justify-self-end"
            items={[
              [
                t("channexEnv"),
                <Chip key="e" color={channexEnv === "production" ? "success" : "warning"} size="sm">
                  {t(`env.${channexEnv}`)}
                </Chip>,
              ],
              ...health.map(([label, n]): [string, ReactNode] => [
                label,
                <Chip key={label} color={n === 0 ? "success" : "warning"} size="sm">
                  {n === 0 ? t("ok") : String(n)}
                </Chip>,
              ]),
            ]}
          />
        </Card>
        <Card title={t("recentSignups")}>
          <ul className="flex flex-col gap-3">
            {recent.map((r) => (
              <li key={r.id} className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <span className="block font-semibold text-foreground">{r.name}</span>
                  <span className="block text-xs text-muted">
                    {country(r.country)} ·{" "}
                    {r.properties === 0
                      ? t("noPropertyYet")
                      : t("propertiesN", { n: r.properties })}
                    {r.channelConnections > 0
                      ? ` · ${t("channelsN", { n: r.channelConnections })}`
                      : ""}
                    {r.state !== "trial" && r.state !== "active"
                      ? ` · ${t.has(`states.${r.state}`) ? t(`states.${r.state}`) : r.state}`
                      : ""}
                  </span>
                </div>
                <span className="shrink-0 text-xs text-muted">
                  {daysBetween(r.createdAt, now) === 0
                    ? t("today")
                    : t("dAgo", { n: daysBetween(r.createdAt, now) })}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
