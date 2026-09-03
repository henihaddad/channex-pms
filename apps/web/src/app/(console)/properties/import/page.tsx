import { getTranslations } from "next-intl/server";
import { Card, PageTitle } from "@/components/ui";
import { guard } from "@/server/guard";
import { listTemplates } from "../properties.actions";
import { ImportForm } from "./import-form";

export default async function ImportPage() {
  const t = await getTranslations("properties");
  const templates = await guard(() => listTemplates());
  return (
    <div className="space-y-6">
      <PageTitle>{t("import")}</PageTitle>
      <Card>
        <p className="mb-3 text-sm text-muted">{t("importHint")}</p>
        <ImportForm templates={templates.map((x) => ({ id: x.id, name: x.name }))} />
      </Card>
    </div>
  );
}
