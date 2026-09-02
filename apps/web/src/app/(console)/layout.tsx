import type React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { currentOrgId, currentSession } from "@/server/session";
import { inboxBadge } from "@/server/inbox-badge";
import { logoutAction } from "../(auth)/auth.actions";
import { Button } from "@/components/ui";

export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const session = await currentSession();
  if (!session) redirect("/login");
  const t = await getTranslations("nav");
  const orgId = await currentOrgId();
  const badge = orgId ? await inboxBadge(orgId, session.userId) : { unread: 0, breaching: 0 };
  const inboxLabel =
    badge.unread > 0 || badge.breaching > 0
      ? `${t("inbox")} (${String(badge.unread)}${badge.breaching ? ` · ${String(badge.breaching)} SLA` : ""})`
      : t("inbox");
  const links = [
    { href: "/", label: t("dashboard") },
    { href: "/properties", label: t("properties") },
    { href: "/calendar", label: t("calendar") },
    { href: "/reservations", label: t("reservations") },
    { href: "/inbox", label: inboxLabel },
    { href: "/reviews", label: t("reviews") },
    { href: "/operations", label: t("operations") },
    { href: "/front-desk", label: t("frontDesk") },
    { href: "/channels", label: t("channels") },
    { href: "/sync-health", label: t("syncHealth") },
    { href: "/settings/members", label: t("members") },
    { href: "/settings/organization", label: t("organization") },
    { href: "/settings/audit", label: t("audit") },
  ] as const;
  return (
    <div className="flex min-h-screen">
      <aside className="w-60 shrink-0 border-e border-slate-200 bg-white p-4">
        <p className="mb-6 text-sm font-bold text-emerald-700">Channex PMS</p>
        <nav className="space-y-1">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="block rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
              data-testid={l.href === "/inbox" ? "nav-inbox" : undefined}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <form action={logoutAction} className="mt-8">
          <Button type="submit" variant="secondary" className="w-full">
            {t("signOut")}
          </Button>
        </form>
      </aside>
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
