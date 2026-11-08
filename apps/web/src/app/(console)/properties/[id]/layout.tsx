import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { TabsOverride } from "../tabs-override";

/**
 * One property's own pages as tabs under its title (design "Property"): Overview, Rooms &
 * rates, Guide, Pricing, Photos, Rules & policies, Settings. Rooms, photos, rules and settings
 * are sections of the overview; the guide and pricing are pages of their own.
 */
export default async function PropertyLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getTranslations("properties.detailTabs");
  const base = `/properties/${id}`;
  return (
    <TabsOverride
      ariaLabel={t("label")}
      items={[
        { href: base, label: t("overview"), exact: true },
        { href: `${base}#rooms`, label: t("rooms") },
        { href: `${base}/guide`, label: t("guide"), testId: "open-guide" },
        { href: `${base}/pricing`, label: t("pricing"), testId: "open-pricing" },
        { href: `${base}#photos`, label: t("photos") },
        { href: `${base}#rules`, label: t("rules") },
        { href: `${base}#settings`, label: t("settings") },
      ]}
    >
      {children}
    </TabsOverride>
  );
}
