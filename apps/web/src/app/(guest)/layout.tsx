import type React from "react";
import { getTranslations } from "next-intl/server";

/** The guest portal shell (spec 10 §10.6): one booking, no account, nothing from a third party. */
export default async function GuestLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("book");
  return (
    <div className="mx-auto min-h-screen max-w-2xl p-4" data-testid="guest-portal">
      <main>{children}</main>
      <footer className="mt-10 border-t border-line pt-3 text-xs text-muted">
        {t("poweredBy")}
      </footer>
    </div>
  );
}
