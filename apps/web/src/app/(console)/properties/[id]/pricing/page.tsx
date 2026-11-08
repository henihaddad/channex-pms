import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AUTOMATED_RATE_SOURCES } from "@pms/core";
import { DrizzleRateImportRepository, rawRows, sql, type RateImportSettings } from "@pms/db";
import {
  Alert,
  Card,
  Chip,
  Field,
  Label,
  PageHeader,
  Select,
  Stat,
  Table,
  TBody,
  Td,
  Th,
  THead,
  Tr,
} from "@/components/ui";
import { withPermission } from "@/server/with-permission";
import { day, elapsed, money } from "@/lib/format";
import { ImportForm } from "./import-form";
import { saveRateImportAction } from "./pricing.actions";

type PlanRow = {
  id: string;
  title: string;
  parentTitle: string | null;
  derivedOption: { kind: string; direction: string; value: number } | null;
  todayRate: number | null;
  todaySource: string | null;
};

const loadPricing = withPermission<
  [{ propertyId: string; today: string }],
  {
    title: string;
    currency: string;
    settings: RateImportSettings;
    ratePlans: Array<{ id: string; title: string }>;
    plans: PlanRow[];
    lastImport: { at: string; cellCount: number } | null;
    byHand: number;
    outside: Array<{ date: string; plan: string; rate: number }>;
  } | null
>(
  "yield_rule:read",
  {
    scope: "property",
    resolveScope: (i) => ({ kind: "property", id: i.propertyId }),
    audit: false,
  },
  async (ctx, { propertyId, today }) => {
    const [p] = await rawRows<{ title: string; currency: string }>(
      ctx.tx,
      sql`select title, currency from property where id = ${propertyId} and archived_at is null`,
    );
    if (!p) return null;
    const settings = await new DrizzleRateImportRepository(ctx.tx, ctx.orgId).get(propertyId);
    const automated = sql.join(
      AUTOMATED_RATE_SOURCES.map((s) => sql`${s}`),
      sql`, `,
    );
    const plans = await rawRows<PlanRow>(
      ctx.tx,
      sql`select rp.id, rp.title, parent.title as "parentTitle", rp.derived_option as "derivedOption",
          (rd.values->>'rate')::bigint as "todayRate", rd.source as "todaySource"
        from rate_plan rp left join rate_plan parent on parent.id = rp.parent_rate_plan_id
        left join rate_day rd on rd.rate_plan_id = rp.id and rd.date = ${today}
        where rp.property_id = ${propertyId} and rp.archived_at is null
        order by (rp.parent_rate_plan_id is not null), rp.title`,
    );
    const [last] = await rawRows<{ at: string; cellCount: number }>(
      ctx.tx,
      sql`select created_at::text as at, cell_count as "cellCount" from bulk_operation
        where property_id = ${propertyId} and input->>'kind' = 'rate_import' and state = 'applied'
        order by created_at desc limit 1`,
    );
    const [hand] = await rawRows<{ n: number }>(
      ctx.tx,
      sql`select count(*)::int as n from rate_day rd join rate_plan rp on rp.id = rd.rate_plan_id
        where rd.property_id = ${propertyId} and rp.parent_rate_plan_id is null and rd.date >= ${today}
          and rd.source not in (${automated})`,
    );
    const floor = settings.guardRails.floorMinor ?? null;
    const ceiling = settings.guardRails.ceilingMinor ?? null;
    const outside =
      floor === null && ceiling === null
        ? []
        : await rawRows<{ date: string; plan: string; rate: number }>(
            ctx.tx,
            sql`select rd.date::text as date, rp.title as plan, (rd.values->>'rate')::bigint as rate
              from rate_day rd join rate_plan rp on rp.id = rd.rate_plan_id
              where rd.property_id = ${propertyId} and rp.parent_rate_plan_id is null and rd.date >= ${today} and rd.values ? 'rate'
                and ((${floor}::bigint is not null and (rd.values->>'rate')::bigint < ${floor}::bigint)
                  or (${ceiling}::bigint is not null and (rd.values->>'rate')::bigint > ${ceiling}::bigint))
              order by rd.date limit 12`,
          );
    return {
      title: p.title,
      currency: p.currency,
      settings,
      ratePlans: plans
        .filter((x) => x.parentTitle === null)
        .map((x) => ({ id: x.id, title: x.title })),
      plans: plans.map((x) => ({
        ...x,
        todayRate: x.todayRate === null ? null : Number(x.todayRate),
      })),
      lastImport: last ?? null,
      byHand: hand?.n ?? 0,
      outside: outside.map((o) => ({ ...o, rate: Number(o.rate) })),
    };
  },
);

const PROVIDER: Record<string, string> = {
  csv: "CSV",
  pricelabs: "PriceLabs",
  wheelhouse: "Wheelhouse",
};
/** The worker pulls every scheduled engine at 02:40 UTC (spec 06 §6.5b, `rates.import`). */
const PULL_AT = "02:40";

/**
 * Rate import (spec 06 §6.5b): prices from PriceLabs, Wheelhouse or a spreadsheet, through
 * the guard rails and the same dry run and undo as a bulk edit. It leads with where prices
 * come from and when, then the rails per rate plan and the nights that sit outside them.
 */
export default async function PricingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const today = new Date().toISOString().slice(0, 10);
  const d = await loadPricing({ propertyId: id, today });
  if (!d) notFound();
  const t = await getTranslations("pricing");
  const tp = await getTranslations("properties");
  const s = d.settings;
  const refs = Object.keys(s.mapping);
  const provider = PROVIDER[s.provider] ?? s.provider;
  const scheduled = s.enabled && s.provider !== "csv";
  const floor = s.guardRails.floorMinor ?? null;
  const ceiling = s.guardRails.ceilingMinor ?? null;
  const major = (m: number | null) => (m === null ? "" : (m / 100).toFixed(2));
  const now = new Date();
  const pullToday = `${today}T${PULL_AT}:00Z`;
  const nextPullToday = now.toISOString() < pullToday;
  const when = (iso: string) => {
    const date = iso.slice(0, 10);
    const label =
      date === today
        ? t("today")
        : date === new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10)
          ? t("yesterday")
          : day(date);
    return `${label} ${iso.slice(11, 16)}`;
  };
  const sourceName = (src: string | null) =>
    src === null
      ? "—"
      : src === "rate_import"
        ? provider
        : src === "derived"
          ? t("sourceDerived")
          : (AUTOMATED_RATE_SOURCES as readonly string[]).includes(src)
            ? t("sourceDefault")
            : t("sourceHand");
  const tabs = [
    { href: `/properties/${id}`, label: t("tabOverview") },
    { href: `/properties/${id}/guide`, label: t("tabGuide") },
    { href: `/properties/${id}/pricing`, label: t("tabPricing"), active: true },
    { href: `/properties/${id}/booking-engine`, label: t("tabBookingEngine") },
    { href: `/calendar/settings?propertyId=${id}`, label: t("tabPricingSettings") },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        crumb={[
          { href: "/properties", label: tp("title") },
          { href: `/properties/${id}`, label: d.title },
          { label: t("tabPricing") },
        ]}
        title={t("tabPricing")}
      />
      <nav
        aria-label={d.title}
        className="-mt-2 flex gap-1 overflow-x-auto border-b border-border text-sm"
        data-testid="property-tabs"
      >
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={tab.active ? "page" : undefined}
            className={`-mb-px border-b-2 px-3.5 py-2.5 whitespace-nowrap no-underline ${tab.active ? "border-accent font-semibold text-foreground" : "border-transparent text-muted hover:text-foreground"}`}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      {s.lastError ? (
        <Alert tone="error" title={t("lastFailed")} data-testid="import-last-error">
          {s.lastError}
        </Alert>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label={t("kpiSource")}
          value={provider}
          hint={scheduled ? t("kpiSourceScheduled", { at: PULL_AT }) : t("kpiSourceManual")}
          testId="import-state"
        />
        <Stat
          label={t("kpiLast")}
          value={d.lastImport ? when(d.lastImport.at) : "—"}
          hint={
            d.lastImport
              ? t("kpiLastHint", { n: d.lastImport.cellCount })
              : s.lastRunAt
                ? t("kpiLastChecked", { when: elapsed(s.lastRunAt) })
                : t("kpiNever")
          }
        />
        <Stat
          label={t("kpiByHand")}
          value={String(d.byHand)}
          hint={t("kpiByHandHint", { h: s.holdHours })}
        />
        <Stat
          label={t("kpiNext")}
          value={scheduled ? `${nextPullToday ? t("today") : t("tomorrow")} ${PULL_AT}` : "—"}
          hint={
            scheduled ? (s.autoApply ? t("kpiNextAuto") : t("kpiNextReview")) : t("kpiNextManual")
          }
        />
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_440px]">
        <div className="flex min-w-0 flex-col gap-5">
          <Card
            title={t("railsTitle")}
            actions={<span className="text-xs text-muted">{t("railsBody")}</span>}
          >
            <Table>
              <THead>
                <Tr>
                  <Th>{t("colPlan")}</Th>
                  <Th>{t("colFloor")}</Th>
                  <Th>{t("colCeiling")}</Th>
                  <Th>{t("colToday")}</Th>
                  <Th>{t("colSource")}</Th>
                  <Th>{t("colImported")}</Th>
                  <Th>{t("colStatus")}</Th>
                </Tr>
              </THead>
              <TBody>
                {d.plans.map((p) => {
                  const derived = p.parentTitle !== null;
                  const outside =
                    !derived &&
                    p.todayRate !== null &&
                    ((floor !== null && p.todayRate < floor) ||
                      (ceiling !== null && p.todayRate > ceiling));
                  return (
                    <Tr key={p.id} data-testid="rails-row">
                      <Td>
                        <strong>{p.title}</strong>
                        {derived && p.derivedOption ? (
                          <span className="block text-xs text-muted">
                            {t("derivedFrom", {
                              change: `${p.derivedOption.direction === "decrease" ? "−" : "+"}${p.derivedOption.kind === "percent" ? `${String(p.derivedOption.value)}%` : money(p.derivedOption.value, d.currency)}`,
                            })}
                          </span>
                        ) : null}
                      </Td>
                      <Td>{derived ? "—" : money(floor, d.currency)}</Td>
                      <Td>{derived ? "—" : money(ceiling, d.currency)}</Td>
                      <Td>{money(p.todayRate, d.currency)}</Td>
                      <Td>{sourceName(p.todaySource)}</Td>
                      <Td>
                        {!derived && p.todaySource === "rate_import" && d.lastImport
                          ? t("ago", { when: elapsed(d.lastImport.at) })
                          : "—"}
                      </Td>
                      <Td>
                        {derived ? (
                          <Chip size="sm">{t("follows", { plan: p.parentTitle! })}</Chip>
                        ) : outside ? (
                          <Chip size="sm" color="warning">
                            {t("statusOutside")}
                          </Chip>
                        ) : floor === null && ceiling === null ? (
                          <Chip size="sm">{t("statusNoRails")}</Chip>
                        ) : (
                          <Chip size="sm" color="success">
                            {t("statusOk")}
                          </Chip>
                        )}
                      </Td>
                    </Tr>
                  );
                })}
              </TBody>
            </Table>
          </Card>

          <Card title={t("outsideTitle")}>
            {floor === null && ceiling === null ? (
              <p className="text-sm text-muted">{t("outsideNoRails")}</p>
            ) : d.outside.length === 0 ? (
              <p className="text-sm text-muted">{t("outsideNone")}</p>
            ) : (
              <Table>
                <THead>
                  <Tr>
                    <Th>{t("colNight")}</Th>
                    <Th>{t("colPrice")}</Th>
                    <Th>{t("colRail")}</Th>
                    <Th>{t("colResult")}</Th>
                  </Tr>
                </THead>
                <TBody>
                  {d.outside.map((o) => {
                    const low = floor !== null && o.rate < floor;
                    return (
                      <Tr key={`${o.plan}-${o.date}`}>
                        <Td>
                          {day(o.date)}
                          {d.ratePlans.length > 1 ? (
                            <span className="block text-xs text-muted">{o.plan}</span>
                          ) : null}
                        </Td>
                        <Td>{money(o.rate, d.currency)}</Td>
                        <Td>{money(low ? floor : ceiling, d.currency)}</Td>
                        <Td>{low ? t("belowFloor") : t("aboveCeiling")}</Td>
                      </Tr>
                    );
                  })}
                </TBody>
              </Table>
            )}
            <p className="mt-3 text-xs text-muted">{t("outsideNote")}</p>
          </Card>

          <ImportForm
            propertyId={id}
            ratePlans={d.ratePlans}
            labels={{
              heading: t("importTitle"),
              intro: t("importBody", { currency: d.currency }),
              paste: t("paste"),
              dryRun: t("dryRun"),
              running: t("running"),
              apply: t("apply"),
              override: t("override"),
              nothingRead: t("nothingRead"),
              cells: t("cells"),
              noChange: t("noChange"),
              applied: t("appliedTitle"),
              undo: t("undo"),
              refused: t("refused"),
              unmapped: t("unmapped"),
              held: t("held"),
              outside: t("outside"),
              parseErrors: t("parseErrors"),
              readColumns: t("readColumns"),
              before: t("before"),
              after: t("after"),
              mapTitle: t("mapFirstTitle"),
              mapBody: t("mapFirstBody"),
              allRows: t("allRows"),
              saveMapping: t("saveMapping"),
            }}
          />
        </div>

        <Card title={t("connectorTitle")}>
          <form action={saveRateImportAction} className="flex flex-col gap-3">
            <input type="hidden" name="propertyId" value={id} />
            <div>
              <Label htmlFor="provider">{t("provider")}</Label>
              <Select id="provider" name="provider" defaultValue={s.provider}>
                <option value="csv">{t("providerCsv")}</option>
                <option value="pricelabs">PriceLabs</option>
                <option value="wheelhouse">Wheelhouse</option>
              </Select>
            </div>
            <Field
              label={t("providerRef")}
              name="providerRef"
              required={false}
              defaultValue={s.providerRef ?? ""}
              description={t("providerRefHint")}
            />
            <div>
              <Label htmlFor="schedule">{t("schedule")}</Label>
              <Select id="schedule" name="schedule" defaultValue={s.enabled ? "nightly" : "manual"}>
                <option value="nightly">{t("scheduleNightly", { at: PULL_AT })}</option>
                <option value="manual">{t("scheduleManual")}</option>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field
                label={t("floor", { currency: d.currency })}
                name="floor"
                required={false}
                defaultValue={major(floor)}
                testId="floor-minor"
              />
              <Field
                label={t("ceiling", { currency: d.currency })}
                name="ceiling"
                required={false}
                defaultValue={major(ceiling)}
                testId="ceiling-minor"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field
                label={t("maxChange")}
                name="maxChangePercent"
                type="number"
                min={0}
                required={false}
                defaultValue={
                  s.guardRails.maxChangeBps == null ? "" : s.guardRails.maxChangeBps / 100
                }
                testId="max-change"
              />
              <Field
                label={t("holdHours")}
                name="holdHours"
                type="number"
                min={0}
                required={false}
                defaultValue={s.holdHours}
              />
            </div>
            <p className="-mt-1 text-xs text-muted">{t("holdHoursHint")}</p>
            <Label className="flex items-center gap-2 font-normal">
              <input type="checkbox" name="autoApply" defaultChecked={s.autoApply} />
              {t("autoApply")}
            </Label>
            <p className="-mt-1 text-xs text-muted">{t("autoApplyHint")}</p>
            {refs.length > 0 ? (
              <div>
                <p className="mb-2 text-sm font-medium">{t("mapping")}</p>
                <div className="grid gap-2" data-testid="listing-mapping">
                  {refs.map((ref) => (
                    <div key={ref}>
                      <Label htmlFor={`map.${ref}`}>{ref || t("allRows")}</Label>
                      <Select id={`map.${ref}`} name={`map.${ref}`} defaultValue={s.mapping[ref]}>
                        <option value="">—</option>
                        {d.ratePlans.map((rp) => (
                          <option key={rp.id} value={rp.id}>
                            {rp.title}
                          </option>
                        ))}
                      </Select>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            <div>
              <button
                type="submit"
                className="inline-flex h-[38px] items-center rounded-full bg-accent px-4 text-sm font-bold text-accent-foreground"
                data-testid="save-pricing"
              >
                {t("save")}
              </button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
