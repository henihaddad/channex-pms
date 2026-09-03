import type React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { currentOrgId, currentSession } from "@/server/session";
import { inboxBadge } from "@/server/inbox-badge";
import { consoleContext } from "@/server/console-context";
import { memberships } from "@/server/auth-flows";
import { logoutAction } from "../(auth)/auth.actions";
import { Logo } from "@/components/logo";
import { NavLink } from "./nav-link";

/**
 * The console shell. The sidebar is grouped by what an operator does, not by
 * module: today's work, the portfolio, insight, settings. The bridge rail along
 * the top of the workspace is the brand's one device.
 */
export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const session = await currentSession();
  if (!session) redirect("/login");
  const t = await getTranslations("nav");
  const orgId = await currentOrgId();
  const badge = orgId ? await inboxBadge(orgId, session.userId) : { unread: 0, breaching: 0 };
  const cx = orgId ? await consoleContext(orgId) : null;
  const orgs = await memberships(session.userId);
  const org = orgs.find((o) => o.orgId === orgId) ?? orgs[0];
  const tb = await getTranslations("billing");
  const to = await getTranslations("ops");
  const tob = await getTranslations("onboarding");
  const inboxLabel =
    badge.unread > 0 || badge.breaching > 0
      ? `${t("inbox")} (${String(badge.unread)}${badge.breaching ? ` · ${String(badge.breaching)} SLA` : ""})`
      : t("inbox");
  const groups: Array<{
    label: string;
    links: Array<{ href: string; label: string; badge?: number; alert?: boolean }>;
  }> = [
    {
      label: t("groups.today"),
      links: [
        { href: "/", label: t("dashboard") },
        { href: "/calendar", label: t("calendar") },
        { href: "/reservations", label: t("reservations") },
        { href: "/inbox", label: inboxLabel, badge: badge.unread, alert: badge.breaching > 0 },
        { href: "/operations", label: t("operations") },
        { href: "/front-desk", label: t("frontDesk") },
      ],
    },
    {
      label: t("groups.portfolio"),
      links: [
        { href: "/properties", label: t("properties") },
        { href: "/channels", label: t("channels") },
        { href: "/booking-engine", label: t("bookingEngine") },
        { href: "/owners", label: t("owners") },
      ],
    },
    {
      label: t("groups.insight"),
      links: [
        { href: "/reports", label: t("reports") },
        { href: "/alerts", label: t("alerts") },
        { href: "/reviews", label: t("reviews") },
        { href: "/sync-health", label: t("syncHealth") },
      ],
    },
    {
      label: t("groups.settings"),
      links: [
        { href: "/settings/members", label: t("members") },
        { href: "/settings/organization", label: t("organization") },
        { href: "/settings/billing", label: t("billing") },
        { href: "/settings/plugins", label: t("plugins") },
        { href: "/settings/audit", label: t("audit") },
        { href: "/settings/support", label: t("support") },
      ],
    },
  ];
  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col bg-ink text-white/80">
        <div className="px-5 pt-5 pb-4">
          <Link href="/" className="inline-flex text-white" aria-label="OTAbridge">
            <Logo size={30} />
          </Link>
          <div className="bridge-rail mt-4 h-px w-full opacity-70" />
          {org ? (
            <p className="mt-3 truncate text-xs font-medium text-white/55" data-testid="org-name">
              {org.name}
            </p>
          ) : null}
        </div>
        <nav className="flex-1 overflow-y-auto px-3 pb-4" aria-label="Main">
          {groups.map((g) => (
            <div key={g.label} className="mb-4">
              <p className="mb-1 px-3 text-[0.65rem] font-semibold tracking-[0.14em] text-white/40 uppercase">
                {g.label}
              </p>
              <ul className="space-y-0.5">
                {g.links.map((l) => (
                  <li key={l.href}>
                    <NavLink
                      href={l.href}
                      label={l.label}
                      badge={l.badge}
                      alert={l.alert}
                      testId={l.href === "/inbox" ? "nav-inbox" : undefined}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <div className="border-t border-white/10 px-5 py-4">
          {cx?.isOperator ? (
            <Link
              href="/ops"
              className="mb-3 block text-xs text-sky hover:text-white"
              data-testid="ops-link"
            >
              {to("title")} →
            </Link>
          ) : null}
          <form action={logoutAction}>
            <button
              type="submit"
              className="w-full rounded-lg border border-white/15 px-3 py-2 text-sm font-medium text-white/80 transition-colors hover:border-white/40 hover:text-white"
            >
              {t("signOut")}
            </button>
          </form>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="bridge-rail h-[3px] w-full" aria-hidden="true" />
        <main className="flex-1 px-8 py-7">
          {cx?.impersonation ? (
            <p
              className="mb-4 rounded-lg border border-amber/40 bg-amber-soft px-3 py-2 text-sm text-text"
              data-testid="impersonation-banner"
            >
              {to("banner", {
                org: cx.impersonation.orgName,
                time: cx.impersonation.expiresAt.slice(11, 16),
              })}{" "}
              <Link href="/ops/impersonation" className="font-medium underline">
                {to("leave")}
              </Link>
            </p>
          ) : null}
          {cx?.state === "past_due" ? (
            <p
              className="mb-4 rounded-lg border border-amber/40 bg-amber-soft px-3 py-2 text-sm text-text"
              data-testid="tenant-banner"
              data-state="past_due"
            >
              {tb("dunning", { date: "" })}{" "}
              <Link href="/settings/billing" className="font-medium underline">
                {t("billing")}
              </Link>
            </p>
          ) : null}
          {cx?.announcements.map((a) => (
            <p
              key={a.id}
              className={`mb-4 rounded-lg border px-3 py-2 text-sm text-text ${a.level === "incident" ? "border-rose/40 bg-rose-soft" : a.level === "warning" ? "border-amber/40 bg-amber-soft" : "border-sky/40 bg-sky-soft"}`}
              data-testid="announcement-banner"
            >
              <strong>{a.title}</strong> {a.body}
            </p>
          ))}
          {cx?.onboarding ? (
            <div
              className="mb-5 rounded-card border border-line bg-surface px-4 py-3 text-sm shadow-card"
              data-testid="onboarding-checklist"
            >
              <p className="font-display font-semibold text-ink">{tob("title")}</p>
              <ol className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1">
                {cx.onboarding.map((s) => (
                  <li key={s.key} data-step={s.key} data-done={s.done ? "1" : "0"}>
                    <Link
                      href={s.href}
                      className={
                        s.done
                          ? "text-muted line-through decoration-mint/60"
                          : "font-medium text-ink underline decoration-sky/60 underline-offset-4 hover:decoration-sky"
                      }
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
              className="mb-4 rounded-lg border border-rose/40 bg-rose-soft px-4 py-3 text-sm text-text"
              data-testid="tenant-banner"
              data-state={cx.state}
            >
              {cx.state === "expired" ? tb("expired") : tb("suspended")}{" "}
              <Link href="/settings/billing" className="font-medium underline">
                {t("billing")}
              </Link>
            </div>
          ) : null}
          {children}
        </main>
      </div>
    </div>
  );
}
