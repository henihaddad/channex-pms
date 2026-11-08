import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { channelBucket } from "@pms/core";
import {
  AnchorButton,
  Button,
  Card,
  DataTable,
  DateInput,
  EmptyState,
  Field,
  FormRow,
  Input,
  Label,
  PageHeader,
  Select,
  Stat,
} from "@/components/ui";
import { BUCKET_COLOR, Columns, Donut } from "@/components/finance";
import { money } from "@/lib/format";
import { guard } from "@/server/guard";
import { MonthOverview } from "./month-overview";
import { OverviewFilters } from "./overview-filters";
import {
  deleteScheduleAction,
  listReports,
  loadReportsOverview,
  runFinancialReport,
  runOperationalReport,
  saveBudgetAction,
  saveScheduleAction,
} from "./reports.actions";

const monthAgo = () => new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
const todayIso = () => new Date().toISOString().slice(0, 10);
const numeric = (v: unknown) =>
  typeof v === "number" || (typeof v === "string" && /^-?\d+([.,]\d+)?%?$/.test(v));
const PERIODS = [7, 30, 90, 365] as const;
/** The reports the design puts on cards; the rest of the catalogue is one click further. */
const FEATURED = [
  "kpi_summary",
  "channel_performance",
  "daily_revenue",
  "owner_statement_register",
  "message_response",
  "pace_pickup",
  "booking_window",
] as const;

/**
 * Reports (spec 11 §11.2–11.3, design board "Reports"). It leads with the dictionary's KPIs
 * for a trailing window against the one before, occupancy by week and revenue by channel,
 * then the reports as cards. A card runs its report below with filters, CSV/PDF export and
 * an email schedule; this month's overview and the property league table follow.
 */
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const t = await getTranslations("reports");
  const locale = await getLocale();
  const days = PERIODS.find((p) => String(p) === sp.days) ?? 30;
  const [v, o] = await Promise.all([
    guard(() => listReports()),
    guard(() => loadReportsOverview({ days, propertyId: sp.property ?? null })),
  ]);
  const from = sp.from ?? monthAgo();
  const to = sp.to ?? todayIso();
  const def = sp.key ? v.catalogue.find((r) => r.key === sp.key) : null;
  const result = def
    ? await guard(() =>
        (def.permission === "report:read_financial" ? runFinancialReport : runOperationalReport)({
          key: def.key,
          from,
          to,
          propertyId: sp.property ?? null,
          date: sp.date ?? null,
        }),
      )
    : null;
  const qs = `from=${from}&to=${to}${sp.property ? `&property=${sp.property}` : ""}${sp.date ? `&date=${sp.date}` : ""}`;
  const name = (key: string, fallback: string) =>
    t.has(`catalogue.${key}.name`) ? t(`catalogue.${key}.name`) : fallback;
  const describe = (key: string, fallback: string) =>
    t.has(`catalogue.${key}.description`) ? t(`catalogue.${key}.description`) : fallback;
  const numericCols = result
    ? result.columns.map(
        (_, j) => result.rows.length > 0 && result.rows.every((r) => numeric(r[j])),
      )
    : [];

  const k = o.kpis;
  const cur = k.currency;
  const fmt = (minor: number | null) => money(minor, cur, locale);
  const pct = (bps: number | null) => (bps === null ? "—" : `${Math.round(bps / 100)}%`);
  const prior = t("prior", { n: days });
  const deltaPts =
    k.current.occupancyBps !== null && k.previous.occupancyBps !== null
      ? Math.round((k.current.occupancyBps - k.previous.occupancyBps) / 100)
      : null;
  const deltaMoney = (a: number | null, b: number | null) =>
    a !== null && b !== null
      ? `${a - b >= 0 ? "+" : ""}${money(a - b, cur, locale)} ${prior}`
      : t("noPrior");
  const revenueChange =
    k.previous.roomRevenueMinor > 0
      ? Math.round(
          ((k.current.roomRevenueMinor - k.previous.roomRevenueMinor) * 100) /
            k.previous.roomRevenueMinor,
        )
      : null;
  const channels = k.channels.filter((c) => c.revenueMinor > 0);
  const commission = k.channels.reduce((a, c) => a + c.commissionMinor, 0);
  const label = (c: string) =>
    channelBucket(c) === "direct"
      ? t("direct")
      : channelBucket(c) === "booking_com"
        ? "Booking.com"
        : c;
  const color = (c: string, i: number) => {
    const b = channelBucket(c);
    return b === "other" ? ["#94a3b8", "#c4ccc9", "#64748b"][i % 3]! : BUCKET_COLOR[b];
  };
  const maxWeek = Math.max(1, ...o.weeks.map((w) => w.occupancyBps ?? 0));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <OverviewFilters
          days={days}
          propertyId={sp.property ?? ""}
          periods={PERIODS.map((p) => ({ value: p, label: t("lastDays", { n: p }) }))}
          properties={v.properties}
          labels={{
            period: t("period"),
            property: t("property"),
            allProperties: t("allProperties"),
          }}
        />
        <AnchorButton
          href={`/api/v1/reports/kpi_summary.csv?from=${o.window.from}&to=${o.window.to}${sp.property ? `&property=${sp.property}` : ""}`}
          size="sm"
        >
          {t("exportCsvLong")}
        </AnchorButton>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5" data-testid="reports-kpis">
        <Stat
          label={o.dictionary.occupancy.name}
          value={pct(k.current.occupancyBps)}
          hint={
            deltaPts === null
              ? t("noPrior")
              : t("ptsVsPrior", { n: `${deltaPts >= 0 ? "+" : ""}${String(deltaPts)}`, days })
          }
        />
        <Stat
          label={o.dictionary.adr.name}
          value={fmt(k.current.adrMinor)}
          hint={deltaMoney(k.current.adrMinor, k.previous.adrMinor)}
        />
        <Stat
          label={o.dictionary.revpar.name}
          value={fmt(k.current.revparMinor)}
          hint={deltaMoney(k.current.revparMinor, k.previous.revparMinor)}
        />
        <Stat
          label={t("revenue")}
          value={fmt(k.current.roomRevenueMinor)}
          hint={
            revenueChange === null
              ? t("roomsSold", { n: k.current.roomsSold })
              : t("pctVsPrior", {
                  n: `${revenueChange >= 0 ? "+" : ""}${String(revenueChange)}`,
                  days,
                })
          }
        />
        <Stat
          label={t("leadTime")}
          value={k.leadTimeMedianDays === null ? "—" : t("daysN", { n: k.leadTimeMedianDays })}
          hint={t("leadTimeHint")}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(300px,1fr)]">
        <Card title={t("occupancyByWeek")}>
          {o.weeks.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted">{t("noRollups")}</p>
          ) : (
            <Columns
              testId="occupancy-by-week"
              columns={o.weeks.map((w) => ({
                label: `W${String(w.week)}`,
                caption: pct(w.occupancyBps),
                value: w.occupancyBps ?? 0,
                max: maxWeek,
              }))}
            />
          )}
        </Card>
        <Card title={t("revenueByChannel")}>
          {channels.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted">{t("noRevenue")}</p>
          ) : (
            <div className="flex flex-wrap items-center gap-6" data-testid="revenue-by-channel">
              <Donut
                segments={channels.map((c, i) => ({
                  shareBps: c.revenueShareBps ?? 0,
                  color: color(c.channel, i),
                }))}
              />
              <ul className="flex min-w-[180px] flex-1 flex-col gap-2.5 text-sm">
                {channels.map((c, i) => (
                  <li key={c.channel} className="flex items-center justify-between gap-3">
                    <span className="inline-flex items-center gap-2">
                      <span
                        className="size-2 rounded-full"
                        style={{ background: color(c.channel, i) }}
                      />
                      {label(c.channel)}
                    </span>
                    <span className="font-semibold tabular-nums">
                      {pct(c.revenueShareBps)} · {fmt(c.revenueMinor)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {commission > 0 ? (
            <p className="mt-3 text-xs text-muted">
              {t("commissionPaid", { amount: fmt(commission) })}
            </p>
          ) : null}
        </Card>
      </div>

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="report-cards">
        {FEATURED.map((key) => {
          const r = v.catalogue.find((x) => x.key === key);
          if (!r) return null;
          return (
            <li key={key}>
              <Link
                href={`/reports?key=${key}&${qs}#result`}
                className="flex h-full flex-col gap-1 rounded-card border border-border bg-surface px-4.5 py-4 transition-colors hover:border-accent"
                data-testid={`report-${key}`}
              >
                <strong className="text-[15px] font-bold text-foreground">
                  {name(key, r.name)}
                </strong>
                <span className="text-[13px] text-muted">{describe(key, r.description)}</span>
              </Link>
            </li>
          );
        })}
        <li>
          <Link
            href="/settings/billing"
            className="flex h-full flex-col gap-1 rounded-card border border-border bg-surface px-4.5 py-4 transition-colors hover:border-accent"
          >
            <strong className="text-[15px] font-bold text-foreground">
              {t("exportEverything")}
            </strong>
            <span className="text-[13px] text-muted">{t("exportEverythingHint")}</span>
          </Link>
        </li>
      </ul>
      <details className="-mt-2">
        <summary className="cursor-pointer text-sm text-muted select-none hover:text-foreground">
          {t("allReports", { n: v.catalogue.length })}
        </summary>
        <ul className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {v.catalogue.map((r) => (
            <li key={r.key}>
              <Link
                href={`/reports?key=${r.key}&${qs}#result`}
                className="text-accent hover:underline"
                title={describe(r.key, r.description)}
              >
                {name(r.key, r.name)}
              </Link>
              <span className="text-muted"> · {t(`groups.${r.group}`)}</span>
            </li>
          ))}
        </ul>
      </details>

      {def ? (
        <div id="result" className="flex scroll-mt-24 flex-col gap-5">
          <Card title={name(def.key, def.name)} description={describe(def.key, def.description)}>
            <form>
              <input type="hidden" name="key" value={sp.key ?? ""} />
              <FormRow>
                <DateInput name="from" label={t("from")} defaultValue={from} className="w-44" />
                <DateInput name="to" label={t("to")} defaultValue={to} className="w-44" />
                <DateInput name="date" label={t("date")} defaultValue={sp.date} className="w-44" />
                <Select
                  name="property"
                  label={t("property")}
                  defaultValue={sp.property ?? ""}
                  className="w-56"
                >
                  <option value="">{t("allProperties")}</option>
                  {v.properties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </Select>
                <Button type="submit" data-testid="run-report">
                  {t("run")}
                </Button>
                <AnchorButton
                  href={`/api/v1/reports/${def.key}.csv?${qs}`}
                  data-testid="export-csv"
                >
                  {t("exportCsv")}
                </AnchorButton>
                <AnchorButton
                  href={`/api/v1/reports/${def.key}.pdf?${qs}`}
                  data-testid="export-pdf"
                >
                  {t("exportPdf")}
                </AnchorButton>
              </FormRow>
            </form>
          </Card>
          {result ? (
            <Card
              title={name(def.key, result.name)}
              description={`${t("basis")}: ${result.basis} · ${result.rows.length} ${t("rows")}`}
              data-testid="report-result"
            >
              <DataTable
                columns={result.columns.map((c, j) => ({
                  label: c.replace(/_/g, " "),
                  align: numericCols[j] ? "end" : "start",
                  className: "capitalize",
                }))}
                rows={result.rows.map((row) =>
                  row.map((c) => (c === null || c === undefined ? "" : String(c))),
                )}
                empty="—"
                dense
              />
            </Card>
          ) : null}
          {result ? (
            <Card title={t("schedule")} description={t("scheduleHint")}>
              <form action={saveScheduleAction} data-testid="schedule-form">
                <input type="hidden" name="reportKey" value={result.key} />
                <input type="hidden" name="propertyId" value={sp.property ?? ""} />
                <FormRow>
                  <Field
                    label={t("scheduleName")}
                    name="name"
                    defaultValue={name(def.key, result.name)}
                    className="w-56"
                  />
                  <Field
                    label={t("recipientsLabel")}
                    name="recipients"
                    placeholder="a@example.com, b@example.com"
                    className="w-80"
                  />
                  <Select
                    name="cadence"
                    label={t("cadenceLabel")}
                    defaultValue="weekly"
                    className="w-40"
                  >
                    <option value="daily">{t("cadence.daily")}</option>
                    <option value="weekly">{t("cadence.weekly")}</option>
                    <option value="monthly">{t("cadence.monthly")}</option>
                  </Select>
                  <Select name="format" label={t("format")} defaultValue="csv" className="w-28">
                    <option value="csv">CSV</option>
                    <option value="pdf">PDF</option>
                  </Select>
                  <Button type="submit" variant="secondary" data-testid="save-schedule">
                    {t("schedule")}
                  </Button>
                </FormRow>
              </form>
            </Card>
          ) : null}
        </div>
      ) : null}

      <MonthOverview propertyId={sp.property ?? null} />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title={t("schedules")}>
          {v.schedules.length === 0 ? (
            <EmptyState title={t("noSchedules")} description={t("noSchedulesHint")} />
          ) : (
            <DataTable
              columns={[
                t("report"),
                t("cadenceLabel"),
                t("format"),
                t("lastSent"),
                { label: "", align: "end" },
              ]}
              rows={v.schedules.map((s) => [
                <span key="n" data-testid="schedule-row">
                  <span className="font-medium text-foreground">{s.name}</span>
                  <span className="text-muted"> · {s.reportKey}</span>
                  <span className="block text-xs text-muted">{s.recipients.join(", ")}</span>
                </span>,
                t.has(`cadence.${s.cadence}`) ? t(`cadence.${s.cadence}`) : s.cadence,
                s.format.toUpperCase(),
                s.lastSentAt ? s.lastSentAt.slice(0, 10) : "—",
                <form key="d" action={deleteScheduleAction}>
                  <input type="hidden" name="id" value={s.id} />
                  <Button type="submit" variant="ghost" size="sm">
                    {t("remove")}
                  </Button>
                </form>,
              ])}
              dense
            />
          )}
        </Card>

        <Card title={t("budgets")}>
          <form action={saveBudgetAction}>
            <FormRow>
              <Select name="propertyId" label={t("property")} className="w-56">
                {v.properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </Select>
              <div className="flex flex-col gap-1">
                <Label htmlFor="bmonth">{t("month")}</Label>
                <Input id="bmonth" type="month" name="month" className="w-44" />
              </div>
              <Field label={t("budgetRevenue")} name="roomRevenue" type="number" className="w-44" />
              <Field
                label={t("budgetOccupancy")}
                name="occupancy"
                type="number"
                required={false}
                className="w-44"
              />
              <Button type="submit" variant="secondary">
                {t("saveBudget")}
              </Button>
            </FormRow>
          </form>
        </Card>
      </div>
    </div>
  );
}
