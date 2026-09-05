import type React from "react";
import { getTranslations } from "next-intl/server";
import { PageTitle, SectionTabs } from "@/components/ui";

/** Settings is one section with local tabs: one place in the sidebar, six pages inside. */
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("nav");
  return (
    <div className="space-y-5">
      <PageTitle>{t("settings")}</PageTitle>
      <SectionTabs
        ariaLabel={t("settings")}
        items={[
          { href: "/settings/organization", label: t("organization"), testId: "tab-organization" },
          { href: "/settings/members", label: t("members"), testId: "tab-members" },
          { href: "/settings/billing", label: t("billing"), testId: "tab-billing" },
          { href: "/settings/plugins", label: t("plugins") },
          { href: "/settings/audit", label: t("audit") },
          { href: "/settings/support", label: t("support") },
        ]}
      />
      {children}
    </div>
  );
}
