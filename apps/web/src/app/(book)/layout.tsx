import type React from "react";
import { getTranslations } from "next-intl/server";

/** The public funnel shell: no console chrome, no third-party scripts (BE-11), keyboard-first (BE-10). */
export default async function BookLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("book");
  return (
    <div className="mx-auto min-h-screen max-w-4xl p-4" data-testid="booking-engine">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:start-2 focus:top-2 focus:rounded focus:bg-white focus:p-2"
      >
        Skip to content
      </a>
      <main id="main">{children}</main>
      <footer className="mt-10 border-t border-slate-200 pt-3 text-xs text-slate-500">
        {t("poweredBy")}
      </footer>
    </div>
  );
}
