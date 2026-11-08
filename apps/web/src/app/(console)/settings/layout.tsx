import type React from "react";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui";
import { SettingsNav } from "./settings-nav";

/**
 * Settings is one section (design board "Settings — Integrations"): the title once, the
 * settings pages in a sub-nav on the left, the page on the right. Only pages that exist are
 * listed; nothing here is a placeholder.
 */
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("nav");
  const ts = await getTranslations("settings");
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("settings")} />
      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <SettingsNav
          label={ts("pages")}
          items={[
            { href: "/settings/organization", label: t("organization") },
            { href: "/settings/members", label: ts("team") },
            { href: "/settings/billing", label: t("billing") },
            { href: "/settings/integrations", label: t("integrations") },
            { href: "/settings/plugins", label: ts("webhooks") },
            { href: "/settings/audit", label: t("audit") },
            { href: "/settings/support", label: t("support") },
          ]}
        />
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
