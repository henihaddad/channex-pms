import { getLocale, getTranslations } from "next-intl/server";
import {
  Card,
  Checkbox,
  EmptyState,
  Field,
  Input,
  Label,
  PageHeader,
  Select,
  SubmitButton,
} from "@/components/ui";
import { guard } from "@/server/guard";
import { money } from "@/lib/format";
import {
  createIssueAction,
  loadBlocks,
  loadIssues,
  updateIssueAction,
} from "../operations/operations.actions";

export async function generateMetadata() {
  const t = await getTranslations("operations");
  return { title: t("maintenance") };
}

const SEVERITIES = ["low", "normal", "high", "urgent"] as const;
const ISSUE_STATES = ["open", "assigned", "in_progress", "closed"] as const;

/**
 * Maintenance (spec 08 §8.8): triage, block availability, track cost, rebill to the owner.
 * Persona: the operations coordinator and the maintenance technician.
 */
export default async function MaintenancePage() {
  const t = await getTranslations("operations");
  const tb = await getTranslations("operations.board");
  const locale = await getLocale();
  const [issues, { units }] = await guard(() => Promise.all([loadIssues(), loadBlocks()]));
  const currencyOf = new Map(units.map((u) => [u.propertyId, u.currency]));
  const severity = (k: string) => (t.has(`severity.${k}`) ? t(`severity.${k}`) : k);
  const via = (k: string) =>
    tb(`via.${k === "guest" || k === "cleaner" || k === "owner" ? k : "staff"}`);
  const state = (k: string) =>
    tb(`issue.${k === "assigned" || k === "in_progress" || k === "closed" ? k : "open"}`);
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t("maintenance")} description={t("maintenanceLead")} />
      <Card title={t("reportIssue")}>
        <form
          action={createIssueAction}
          className="grid grid-cols-1 items-end gap-3 text-sm sm:grid-cols-2 lg:grid-cols-6"
          data-testid="issue-form"
        >
          <Select name="unit" label={t("unit")} className="lg:col-span-2">
            {units.map((u) => (
              <option key={u.id} value={`${u.propertyId}:${u.id}`}>
                {u.propertyTitle} · {u.name}
              </option>
            ))}
          </Select>
          <Select name="severity" label={t("severityLabel")} defaultValue="normal">
            {SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {severity(s)}
              </option>
            ))}
          </Select>
          <Field
            label={t("category")}
            name="category"
            defaultValue={t("categoryDefault")}
            required={false}
          />
          <div className="flex flex-col gap-1.5 lg:col-span-2">
            <Checkbox name="blocksAvailability">{t("blockAvailability")}</Checkbox>
            <div className="flex items-center gap-2">
              <Label htmlFor="block-days">{t("blockDays")}</Label>
              <Input
                id="block-days"
                name="blockDays"
                type="number"
                min={1}
                inputMode="numeric"
                defaultValue={3}
                className="w-20"
              />
            </div>
          </div>
          <Field
            label={t("description")}
            name="description"
            className="sm:col-span-2 lg:col-span-5"
          />
          <SubmitButton pendingLabel={t("sending")}>{t("reportIssue")}</SubmitButton>
        </form>
      </Card>
      <Card title={tb("issuesTitle")}>
        {issues.length === 0 ? (
          <EmptyState title={tb("noIssues")} description={t("noIssuesHint")} />
        ) : null}
        <ul className="text-sm" data-testid="issues">
          {issues.map((i) => {
            const where = `${i.propertyTitle} · ${i.unitName ?? t("wholeProperty")}`;
            const cur = currencyOf.get(i.propertyId);
            return (
              <li
                key={i.id}
                className="border-t border-border py-3 first:border-t-0"
                data-state={i.state}
              >
                <p>
                  <span
                    className={`me-2 rounded px-1.5 text-xs font-medium ${i.severity === "urgent" ? "bg-danger-soft text-danger" : i.severity === "high" ? "bg-warning-soft text-warning-soft-foreground" : "bg-background"}`}
                  >
                    {severity(i.severity)}
                  </span>
                  <span className="font-medium">{where}</span> · {i.description}{" "}
                  <span className="text-xs text-muted">
                    {via(i.reportedVia)} · {state(i.state)}
                    {i.blocksAvailability ? ` · ${t("blocksAvailability")}` : ""}
                    {i.costMinor !== null && cur
                      ? ` · ${t("costIs", { amount: money(i.costMinor, cur, locale) })}`
                      : ""}
                    {i.rebillToOwner ? ` · ${t("rebillOwner")}` : ""}
                  </span>
                </p>
                {i.state !== "closed" ? (
                  <form
                    action={updateIssueAction}
                    className="mt-2 flex flex-wrap items-center gap-2 text-xs"
                  >
                    <input type="hidden" name="issueId" value={i.id} />
                    <Select
                      id={`state-${i.id}`}
                      name="state"
                      defaultValue={i.state}
                      className="w-36"
                      size="sm"
                      aria-label={t("statusOf", { unit: where })}
                    >
                      {ISSUE_STATES.map((s) => (
                        <option key={s} value={s}>
                          {state(s)}
                        </option>
                      ))}
                    </Select>
                    <Input
                      name="vendor"
                      placeholder={t("vendor")}
                      aria-label={t("vendor")}
                      className="w-36"
                      defaultValue={i.vendor ?? ""}
                    />
                    <Input
                      name="cost"
                      type="number"
                      step="0.01"
                      min={0}
                      inputMode="decimal"
                      placeholder={t("cost")}
                      aria-label={cur ? t("costIn", { currency: cur }) : t("cost")}
                      className="w-28"
                    />
                    <Checkbox name="rebillToOwner" defaultChecked={i.rebillToOwner}>
                      {t("rebillOwner")}
                    </Checkbox>
                    <SubmitButton variant="secondary" size="sm" pendingLabel={t("saving")}>
                      {t("saveStatus")}
                    </SubmitButton>
                  </form>
                ) : null}
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
