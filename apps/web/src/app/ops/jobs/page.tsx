import { getTranslations } from "next-intl/server";
import { Button, Card, Field, PageTitle, Select } from "@/components/ui";
import { withOperator } from "@/server/operator";
import { guard } from "@/server/guard";
import { requestJobAction } from "../ops.actions";

const loadJobs = withOperator("jobs.read", { audit: false }, async (ctx) => ctx.repo.jobRequests());
const KINDS = [
  "reconcile.nightly",
  "rollups.nightly",
  "daily_close",
  "retention.purge",
  "statements.sweep",
  "usage.meter",
];

/** Manual job triggers (spec 12 §12.1): the worker picks them up within thirty seconds. */
export default async function JobsPage() {
  const t = await getTranslations("ops");
  const rows = await guard(() => loadJobs());
  return (
    <div className="space-y-4">
      <PageTitle>{t("jobs")}</PageTitle>
      <Card>
        <form action={requestJobAction} className="flex items-end gap-2">
          <div>
            <Select label={t("jobKind")} name="kind">
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </Select>
          </div>
          <Field label={t("jobOrg")} name="orgId" required={false} />
          <Button type="submit" data-testid="run-job">
            {t("runJob")}
          </Button>
        </form>
      </Card>
      <Card title={t("recent")}>
        <ul className="text-xs" data-testid="job-requests">
          {rows.map((r) => (
            <li key={r.id} data-testid="job-row" data-state={r.state}>
              {r.kind} · {r.orgId?.slice(0, 8) ?? "all"} · {r.state} · {r.createdAt.slice(0, 19)}
              {r.result ? ` · ${JSON.stringify(r.result).slice(0, 120)}` : ""}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
