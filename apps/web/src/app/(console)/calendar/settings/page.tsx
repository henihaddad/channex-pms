import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { guestPrice, Money, OTA_CHANNELS, type PricingDefaults } from "@pms/core";
import {
  DrizzlePricingDefaultsRepository,
  DrizzleRateImportRepository,
  DrizzleSeasonRepository,
  rawRows,
  sql,
  type RateImportSettings,
  type SeasonRow,
} from "@pms/db";
import {
  Card,
  Chip,
  EmptyState,
  LinkButton,
  PageHeader,
  Table,
  TBody,
  Td,
  Th,
  THead,
  Tr,
} from "@/components/ui";
import { guard } from "@/server/guard";
import { withPermission } from "@/server/with-permission";
import { channelName, channelNameOf } from "@/lib/channels";
import { money } from "@/lib/format";
import { savePricingDefaultsAction } from "../calendar.actions";
import { FutureNights } from "./future-nights";
import { NavSelect } from "./nav-select";

type Plan = {
  id: string;
  title: string;
  propertyId: string;
  propertyTitle: string;
  currency: string;
};

const loadSettings = withPermission<
  [{ propertyId?: string; ratePlanId?: string; today: string }],
  {
    plans: Plan[];
    plan: Plan | null;
    data: {
      derived: Array<{
        title: string;
        option: { kind: string; direction: string; value: number } | null;
      }>;
      stats: {
        weekday: number | null;
        weekend: number | null;
        minStay: number | null;
        maxStay: number | null;
        horizonEnd: string | null;
        cta: number[];
        ctd: number[];
      };
      defaults: PricingDefaults;
      imports: RateImportSettings;
      seasons: SeasonRow[];
      promos: Array<{
        code: string;
        kind: string;
        value: number;
        validFrom: string | null;
        validTo: string | null;
        stayFrom: string | null;
        stayTo: string | null;
        uses: number;
        active: boolean;
      }>;
      rules: Array<{ type: string; params: Record<string, unknown>; enabled: boolean }>;
      taxes: Array<{
        title: string;
        taxes: Array<{ name: string; rate: number; logic: string; isInclusive: boolean }>;
      }>;
      connections: Array<{ adapterCode: string; state: string; lastPushAt: string | null }>;
    } | null;
  }
>("yield_rule:read", { scope: "organization", audit: false }, async (ctx, q) => {
  const plans = await rawRows<Plan>(
    ctx.tx,
    sql`select rp.id, rp.title, rp.property_id as "propertyId", p.title as "propertyTitle", p.currency
      from rate_plan rp join property p on p.id = rp.property_id
      where rp.archived_at is null and rp.parent_rate_plan_id is null and p.archived_at is null and p.state <> 'archived'
      order by p.title, rp.created_at, rp.id`,
  );
  const plan =
    plans.find((p) => p.id === q.ratePlanId) ??
    plans.find((p) => p.propertyId === q.propertyId) ??
    plans[0] ??
    null;
  if (!plan) return { plans, plan: null, data: null };
  const pid = plan.propertyId;
  const [stats] = await rawRows<{
    weekday: number | null;
    weekend: number | null;
    min_stay: number | null;
    max_stay: number | null;
    horizon_end: string | null;
  }>(
    ctx.tx,
    sql`select
      percentile_disc(0.5) within group (order by (values->>'rate')::bigint) filter (where extract(isodow from date) not in (5, 6) and values ? 'rate') as weekday,
      percentile_disc(0.5) within group (order by (values->>'rate')::bigint) filter (where extract(isodow from date) in (5, 6) and values ? 'rate') as weekend,
      mode() within group (order by coalesce((values->>'minStay')::int, 1)) as min_stay,
      mode() within group (order by (values->>'maxStay')::int) filter (where values ? 'maxStay') as max_stay,
      (select max(date)::text from rate_day where rate_plan_id = ${plan.id}) as horizon_end
      from rate_day where rate_plan_id = ${plan.id} and date between ${q.today}::date and ${q.today}::date + 90`,
  );
  const week = await rawRows<{ d: number; cta: boolean; ctd: boolean }>(
    ctx.tx,
    sql`select extract(isodow from date)::int as d,
        bool_and(coalesce((values->>'closedToArrival')::boolean, false)) as cta,
        bool_and(coalesce((values->>'closedToDeparture')::boolean, false)) as ctd
      from rate_day where rate_plan_id = ${plan.id} and date between ${q.today}::date and ${q.today}::date + 90 group by 1`,
  );
  return {
    plans,
    plan,
    data: {
      derived: await rawRows(
        ctx.tx,
        sql`select title, derived_option as option from rate_plan where parent_rate_plan_id = ${plan.id} and archived_at is null order by title`,
      ),
      stats: {
        weekday: stats?.weekday == null ? null : Number(stats.weekday),
        weekend: stats?.weekend == null ? null : Number(stats.weekend),
        minStay: stats?.min_stay ?? null,
        maxStay: stats?.max_stay ?? null,
        horizonEnd: stats?.horizon_end ?? null,
        cta: week.filter((w) => w.cta).map((w) => w.d),
        ctd: week.filter((w) => w.ctd).map((w) => w.d),
      },
      defaults: await new DrizzlePricingDefaultsRepository(ctx.tx).get(pid),
      imports: await new DrizzleRateImportRepository(ctx.tx, ctx.orgId).get(pid),
      seasons: await new DrizzleSeasonRepository(ctx.tx, ctx.orgId).list(pid),
      promos: await rawRows(
        ctx.tx,
        sql`select code, kind, value, valid_from::text as "validFrom", valid_to::text as "validTo", stay_from::text as "stayFrom", stay_to::text as "stayTo", uses, active
          from promo_code where property_id = ${pid} or property_id is null order by active desc, created_at desc limit 20`,
      ),
      rules: await rawRows(
        ctx.tx,
        sql`select type, params, enabled from availability_rule where property_id = ${pid} order by type`,
      ),
      taxes: await rawRows(
        ctx.tx,
        sql`select title, taxes from tax_set where property_id = ${pid} order by title`,
      ),
      connections: await rawRows(
        ctx.tx,
        sql`select adapter_code as "adapterCode", state, last_push_at::text as "lastPushAt" from channel_connection where property_id = ${pid} and archived_at is null order by adapter_code`,
      ),
    },
  };
});

const NAV = [
  "pricing",
  "markup",
  "discounts",
  "promotions",
  "availability",
  "trip",
  "fees",
  "sync",
] as const;

/**
 * Pricing & availability (spec 06 §6.6), reached from the calendar's gear: what every
 * night of one rate plan starts from. Prices and stay limits apply to future nights
 * through a dry run and an undo; markup, rounding and discounts are kept with the property;
 * the price-tips mode, floor and ceiling are the rate import's own settings.
 */
export default async function PricingSettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const t = await getTranslations("calendar.settings");
  const tc = await getTranslations("calendar");
  const today = new Date().toISOString().slice(0, 10);
  const {
    plans,
    plan,
    data: d,
  } = await guard(() =>
    loadSettings({ propertyId: sp.propertyId, ratePlanId: sp.ratePlanId, today }),
  );
  if (!plan || !d)
    return (
      <div className="space-y-5">
        <PageHeader
          title={t("title")}
          crumb={[{ href: "/calendar", label: tc("title") }, { label: t("title") }]}
        />
        <Card>
          <EmptyState
            title={tc("emptyTitle")}
            description={tc("emptyBody")}
            action={
              <LinkButton href="/properties/new" variant="primary">
                {tc("addProperty")}
              </LinkButton>
            }
          />
        </Card>
      </div>
    );
  const cur = plan.currency;
  const symbol = money(0, cur).replace(/[\d.,\s−-]/g, "") || cur;
  const major = (minor: number | null | undefined) => (minor == null ? "" : String(minor / 100));
  const pct = (bps: number | null | undefined) => (bps == null ? "" : `${String(bps / 100)}%`);
  const tipsMode = !d.imports.enabled ? "off" : d.imports.autoApply ? "auto" : "suggest";
  const connected = new Set(d.connections.map((c) => channelName(c.adapterCode)));
  const example = d.stats.weekend ?? d.stats.weekday;
  const fullDays = tc("weekdayNames").split(",");
  const isoName = (iso: number) => fullDays[iso - 1]!;
  const futureLabels = {
    preview: t("preview"),
    apply: tc("apply"),
    cancel: tc("cancel"),
    undo: tc("undo"),
    wouldChange: t("wouldChange"),
    applied: tc("applied"),
    undone: tc("undone"),
    nothing: t("nothing"),
    invalid: t("invalid"),
    failed: t("failed"),
  };
  const row =
    "grid items-center gap-2 border-b border-default py-3 sm:grid-cols-[236px_minmax(0,1fr)]";
  const input =
    "h-[42px] w-[120px] rounded-xl border border-border bg-surface px-3.5 text-sm outline-none focus:ring-2 focus:ring-accent";
  const select =
    "h-[42px] w-full max-w-[600px] rounded-xl border border-border bg-surface px-3.5 text-sm";
  const label = (title: string, hint?: string) => (
    <span className="text-sm font-semibold">
      {title}
      {hint ? <span className="block text-xs font-normal text-muted">{hint}</span> : null}
    </span>
  );
  const promoStatus = (p: (typeof d.promos)[number]): [string, "success" | "info" | "default"] =>
    !p.active
      ? [t("promoOff"), "default"]
      : p.validFrom && p.validFrom > today
        ? [t("promoScheduled"), "info"]
        : p.validTo && p.validTo < today
          ? [t("promoEnded"), "default"]
          : [p.uses > 0 ? t("promoRunningUses", { n: p.uses }) : t("promoRunning"), "success"];
  const short = (iso: string) =>
    new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(
      new Date(`${iso}T00:00:00Z`),
    );

  return (
    <div className="space-y-5">
      <PageHeader
        title={t("title")}
        crumb={[
          { href: "/calendar", label: tc("title") },
          { href: `/calendar?propertyId=${plan.propertyId}`, label: plan.propertyTitle },
          { label: t("title") },
        ]}
      />
      <div className="grid items-start gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav
          aria-label={t("title")}
          className="flex gap-1 overflow-x-auto lg:sticky lg:top-4 lg:flex-col"
        >
          {NAV.map((n, i) => (
            <a
              key={n}
              href={`#${n}`}
              className={`rounded-xl px-3 py-2.5 text-sm whitespace-nowrap no-underline ${i === 0 ? "border border-border bg-surface font-semibold text-foreground" : "text-muted hover:text-foreground"}`}
            >
              {t(`nav.${n}`)}
            </a>
          ))}
        </nav>
        <form action={savePricingDefaultsAction} className="flex min-w-0 flex-col gap-5">
          <input type="hidden" name="propertyId" value={plan.propertyId} />
          <div className="flex flex-wrap items-center gap-3">
            <NavSelect
              label={t("ratePlan")}
              value={plan.id}
              options={plans.map((p) => ({
                value: p.id,
                label: `${p.propertyTitle} · ${p.title}`,
                href: `/calendar/settings?ratePlanId=${p.id}`,
              }))}
            />
            <span className="text-xs text-muted">{t("lead")}</span>
          </div>

          <Card title={t("nav.pricing")} id="pricing" className="scroll-mt-4">
            <FutureNights
              propertyId={plan.propertyId}
              ratePlanId={plan.id}
              from={today}
              to={d.stats.horizonEnd ?? today}
              symbol={symbol}
              labels={futureLabels}
              testId="future-prices"
              fields={[
                {
                  name: "base",
                  label: t("base"),
                  hint: t("baseHint"),
                  value: major(d.stats.weekday),
                  kind: "money",
                  days: ["mo", "tu", "we", "th", "su"],
                },
                {
                  name: "weekend",
                  label: t("weekend"),
                  hint: t("weekendHint"),
                  value: major(d.stats.weekend),
                  kind: "money",
                  days: ["fr", "sa"],
                },
              ]}
            />
            <div className={row}>
              {label(t("tips"), t("tipsHint"))}
              <select name="tips" defaultValue={tipsMode} className={select}>
                <option value="suggest">{t("tipsSuggest")}</option>
                <option value="auto">{t("tipsAuto")}</option>
                <option value="off">{t("tipsOff")}</option>
              </select>
            </div>
            <div className={row}>
              {label(t("rails"), t("railsHint"))}
              <span className="flex items-center gap-2">
                <input
                  name="floor"
                  aria-label={t("floor")}
                  className={input}
                  placeholder="—"
                  defaultValue={
                    d.imports.guardRails.floorMinor == null
                      ? ""
                      : `${symbol}${major(d.imports.guardRails.floorMinor)}`
                  }
                />
                <span className="text-muted">{t("to")}</span>
                <input
                  name="ceiling"
                  aria-label={t("ceiling")}
                  className={input}
                  placeholder="—"
                  defaultValue={
                    d.imports.guardRails.ceilingMinor == null
                      ? ""
                      : `${symbol}${major(d.imports.guardRails.ceilingMinor)}`
                  }
                />
              </span>
            </div>
            <div className={row}>
              {label(t("derived"))}
              <span className="text-sm">
                {d.derived.length === 0
                  ? t("noDerived")
                  : d.derived
                      .map((x) =>
                        x.option
                          ? `${x.title} = ${plan.title} ${x.option.direction === "decrease" ? "−" : "+"}${x.option.kind === "percent" ? `${String(x.option.value)}%` : money(x.option.value, cur)}`
                          : x.title,
                      )
                      .join(" · ")}{" "}
                · <Link href={`/properties/${plan.propertyId}`}>{t("edit")}</Link>
              </span>
            </div>
          </Card>

          <Card
            title={t("nav.markup")}
            description={t("markupLead")}
            id="markup"
            className="scroll-mt-4"
          >
            {OTA_CHANNELS.map((ch) => {
              const bps = d.defaults.markupBps[ch];
              const shown =
                example != null && bps
                  ? `${money(example, cur)} → ${money(guestPrice(Money.of(example, cur), bps, d.defaults.rounding).minor, cur)}`
                  : null;
              return (
                <div key={ch} className={row}>
                  {label(channelNameOf(ch))}
                  <span className="flex flex-wrap items-center gap-2">
                    <input
                      name={`markup.${ch}`}
                      aria-label={channelNameOf(ch)}
                      className={input}
                      placeholder="+0%"
                      defaultValue={bps == null ? "" : `+${pct(bps)}`}
                    />
                    <span className="text-xs text-muted">
                      {[
                        connected.has(channelNameOf(ch)) ? t("connected") : t("notConnected"),
                        shown,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                </div>
              );
            })}
            <div className={row}>
              {label(t("rounding"))}
              <select name="rounding" defaultValue={d.defaults.rounding} className={select}>
                <option value="unit">{t("roundUnit", { symbol })}</option>
                <option value="five">{t("roundFive", { symbol })}</option>
                <option value="none">{t("roundNone")}</option>
              </select>
            </div>
            <p className="mt-3 text-xs text-muted">{t("markupNote")}</p>
          </Card>

          <Card title={t("nav.discounts")} id="discounts" className="scroll-mt-4">
            <div className={row}>
              {label(t("weekly"))}
              <input
                name="weekly"
                aria-label={t("weekly")}
                className={input}
                placeholder="−0%"
                defaultValue={
                  d.defaults.discounts.weeklyBps == null
                    ? ""
                    : `−${pct(d.defaults.discounts.weeklyBps)}`
                }
              />
            </div>
            <div className={row}>
              {label(t("monthly"))}
              <input
                name="monthly"
                aria-label={t("monthly")}
                className={input}
                placeholder="−0%"
                defaultValue={
                  d.defaults.discounts.monthlyBps == null
                    ? ""
                    : `−${pct(d.defaults.discounts.monthlyBps)}`
                }
              />
            </div>
            <div className={row}>
              {label(t("earlyBird"))}
              <span className="flex flex-wrap items-center gap-2">
                <input
                  name="earlyBird"
                  aria-label={t("earlyBird")}
                  className={input}
                  placeholder="−0%"
                  defaultValue={
                    d.defaults.discounts.earlyBirdBps == null
                      ? ""
                      : `−${pct(d.defaults.discounts.earlyBirdBps)}`
                  }
                />
                <span className="text-sm text-muted">{t("whenBooked")}</span>
                <select
                  name="earlyBirdDays"
                  defaultValue={String(d.defaults.discounts.earlyBirdDays)}
                  className="h-[42px] rounded-xl border border-border bg-surface px-3.5 text-sm"
                >
                  <option value="90">{t("monthsAhead", { n: 3 })}</option>
                  <option value="180">{t("monthsAhead", { n: 6 })}</option>
                </select>
              </span>
            </div>
            <div className={row}>
              {label(t("lastMinute"))}
              <span className="flex flex-wrap items-center gap-2">
                <input
                  name="lastMinute"
                  aria-label={t("lastMinute")}
                  className={input}
                  placeholder="−0%"
                  defaultValue={
                    d.defaults.discounts.lastMinuteBps == null
                      ? ""
                      : `−${pct(d.defaults.discounts.lastMinuteBps)}`
                  }
                />
                <span className="text-sm text-muted">{t("within")}</span>
                <select
                  name="lastMinuteDays"
                  defaultValue={String(d.defaults.discounts.lastMinuteDays)}
                  className="h-[42px] rounded-xl border border-border bg-surface px-3.5 text-sm"
                >
                  <option value="3">{t("days", { n: 3 })}</option>
                  <option value="7">{t("days", { n: 7 })}</option>
                </select>
              </span>
            </div>
            <p className="mt-3 text-xs text-muted">{t("discountsNote")}</p>
          </Card>

          <Card
            title={t("nav.promotions")}
            id="promotions"
            className="scroll-mt-4"
            actions={
              <LinkButton
                href={`/properties/${plan.propertyId}/booking-engine`}
                variant="secondary"
                size="sm"
              >
                + {t("newPromotion")}
              </LinkButton>
            }
          >
            {d.promos.length === 0 ? (
              <p className="text-sm text-muted">{t("noPromotions")}</p>
            ) : (
              <Table>
                <THead>
                  <Tr>
                    <Th>{t("promotion")}</Th>
                    <Th>{t("nights")}</Th>
                    <Th>{t("discount")}</Th>
                    <Th>{t("channels")}</Th>
                    <Th>{t("status")}</Th>
                  </Tr>
                </THead>
                <TBody>
                  {d.promos.map((p) => {
                    const [s, tone] = promoStatus(p);
                    return (
                      <Tr key={p.code}>
                        <Td className="font-semibold">{p.code}</Td>
                        <Td>
                          {p.stayFrom || p.stayTo
                            ? `${p.stayFrom ? short(p.stayFrom) : "…"} → ${p.stayTo ? short(p.stayTo) : "…"}`
                            : t("anyNight")}
                        </Td>
                        <Td>
                          {p.kind === "percent"
                            ? `−${String(p.value)}%`
                            : `−${money(p.value, cur)}`}{" "}
                          · {t("code", { code: p.code })}
                        </Td>
                        <Td>{channelNameOf("direct")}</Td>
                        <Td>
                          <Chip color={tone === "info" ? "accent" : tone} size="sm">
                            {s}
                          </Chip>
                        </Td>
                      </Tr>
                    );
                  })}
                </TBody>
              </Table>
            )}
          </Card>

          <Card title={t("nav.availability")} id="availability" className="scroll-mt-4">
            {(["cut_off", "keep_back", "release"] as const).map((type) => {
              const r = d.rules.filter((x) => x.type === type && x.enabled);
              return (
                <div key={type} className={row}>
                  {label(t(`rule.${type}`), t(`ruleHint.${type}`))}
                  <span className="text-sm">
                    {r.length === 0 ? (
                      <span className="text-muted">{t("notSet")}</span>
                    ) : (
                      r
                        .map((x) =>
                          Object.entries(x.params)
                            .map(([k, v]) => `${k} ${String(v)}`)
                            .join(", "),
                        )
                        .join(" · ")
                    )}
                  </span>
                </div>
              );
            })}
            <div className={row}>
              {label(t("window"))}
              <span className="text-sm">
                {d.stats.horizonEnd
                  ? t("windowUntil", {
                      date: short(d.stats.horizonEnd) + " " + d.stats.horizonEnd.slice(0, 4),
                    })
                  : t("notSet")}
              </span>
            </div>
            <div className={row}>
              {label(t("checkIn"))}
              <span className="text-sm">
                {d.stats.cta.length === 0
                  ? t("everyDay")
                  : t("allBut", { days: d.stats.cta.map(isoName).join(", ") })}
              </span>
            </div>
            <div className={row}>
              {label(t("checkOut"))}
              <span className="text-sm">
                {d.stats.ctd.length === 0
                  ? t("everyDay")
                  : t("allBut", { days: d.stats.ctd.map(isoName).join(", ") })}
              </span>
            </div>
            <p className="mt-3 text-xs text-muted">{t("availabilityNote")}</p>
          </Card>

          <Card title={t("nav.trip")} id="trip" className="scroll-mt-4">
            <FutureNights
              propertyId={plan.propertyId}
              ratePlanId={plan.id}
              from={today}
              to={d.stats.horizonEnd ?? today}
              symbol={symbol}
              labels={futureLabels}
              testId="future-stay"
              fields={[
                {
                  name: "minStay",
                  label: t("minNights"),
                  value: String(d.stats.minStay ?? 1),
                  kind: "nights",
                },
                {
                  name: "maxStay",
                  label: t("maxNights"),
                  value: d.stats.maxStay == null ? "" : String(d.stats.maxStay),
                  kind: "nights",
                },
              ]}
            />
            <div className={row}>
              {label(t("perSeason"))}
              <span className="text-sm">
                {d.seasons.length === 0 ? t("noSeasons") : d.seasons.map((s) => s.name).join(" · ")}{" "}
                ·{" "}
                <Link href={`/calendar?view=year&propertyId=${plan.propertyId}`}>
                  {tc("seasons")}
                </Link>
              </span>
            </div>
          </Card>

          <Card title={t("nav.fees")} id="fees" className="scroll-mt-4">
            {d.taxes.length === 0 ? (
              <p className="text-sm text-muted">{t("noTaxes")}</p>
            ) : (
              d.taxes.map((x) => (
                <div key={x.title} className={row}>
                  {label(x.title)}
                  <span className="text-sm">
                    {x.taxes
                      .map(
                        (tx) =>
                          `${tx.name} ${tx.logic === "percent" ? `${String(tx.rate)}%` : money(tx.rate, cur)}${tx.isInclusive ? ` ${t("included")}` : ""}`,
                      )
                      .join(" · ")}
                  </span>
                </div>
              ))
            )}
            <p className="mt-3 text-xs text-muted">
              <Link href={`/properties/${plan.propertyId}`}>{t("feesLink")}</Link>
            </p>
          </Card>

          <Card title={t("nav.sync")} id="sync" className="scroll-mt-4">
            {d.connections.length === 0 ? (
              <p className="text-sm text-muted">
                {t("noChannels")} <Link href="/channels">{t("connect")}</Link>
              </p>
            ) : (
              d.connections.map((c) => (
                <div key={c.adapterCode} className={row}>
                  {label(channelName(c.adapterCode))}
                  <span className="flex items-center gap-2 text-sm">
                    <Chip
                      color={
                        c.state === "active"
                          ? "success"
                          : c.state === "error"
                            ? "danger"
                            : "default"
                      }
                      size="sm"
                    >
                      {t(
                        `state.${["active", "error", "paused"].includes(c.state) ? c.state : "other"}`,
                      )}
                    </Chip>
                    {c.lastPushAt ? (
                      <span className="text-xs text-muted">
                        {t("lastPush", { date: short(c.lastPushAt.slice(0, 10)) })}
                      </span>
                    ) : null}
                  </span>
                </div>
              ))
            )}
            <p className="mt-3 text-xs text-muted">
              <Link href="/sync-health">{t("syncLink")}</Link>
            </p>
          </Card>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              className="inline-flex h-[38px] items-center rounded-full bg-accent px-4 text-sm font-bold text-accent-foreground"
              data-testid="save-pricing-settings"
            >
              {tc("save")}
            </button>
            <LinkButton href={`/calendar?propertyId=${plan.propertyId}`} variant="secondary">
              {t("back")}
            </LinkButton>
            <span className="text-xs text-muted">{t("saveNote")}</span>
          </div>
        </form>
      </div>
    </div>
  );
}
