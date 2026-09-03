import type React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { currentSession } from "@/server/session";
import { logoutAction } from "../(auth)/auth.actions";
import { Button } from "@/components/ui";
import { Logo } from "@/components/logo";

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
    <div className="mx-auto flex max-w-3xl flex-col gap-5 p-4 sm:p-6" data-testid="owner-portal">
      <header className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <Logo size={26} suffix={t("portal")} />
          <form action={logoutAction}>
            <Button type="submit" variant="secondary" size="sm">
              {t("signOut")}
            </Button>
          </form>
        </div>
        <nav className="scrollbar-none flex gap-1 overflow-x-auto rounded-2xl bg-default p-1 text-sm">
          {links.map(([href, label]) => (
            <Link
              key={href}
              href={href}
              className="shrink-0 rounded-xl px-3 py-1.5 font-medium text-muted transition-colors hover:bg-surface hover:text-foreground"
            >
              {label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="flex flex-col gap-4">{children}</main>
    </div>
  );
}
