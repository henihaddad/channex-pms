import { getTranslations } from "next-intl/server";
import { currentSession } from "@/server/session";
import { memberships } from "@/server/auth-flows";
import { Card, PageTitle } from "@/components/ui";

export default async function DashboardPage() {
  const session = (await currentSession())!;
  const t = await getTranslations("dashboard");
  const orgs = await memberships(session.userId);
  return (
    <div className="space-y-6">
      <PageTitle>{t("welcome", { name: orgs[0]?.name ?? "" })}</PageTitle>
      <Card>
        <p className="text-slate-700">{t("milestone")}</p>
      </Card>
      <Card>
        <h2 className="mb-2 font-semibold">{t("organizations")}</h2>
        <ul className="list-disc ps-5 text-sm text-slate-700">
          {orgs.map((o) => (
            <li key={o.orgId}>
              {o.name} <span className="text-slate-400">/{o.slug}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
