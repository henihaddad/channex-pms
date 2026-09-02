import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button, Card, Field, PageTitle, Select } from "@/components/ui";
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
  return (
    <div className="space-y-4">
      <PageTitle>{t("title")}</PageTitle>
      <div className="grid grid-cols-[260px_1fr] gap-4">
        <div className="space-y-4">
          {(["commercial", "operational", "financial", "guest"] as const).map((g) => (
            <Card key={g} className="p-3 text-sm">
              <p className="mb-1 font-medium">{t(`groups.${g}`)}</p>
              {v.catalogue
                .filter((r) => r.group === g)
                .map((r) => (
                  <Link
                    key={r.key}
                    href={`/reports?key=${r.key}&${qs}`}
                    className={`block rounded px-2 py-0.5 text-xs hover:bg-slate-100 ${sp.key === r.key ? "bg-slate-200 font-semibold" : ""}`}
                    title={r.description}
                    data-testid={`report-${r.key}`}
                  >
                    {r.name}
                  </Link>
                ))}
            </Card>
          ))}
        </div>
        <div className="space-y-4">
          <Card className="p-3">
            <form className="flex flex-wrap items-end gap-2 text-xs">
              <input type="hidden" name="key" value={sp.key ?? ""} />
              <div>
                <label htmlFor="from">{t("from")}</label>
                <input
                  id="from"
                  type="date"
                  name="from"
                  defaultValue={from}
                  className="block h-8 rounded border border-slate-300 px-1"
                />
              </div>
              <div>
                <label htmlFor="to">{t("to")}</label>
                <input
                  id="to"
                  type="date"
                  name="to"
                  defaultValue={to}
                  className="block h-8 rounded border border-slate-300 px-1"
                />
              </div>
              <div>
                <label htmlFor="date">{t("date")}</label>
                <input
                  id="date"
                  type="date"
                  name="date"
                  defaultValue={sp.date ?? ""}
                  className="block h-8 rounded border border-slate-300 px-1"
                />
              </div>
              <div>
                <label htmlFor="property">{t("property")}</label>
                <Select
                  id="property"
                  name="property"
                  defaultValue={sp.property ?? ""}
                  className="h-8"
                >
                  <option value="">{t("allProperties")}</option>
                  {v.properties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </Select>
              </div>
              <Button
                type="submit"
                variant="secondary"
                className="h-8 text-xs"
                data-testid="run-report"
              >
                {t("run")}
              </Button>
              {def ? (
                <>
                  <a
                    className="rounded border border-slate-300 px-2 leading-8"
                    href={`/api/v1/reports/${def.key}.csv?${qs}`}
                    data-testid="export-csv"
                  >
                    CSV
                  </a>
                  <a
                    className="rounded border border-slate-300 px-2 leading-8"
                    href={`/api/v1/reports/${def.key}.pdf?${qs}`}
                    data-testid="export-pdf"
                  >
                    PDF
                  </a>
                </>
              ) : null}
            </form>
          </Card>
          {result ? (
            <Card className="overflow-x-auto p-3" data-testid="report-result">
              <p className="text-sm font-medium">{result.name}</p>
              <p className="mb-2 text-xs text-slate-500">
                {t("basis")}: {result.basis} · {result.rows.length} {t("rows")}
              </p>
              <table className="w-full text-xs">
                <thead className="text-slate-500">
                  <tr>
                    {result.columns.map((c) => (
                      <th key={c} className="text-start">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      {row.map((c, j) => (
                        <td key={j} className="py-0.5 tabular-nums">
                          {c === null ? "" : String(c)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <form
                action={saveScheduleAction}
                className="mt-3 flex flex-wrap items-end gap-2 text-xs"
                data-testid="schedule-form"
              >
                <input type="hidden" name="reportKey" value={result.key} />
                <input type="hidden" name="propertyId" value={sp.property ?? ""} />
                <div>
                  <label htmlFor="sname">{t("scheduleName")}</label>
                  <input
                    id="sname"
                    name="name"
                    defaultValue={result.name}
                    className="block h-8 rounded border border-slate-300 px-1"
                  />
                </div>
                <div>
                  <label htmlFor="recipients">{t("recipients")}</label>
                  <input
                    id="recipients"
                    name="recipients"
                    placeholder="a@example.com, b@example.com"
                    className="block h-8 w-64 rounded border border-slate-300 px-1"
                  />
                </div>
                <Select name="cadence" defaultValue="weekly" className="h-8 w-28">
                  <option value="daily">daily</option>
                  <option value="weekly">weekly</option>
                  <option value="monthly">monthly</option>
                </Select>
                <Select name="format" defaultValue="csv" className="h-8 w-20">
                  <option value="csv">CSV</option>
                  <option value="pdf">PDF</option>
                </Select>
                <Button
                  type="submit"
                  variant="secondary"
                  className="h-8 text-xs"
                  data-testid="save-schedule"
                >
                  {t("schedule")}
                </Button>
              </form>
            </Card>
          ) : (
            <Card className="text-sm text-slate-500">{t("pick")}</Card>
          )}
          <Card className="p-3 text-sm">
            <p className="font-medium">{t("schedules")}</p>
            {v.schedules.length === 0 ? (
              <p className="text-xs text-slate-500">{t("noSchedules")}</p>
            ) : null}
            {v.schedules.map((s) => (
              <form
                key={s.id}
                action={deleteScheduleAction}
                className="flex items-center justify-between border-t border-slate-100 py-1 text-xs"
                data-testid="schedule-row"
              >
                <span>
                  {s.name} · {s.reportKey} · {s.cadence} · {s.format.toUpperCase()} ·{" "}
                  {s.recipients.join(", ")}{" "}
                  {s.lastSentAt ? `· ${t("lastSent")} ${s.lastSentAt.slice(0, 10)}` : ""}
                </span>
                <input type="hidden" name="id" value={s.id} />
                <Button type="submit" variant="secondary" className="h-6 text-xs">
                  {t("remove")}
                </Button>
              </form>
            ))}
          </Card>
          <Card className="p-3 text-sm">
            <p className="font-medium">{t("budgets")}</p>
            <form action={saveBudgetAction} className="flex flex-wrap items-end gap-2 text-xs">
              <div>
                <label htmlFor="bprop">{t("property")}</label>
                <Select id="bprop" name="propertyId" className="h-8">
                  {v.properties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label htmlFor="bmonth">{t("month")}</label>
                <input
                  id="bmonth"
                  type="month"
                  name="month"
                  className="block h-8 rounded border border-slate-300 px-1"
                />
              </div>
              <Field label={t("budgetRevenue")} name="roomRevenue" type="number" />
              <Field label={t("budgetOccupancy")} name="occupancy" type="number" required={false} />
              <Button type="submit" variant="secondary" className="h-8 text-xs">
                {t("saveBudget")}
              </Button>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}
