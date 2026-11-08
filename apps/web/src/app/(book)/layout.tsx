import type React from "react";
import { getTranslations } from "next-intl/server";

/**
 * The public funnel shell: no console chrome, no third-party scripts (BE-11),
 * keyboard-first (BE-10). Each page draws the manager's branded header and footer,
 * because the brand comes from the property or organization the page is about.
 */
export default async function BookLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("book");
  return (
    <div className="flex min-h-screen flex-col bg-background" data-testid="booking-engine">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:start-2 focus:top-2 focus:z-10 focus:rounded-xl focus:bg-surface focus:p-2 focus:shadow-surface"
      >
        {t("skip")}
      </a>
      {children}
    </div>
  );
}
