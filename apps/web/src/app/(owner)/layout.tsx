import type React from "react";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { currentSession } from "@/server/session";
import { logoutAction } from "../(auth)/auth.actions";
import { Brand, SiteFooter, SiteHeader } from "@/components/site";
import { SubmitButton } from "@/components/ui";
import { loadPortalWho } from "./owner/portal.actions";
import { OwnerNav } from "./owner-nav";

/**
 * The owner portal shell (spec 17 §17.5; persona: the owner checking on their place):
 * the manager's brand, who is signed in, the owner's own pages. Mobile-first.
 */
export default async function OwnerLayout({ children }: { children: React.ReactNode }) {
  const session = await currentSession();
  if (!session) redirect("/owner-login");
  const [t, who] = await Promise.all([
    getTranslations("owner.nav"),
    loadPortalWho().catch(() => null),
  ]);
  const links: Array<[string, string]> = [
    ["/owner", t("home")],
    ["/owner/calendar", t("calendar")],
    ["/owner/statements", t("statements")],
    ["/owner/expenses", t("expenses")],
    ["/owner/maintenance", t("maintenance")],
    ["/owner/reviews", t("reviews")],
    ["/owner/documents", t("documents")],
  ];
  return (
    <div className="flex min-h-screen flex-col bg-background" data-testid="owner-portal">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:start-2 focus:top-2 focus:z-10 focus:rounded-xl focus:bg-surface focus:p-2 focus:shadow-surface"
      >
        {t("skip")}
      </a>
      <SiteHeader brand={<Brand name={who?.orgName || "OTAbridge"} href="/owner" />}>
        <span className="text-[13px] text-muted max-sm:hidden">
          {t("portalLong")}
          {who ? ` · ${who.ownerName}` : ""}
        </span>
        <form action={logoutAction}>
          <SubmitButton variant="secondary" size="sm" className="rounded-full">
            {t("signOut")}
          </SubmitButton>
        </form>
      </SiteHeader>
      <OwnerNav label={t("portalLong")} links={links} />
      <main
        id="main"
        className="mx-auto flex w-full max-w-[1100px] flex-col gap-4 px-4 pt-5 pb-12 sm:px-6"
      >
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
