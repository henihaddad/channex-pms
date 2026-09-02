import type React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { currentOrgId, currentSession } from "@/server/session";
import { inboxBadge } from "@/server/inbox-badge";
import { consoleContext } from "@/server/console-context";
import { logoutAction } from "../(auth)/auth.actions";
import { Button } from "@/components/ui";

export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const session = await currentSession();
  if (!session) redirect("/login");
  const t = await getTranslations("nav");
  const orgId = await currentOrgId();
  const badge = orgId ? await inboxBadge(orgId, session.userId) : { unread: 0, breaching: 0 };
  const cx = orgId ? await consoleContext(orgId) : null;
  const tb = await getTranslations("billing");
  const to = await getTranslations("ops");
  const tob = await getTranslations("onboarding");
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
    { href: "/owners", label: t("owners") },
    { href: "/reports", label: t("reports") },
    { href: "/alerts", label: t("alerts") },
    { href: "/operations", label: t("operations") },
    { href: "/front-desk", label: t("frontDesk") },
    { href: "/channels", label: t("channels") },
    { href: "/booking-engine", label: t("bookingEngine") },
    { href: "/sync-health", label: t("syncHealth") },
    { href: "/settings/members", label: t("members") },
    { href: "/settings/organization", label: t("organization") },
    { href: "/settings/audit", label: t("audit") },
    { href: "/settings/billing", label: t("billing") },
    { href: "/settings/plugins", label: t("plugins") },
    { href: "/settings/support", label: t("support") },
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
      <main className="flex-1 p-8">
        {cx?.impersonation ? (
          <p
            className="mb-4 rounded bg-amber-100 p-2 text-sm text-amber-900"
            data-testid="impersonation-banner"
          >
            {to("banner", {
              org: cx.impersonation.orgName,
              time: cx.impersonation.expiresAt.slice(11, 16),
            })}{" "}
            <Link href="/ops/impersonation" className="underline">
              {to("leave")}
            </Link>
          </p>
        ) : null}
        {cx?.state === "past_due" ? (
          <p
            className="mb-4 rounded bg-amber-50 p-2 text-sm text-amber-900"
            data-testid="tenant-banner"
            data-state="past_due"
          >
            {tb("dunning", { date: "" })}{" "}
            <Link href="/settings/billing" className="underline">
              {t("billing")}
            </Link>
          </p>
        ) : null}
        {cx?.announcements.map((a) => (
          <p
            key={a.id}
            className={`mb-4 rounded p-2 text-sm ${a.level === "incident" ? "bg-rose-50 text-rose-900" : a.level === "warning" ? "bg-amber-50 text-amber-900" : "bg-sky-50 text-sky-900"}`}
            data-testid="announcement-banner"
          >
            <strong>{a.title}</strong> {a.body}
          </p>
        ))}
        {cx?.onboarding ? (
          <div
            className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm"
            data-testid="onboarding-checklist"
          >
            <p className="font-semibold">{tob("title")}</p>
            <ol className="mt-1 flex flex-wrap gap-3">
              {cx.onboarding.map((s) => (
                <li key={s.key} data-step={s.key} data-done={s.done ? "1" : "0"}>
                  <Link
                    href={s.href}
                    className={s.done ? "text-emerald-800 line-through" : "underline"}
                  >
                    {s.done ? "✓ " : "○ "}
                    {tob(s.key)}
                  </Link>
                </li>
              ))}
            </ol>
          </div>
        ) : null}
        {cx?.access === "billing_only" ? (
          <div
            className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm"
            data-testid="tenant-banner"
            data-state={cx.state}
          >
            {cx.state === "expired" ? tb("expired") : tb("suspended")}{" "}
            <Link href="/settings/billing" className="underline">
              {t("billing")}
            </Link>
          </div>
        ) : null}
        {cx?.isOperator ? (
          <p className="mb-2 text-end text-xs">
            <Link href="/ops" className="underline" data-testid="ops-link">
              {to("title")}
            </Link>
          </p>
        ) : null}
        {children}
      </main>
    </div>
  );
}
