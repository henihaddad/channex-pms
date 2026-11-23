import { getTranslations } from "next-intl/server";
import { Card, SectionTitle } from "@/components/ui";
import { guard } from "@/server/guard";
import { LOCALES } from "@/i18n/request";
import { loadOrganization } from "./organization.actions";
import { OrganizationForm } from "./organization-form";

export async function generateMetadata() {
  const t = await getTranslations("org");
  return { title: t("title") };
}

/** A language named in itself, first letter up ("français" → "Français"). */
const nativeName = (code: string): string => {
  const name = new Intl.DisplayNames([code], { type: "language" }).of(code) ?? code;
  return name.charAt(0).toLocaleUpperCase(code) + name.slice(1);
};

/** Organization (spec 13 §13.8): its name and the language new members and emails start in. */
export default async function OrganizationPage() {
  const t = await getTranslations("org");
  const org = await guard(() => loadOrganization());
  const languages = LOCALES.map((code) => ({ code, name: nativeName(code) }));
  return (
    <div className="space-y-6">
      <SectionTitle>{t("title")}</SectionTitle>
      <Card>
        <OrganizationForm
          org={org}
          languages={languages}
          labels={{
            name: t("name"),
            locale: t("locale"),
            localeHint: t("localeHint"),
            save: t("save"),
            saving: t("saving"),
            saved: t("saved"),
          }}
        />
        <p className="mt-4 text-xs text-muted">
          /{org.slug} · {org.country} · {org.defaultCurrency} · {org.state}
        </p>
      </Card>
    </div>
  );
}
