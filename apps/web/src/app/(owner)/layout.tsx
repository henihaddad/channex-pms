import type React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { currentSession } from "@/server/session";
import { logoutAction } from "../(auth)/auth.actions";
import { Brand, SiteFooter, SiteHeader } from "@/components/site";
import { loadPortalWho } from "./owner/portal.actions";

/**
 * The owner portal shell (spec 17 §17.5; persona: the owner checking on their place):
 * the manager's brand, who is signed in, the owner's own pages. Mobile-first.
 */
export default async function OwnerLayout({ children }: { children: React.ReactNode }) {
  const session = await currentSession();
  if (!session) redirect("/owner-login");
  const t = await getTranslations("owner.nav");
  const who = await loadPortalWho().catch(() => null);
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
    <div className="flex min-h-screen flex-col bg-background" data-testid="owner-portal">
      <SiteHeader brand={<Brand name={who?.orgName || "OTAbridge"} href="/owner" />}>
        <span className="text-[13px] text-muted max-sm:hidden">
          {t("portalLong")}
          {who ? ` · ${who.ownerName}` : ""}
        </span>
        <form action={logoutAction}>
          <button
            type="submit"
            className="rounded-full border border-[#d5d9d7] px-4 py-2 text-sm font-medium text-foreground hover:bg-default"
          >
            {t("signOut")}
          </button>
        </form>
      </SiteHeader>
      <nav
        aria-label={t("portalLong")}
        className="scrollbar-none mx-auto flex w-full max-w-[1100px] gap-1 overflow-x-auto px-4 pt-4 text-sm sm:px-6"
      >
        {links.map(([href, label]) => (
          <Link
            key={href}
            href={href}
            className="shrink-0 rounded-full px-3 py-1.5 font-medium text-muted transition-colors hover:bg-surface hover:text-foreground"
          >
            {label}
          </Link>
        ))}
      </nav>
      <main className="mx-auto flex w-full max-w-[1100px] flex-col gap-4 px-4 pt-5 pb-12 sm:px-6">
        {children}
      </main>
      <SiteFooter
        left={<span>© {who?.orgName}</span>}
        right={
          <span>
            {t("poweredBy")} <strong className="font-semibold text-accent">OTAbridge</strong>
          </span>
        }
      />
    </div>
  );
}
