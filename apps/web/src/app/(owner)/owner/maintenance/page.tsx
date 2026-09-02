import { getTranslations } from "next-intl/server";
import { Button, Card, PageTitle, Select } from "@/components/ui";
import { guard } from "@/server/guard";
import { loadPortalIssues, raiseIssueAction } from "../portal.actions";

export default async function OwnerMaintenance() {
  const t = await getTranslations("owner");
  const v = await guard(() => loadPortalIssues());
  return (
    <div className="space-y-4">
      <PageTitle>{t("nav.maintenance")}</PageTitle>
      <p className="text-sm text-slate-600">{t("maintenanceHint")}</p>
      <Card className="text-sm">
        {v.issues.length === 0 ? <p className="text-xs text-slate-500">{t("noIssues")}</p> : null}
        {v.issues.map((i) => (
          <p
            key={i.id}
            className="border-t border-slate-100 py-1 text-xs"
            data-testid="owner-issue"
          >
            {i.createdAt.slice(0, 10)} · {i.propertyTitle} · {i.severity} · {i.description} ·{" "}
            {i.state}
            {i.rebilled ? " · billed to you" : ""}
          </p>
        ))}
      </Card>
      <Card>
        <form action={raiseIssueAction} className="space-y-2 text-sm">
          <p className="font-medium">{t("raiseIssue")}</p>
          <Select name="propertyId">
            {v.properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </Select>
          <textarea
            name="description"
            rows={3}
            required
            placeholder={t("describe")}
            className="w-full rounded border border-slate-300 p-2 text-sm"
            data-testid="issue-description"
          />
          <Button type="submit" data-testid="raise-issue">
            {t("raise")}
          </Button>
        </form>
      </Card>
    </div>
  );
}
