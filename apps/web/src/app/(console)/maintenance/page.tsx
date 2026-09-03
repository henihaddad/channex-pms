import { getTranslations } from "next-intl/server";
import { Button, Card, Field, Input, PageTitle, Select } from "@/components/ui";
import { guard } from "@/server/guard";
import { createIssueAction, loadIssues, loadBlocks } from "../operations/operations.actions";
import { updateIssueAction } from "../operations/operations.actions";

/** Maintenance (spec 08 §8.8): triage, block availability, track cost, rebill-to-owner hook for M5. */
export default async function MaintenancePage() {
  const t = await getTranslations("operations");
  const [issues, { units }] = await guard(() => Promise.all([loadIssues(), loadBlocks()]));
  return (
    <div className="space-y-4">
      <PageTitle>{t("maintenance")}</PageTitle>
      <Card>
        <form
          action={createIssueAction}
          className="grid grid-cols-6 items-end gap-2 text-sm"
          data-testid="issue-form"
        >
          <div className="col-span-2">
            <label className="mb-1 block text-xs font-medium">Unit</label>
            <Select name="unitId">
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.propertyTitle} · {u.name}
                </option>
              ))}
            </Select>
          </div>
          <input type="hidden" name="propertyId" value={units[0]?.propertyId ?? ""} />
          <div>
            <label className="mb-1 block text-xs font-medium">Severity</label>
            <Select name="severity" defaultValue="normal">
              <option value="low">low</option>
              <option value="normal">normal</option>
              <option value="high">high</option>
              <option value="urgent">urgent</option>
            </Select>
          </div>
          <Field label="Category" name="category" defaultValue="general" required={false} />
          <label className="flex items-center gap-1 text-xs">
            <input type="checkbox" name="blocksAvailability" /> block availability (
            <Input
              name="blockDays"
              type="number"
              defaultValue={3}
              className="h-6 w-14 text-xs"
            />{" "}
            days)
          </label>
          <Button type="submit">{t("reportIssue")}</Button>
          <div className="col-span-6">
            <Field label="Description" name="description" />
          </div>
        </form>
      </Card>
      <Card>
        <ul className="text-sm" data-testid="issues">
          {issues.map((i) => (
            <li key={i.id} className="border-t border-line py-2" data-state={i.state}>
              <p>
                <span
                  className={`me-2 rounded px-1.5 text-[10px] uppercase ${i.severity === "urgent" ? "bg-rose-soft text-rose" : i.severity === "high" ? "bg-amber-soft text-amber-deep" : "bg-canvas"}`}
                >
                  {i.severity}
                </span>
                <span className="font-medium">
                  {i.propertyTitle} · {i.unitName ?? "property"}
                </span>{" "}
                · {i.description}{" "}
                <span className="text-xs text-muted">
                  via {i.reportedVia} · {i.state}
                  {i.blocksAvailability ? " · blocks availability" : ""}
                  {i.costMinor !== null ? ` · cost ${(i.costMinor / 100).toFixed(2)}` : ""}
                  {i.rebillToOwner ? " · rebill to owner" : ""}
                </span>
              </p>
              {i.state !== "closed" ? (
                <form
                  action={updateIssueAction}
                  className="mt-1 flex flex-wrap items-center gap-1 text-xs"
                >
                  <input type="hidden" name="issueId" value={i.id} />
                  <Select name="state" defaultValue={i.state} className="h-7 w-32">
                    <option value="open">open</option>
                    <option value="assigned">assigned</option>
                    <option value="in_progress">in progress</option>
                    <option value="closed">closed</option>
                  </Select>
                  <Input
                    name="vendor"
                    placeholder="vendor"
                    className="h-7 w-32"
                    defaultValue={i.vendor ?? ""}
                  />
                  <Input
                    name="cost"
                    type="number"
                    step="0.01"
                    placeholder="cost"
                    className="h-7 w-24"
                  />
                  <label className="flex items-center gap-1">
                    <input type="checkbox" name="rebillToOwner" defaultChecked={i.rebillToOwner} />{" "}
                    {t("rebillOwner")}
                  </label>
                  <Button type="submit" variant="secondary" className="h-7 px-2">
                    Update
                  </Button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
