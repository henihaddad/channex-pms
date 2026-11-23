import { getLocale, getTranslations } from "next-intl/server";
import { Card, Label, PageTitle, Select, SubmitButton, Textarea } from "@/components/ui";
import { guard } from "@/server/guard";
import { day } from "@/lib/format";
import { loadPortalIssues, raiseIssueAction } from "../portal.actions";

export async function generateMetadata() {
  const t = await getTranslations("owner");
  return { title: t("nav.maintenance") };
}

/** Issues on the owner's units, and a way to raise one (spec 17 §17.5; persona: the owner). */
export default async function OwnerMaintenance() {
  const [t, locale] = await Promise.all([getTranslations("owner"), getLocale()]);
  const v = await guard(() => loadPortalIssues());
  return (
    <div className="space-y-4">
      <PageTitle>{t("nav.maintenance")}</PageTitle>
      <p className="text-sm text-muted">{t("maintenanceHint")}</p>
      <Card className="text-sm">
        {v.issues.length === 0 ? <p className="text-xs text-muted">{t("noIssues")}</p> : null}
        {v.issues.map((i) => (
          <p key={i.id} className="border-t border-border py-1 text-xs" data-testid="owner-issue">
            {day(i.createdAt.slice(0, 10), locale)} · {i.propertyTitle} · {i.severity} ·{" "}
            {i.description} · {i.state}
            {i.rebilled ? ` · ${t("billedToYou")}` : ""}
          </p>
        ))}
      </Card>
      <Card>
        <form action={raiseIssueAction} className="space-y-3 text-sm">
          <p className="font-medium">{t("raiseIssue")}</p>
          <Select label={t("property")} name="propertyId">
            {v.properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </Select>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="issue-description">{t("describe")}</Label>
            <Textarea
              id="issue-description"
              name="description"
              rows={3}
              required
              data-testid="issue-description"
            />
          </div>
          <SubmitButton testId="raise-issue" pendingLabel={t("raising")}>
            {t("raise")}
          </SubmitButton>
        </form>
      </Card>
    </div>
  );
}
