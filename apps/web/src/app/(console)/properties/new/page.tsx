import { getTranslations } from "next-intl/server";
import { Card, PageTitle } from "@/components/ui";
import { guard } from "@/server/guard";
import { listGroups, listTemplates } from "../properties.actions";
import { PropertyWizard } from "./wizard";

export default async function NewPropertyPage() {
  const t = await getTranslations("properties");
  const [templates, groups] = await guard(() => Promise.all([listTemplates(), listGroups()]));
  return (
    <div className="space-y-6">
      <PageTitle>{t("new")}</PageTitle>
      <Card>
        <PropertyWizard
          templates={templates.map((x) => ({ id: x.id, name: x.name }))}
          groups={groups}
        />
      </Card>
    </div>
  );
}
