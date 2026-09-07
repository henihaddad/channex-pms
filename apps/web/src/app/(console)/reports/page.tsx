import Link from "next/link";
import { getTranslations } from "next-intl/server";
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
  cn,
} from "@/components/ui";
import { ReportsPreview } from "@/components/previews";
import { guard } from "@/server/guard";
import {
  deleteScheduleAction,
  listReports,
  runFinancialReport,
  runOperationalReport,
  saveBudgetAction,
  saveScheduleAction,
} from "./reports.actions";

const monthAgo = () => new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
const todayIso = () => new Date().toISOString().slice(0, 10);
const numeric = (v: unknown) =>
  typeof v === "number" || (typeof v === "string" && /^-?\d+([.,]\d+)?%?$/.test(v));

/** The report catalogue (spec 11 §11.3): run with filters, export CSV/PDF, schedule by email; budgets for "vs budget". */
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const t = await getTranslations("reports");
  const v = await guard(() => listReports());
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
  const groups = ["commercial", "operational", "financial", "guest"] as const;
  const numericCols = result
    ? result.columns.map(
        (_, j) => result.rows.length > 0 && result.rows.every((r) => numeric(r[j])),
      )
    : [];
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t("title")} description={t("description")} />
      <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
        <Card className="h-fit" contentClassName="flex flex-col gap-4">
          {groups.map((g) => (
            <div key={g}>
              <p className="mb-1 px-2 text-[0.7rem] font-semibold tracking-[0.12em] text-muted uppercase">
                {t(`groups.${g}`)}
              </p>
              <ul className="flex flex-col gap-0.5">
                {v.catalogue
                  .filter((r) => r.group === g)
                  .map((r) => (
                    <li key={r.key}>
                      <Link
                        href={`/reports?key=${r.key}&${qs}`}
                        className={cn(
                          "block rounded-xl px-2 py-1.5 text-sm transition-colors",
                          sp.key === r.key
                            ? "bg-accent-soft font-medium text-accent-soft-foreground"
                            : "text-foreground hover:bg-default",
                        )}
                        title={describe(r.key, r.description)}
                        data-testid={`report-${r.key}`}
                      >
                        {name(r.key, r.name)}
                      </Link>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </Card>

        <div className="flex min-w-0 flex-col gap-5">
          <Card title={t("filters")}>
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
                {def ? (
                  <>
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
                  </>
                ) : null}
              </FormRow>
            </form>
          </Card>

          {result && def ? (
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
                empty={t("noSchedules") === "" ? "" : "—"}
                dense
              />
            </Card>
          ) : (
            <Card>
              <EmptyState
                title={t("emptyTitle")}
                description={t("empty")}
                preview={<ReportsPreview />}
              />
            </Card>
          )}

          {result && def ? (
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

          <Card title={t("schedules")}>
            {v.schedules.length === 0 ? (
              <EmptyState title={t("noSchedules")} />
            ) : (
              <DataTable
                columns={[
                  t("report"),
                  t("cadenceLabel"),
                  t("format"),
                  t("recipientsLabel"),
                  t("lastSent"),
                  { label: "", align: "end" },
                ]}
                rows={v.schedules.map((s) => [
                  <span key="n" data-testid="schedule-row">
                    <span className="font-medium text-foreground">{s.name}</span>
                    <span className="text-muted"> · {s.reportKey}</span>
                  </span>,
                  t.has(`cadence.${s.cadence}`) ? t(`cadence.${s.cadence}`) : s.cadence,
                  s.format.toUpperCase(),
                  s.recipients.join(", "),
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
                <Field
                  label={t("budgetRevenue")}
                  name="roomRevenue"
                  type="number"
                  className="w-44"
                />
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
    </div>
  );
}
