import { getTranslations } from "next-intl/server";
import { Card, PageTitle } from "@/components/ui";
import { guard } from "@/server/guard";
import { loadOrganization } from "./organization.actions";
import { OrganizationForm } from "./organization-form";

export default async function OrganizationPage() {
  const t = await getTranslations("org");
  const org = await guard(() => loadOrganization());
  return (
    <div className="space-y-6">
      <PageTitle>{t("title")}</PageTitle>
      <Card>
        <OrganizationForm
          org={org}
          labels={{ name: t("name"), locale: t("locale"), save: t("save"), saved: t("saved") }}
        />
        <p className="mt-4 text-xs text-muted">
          /{org.slug} · {org.country} · {org.defaultCurrency} · {org.state}
        </p>
      </Card>
    </div>
  );
}
