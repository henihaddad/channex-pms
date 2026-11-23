import type React from "react";
import { getTranslations } from "next-intl/server";

/**
 * The guest portal shell (spec 10 §10.6): one booking, no account, nothing from a third
 * party. The page draws the manager's branded header and footer, since the brand comes
 * from the booking it shows; the skip link lands on its `<main id="main">`.
 */
export default async function GuestLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("guest");
  return (
    <div className="flex min-h-screen flex-col bg-background" data-testid="guest-portal">
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
