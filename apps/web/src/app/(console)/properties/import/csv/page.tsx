import { getTranslations } from "next-intl/server";
import { Card, PageHeader } from "@/components/ui";
import { guard } from "@/server/guard";
import { listTemplates } from "../../properties.actions";
import { TabsOverride } from "../../tabs-override";
import { ImportForm } from "./import-form";

/** Bulk CSV import (spec 03 §3.2): one row per listing, optionally from a template. */
export default async function ImportCsvPage() {
  const t = await getTranslations("properties");
  const templates = await guard(() => listTemplates());
  return (
    <TabsOverride items={null}>
      <div className="space-y-6">
        <PageHeader
          title={t("import")}
          description={t("importHint")}
          crumb={[{ href: "/properties", label: t("title") }, { label: t("import") }]}
        />
        <Card>
          <ImportForm templates={templates.map((x) => ({ id: x.id, name: x.name }))} />
        </Card>
      </div>
    </TabsOverride>
  );
}
