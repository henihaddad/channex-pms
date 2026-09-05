import { getTranslations } from "next-intl/server";
import { Breadcrumbs, Card, PageTitle } from "@/components/ui";
import { guard } from "@/server/guard";
import { listGroups, listTemplates } from "../properties.actions";
import { PropertyWizard, type WizardLabels } from "./wizard";
import { loadOrganization } from "../../settings/organization/organization.actions";

export default async function NewPropertyPage() {
  const t = await getTranslations("properties");
  const w = await getTranslations("properties.wizard");
  const [templates, groups, org] = await guard(() =>
    Promise.all([listTemplates(), listGroups(), loadOrganization()]),
  );
  const kinds = (k: "single_unit" | "multi_unit" | "hotel") => ({
    title: w(`kinds.${k}.title`),
    hint: w(`kinds.${k}.hint`),
  });
  const labels: WizardLabels = {
    step1: w("step1"),
    step2: w("step2"),
    step3: w("step3"),
    kinds: {
      single_unit: kinds("single_unit"),
      multi_unit: kinds("multi_unit"),
      hotel: kinds("hotel"),
    },
    title: w("title"),
    titlePlaceholder: w("titlePlaceholder"),
    city: w("city"),
    country: w("country"),
    currency: w("currency"),
    timezone: w("timezone"),
    optional: w("optional"),
    roomTypes: w("roomTypes"),
    roomName: w("roomName"),
    rooms: w("rooms"),
    adults: w("adults"),
    children: w("children"),
    addRoomType: w("addRoomType"),
    ratePlans: w("ratePlans"),
    ratePlansHint: w("ratePlansHint"),
    planName: w("planName"),
    roomType: w("roomType"),
    nightlyPrice: w("nightlyPrice"),
    minNights: w("minNights"),
    addRatePlan: w("addRatePlan"),
    advanced: w("advanced"),
    template: w("template"),
    none: w("none"),
    groups: w("groups"),
    templateName: w("templateName"),
    saveTemplate: w("saveTemplate"),
    create: w("create"),
    afterCreate: w("afterCreate"),
  };
  const country = org.country || "DE";
  const tz: Record<string, string> = {
    DE: "Europe/Berlin",
    FR: "Europe/Paris",
    ES: "Europe/Madrid",
    PT: "Europe/Lisbon",
    IT: "Europe/Rome",
    GB: "Europe/London",
    MA: "Africa/Casablanca",
    TN: "Africa/Tunis",
    AE: "Asia/Dubai",
    US: "America/New_York",
  };
  return (
    <div className="space-y-5">
      <Breadcrumbs items={[{ href: "/properties", label: t("title") }, { label: t("new") }]} />
      <PageTitle>{t("new")}</PageTitle>
      <Card>
        <PropertyWizard
          templates={templates.map((x) => ({ id: x.id, name: x.name }))}
          groups={groups}
          labels={labels}
          defaults={{
            country,
            currency: org.defaultCurrency || "EUR",
            timezone: tz[country] ?? "Europe/Berlin",
          }}
        />
      </Card>
    </div>
  );
}
