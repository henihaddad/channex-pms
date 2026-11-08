import { getTranslations } from "next-intl/server";
import { Card, LinkButton, PageHeader } from "@/components/ui";
import { guard } from "@/server/guard";
import { listGroups, listTemplates } from "../properties.actions";
import { PropertyWizard, type WizardLabels } from "./wizard";
import { loadOrganization } from "../../settings/organization/organization.actions";
import { TabsOverride } from "../tabs-override";

const TZ: Record<string, string> = {
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
  ZA: "Africa/Johannesburg",
};

/** "Add a property" (design canvas): a step rail, the Airbnb shortcut, then one form. */
export default async function NewPropertyPage() {
  const t = await getTranslations("properties");
  const w = await getTranslations("properties.wizard");
  const [templates, groups, org] = await guard(() =>
    Promise.all([listTemplates(), listGroups(), loadOrganization()]),
  );
  const labels: WizardLabels = {
    basics: w("basics"),
    firstRoom: w("firstRoom"),
    firstRoomHint: w("firstRoomHint"),
    title: w("title"),
    titlePlaceholder: w("titlePlaceholder"),
    kind: w("kind"),
    kindHint: w("kindHint"),
    kinds: {
      single_unit: w("kinds.single_unit.option"),
      multi_unit: w("kinds.multi_unit.option"),
      hotel: w("kinds.hotel.option"),
    },
    country: w("country"),
    city: w("city"),
    street: w("street"),
    postcode: w("postcode"),
    currency: w("currency"),
    timezone: w("timezone"),
    roomName: w("roomName"),
    units: w("units"),
    sleeps: w("sleeps"),
    baseRate: w("baseRate"),
    baseRateHint: w("baseRateHint"),
    minStay: w("minStay"),
    addRoomType: w("addRoomType"),
    remove: w("remove"),
    advanced: w("advanced"),
    template: w("template"),
    none: w("none"),
    groups: w("groups"),
    templateName: w("templateName"),
    saveTemplate: w("saveTemplate"),
    create: w("create"),
    cancel: w("cancel"),
    afterCreate: w("afterCreate"),
  };
  const country = org.country || "DE";
  const steps = [
    { n: 1, label: w("rail.basics"), href: "#basics", here: true },
    { n: 2, label: w("rail.rooms"), href: "#rooms", here: true },
    { n: 3, label: w("rail.photos"), here: false },
    { n: 4, label: w("rail.channels"), here: false },
  ];
  return (
    <TabsOverride items={null}>
      <div className="space-y-5">
        <PageHeader
          title={w("pageTitle")}
          crumb={[{ href: "/properties", label: t("title") }, { label: w("crumb") }]}
        />
        <div className="grid items-start gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
          <aside className="flex flex-col gap-5 lg:sticky lg:top-6">
            <ol className="flex flex-col gap-3 text-sm" aria-label={w("rail.label")}>
              {steps.map((s) => (
                <li key={s.n} className="flex items-center gap-3">
                  <span
                    className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-semibold ${
                      s.here
                        ? "bg-accent-soft text-accent-soft-foreground"
                        : "border border-border text-muted"
                    }`}
                  >
                    {s.n}
                  </span>
                  {s.href ? (
                    <a href={s.href} className="font-semibold text-foreground hover:underline">
                      {s.label}
                    </a>
                  ) : (
                    <span className="text-muted">
                      {s.label}
                      <span className="block text-xs">{w("rail.after")}</span>
                    </span>
                  )}
                </li>
              ))}
            </ol>
            <Card className="gap-3">
              <p className="text-sm leading-relaxed text-muted">
                <strong className="text-foreground">{w("airbnb.title")}</strong> {w("airbnb.body")}
              </p>
              <LinkButton href="/properties/import" variant="secondary" fullWidth className="mt-3">
                {t("importAirbnb")}
              </LinkButton>
            </Card>
          </aside>
          <PropertyWizard
            templates={templates.map((x) => ({ id: x.id, name: x.name }))}
            groups={groups}
            labels={labels}
            defaults={{
              country,
              currency: org.defaultCurrency || "EUR",
              timezone: TZ[country] ?? "Europe/Berlin",
            }}
          />
        </div>
      </div>
    </TabsOverride>
  );
}
