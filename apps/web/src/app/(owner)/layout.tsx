import type React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { currentSession } from "@/server/session";
import { logoutAction } from "../(auth)/auth.actions";
import { Button } from "@/components/ui";

/** The owner portal shell (spec 17 §17.5): mobile-first, the owner's own things only. */
export default async function OwnerLayout({ children }: { children: React.ReactNode }) {
  const session = await currentSession();
  if (!session) redirect("/owner-login");
  const t = await getTranslations("owner.nav");
  const links = [
    ["/owner", t("dashboard")],
    ["/owner/calendar", t("calendar")],
    ["/owner/statements", t("statements")],
    ["/owner/expenses", t("expenses")],
    ["/owner/maintenance", t("maintenance")],
    ["/owner/reviews", t("reviews")],
    ["/owner/documents", t("documents")],
  ] as const;
  return (
    <div className="mx-auto max-w-3xl p-4" data-testid="owner-portal">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
        <p className="text-sm font-bold text-emerald-700">Channex PMS · Owner</p>
        <nav className="flex flex-wrap gap-1 text-sm">
          {links.map(([href, label]) => (
            <Link key={href} href={href} className="rounded px-2 py-1 hover:bg-slate-100">
              {label}
            </Link>
          ))}
          <form action={logoutAction}>
            <Button type="submit" variant="secondary" className="h-7 text-xs">
              {t("signOut")}
            </Button>
          </form>
        </nav>
      </header>
      <main>{children}</main>
    </div>
  );
}
