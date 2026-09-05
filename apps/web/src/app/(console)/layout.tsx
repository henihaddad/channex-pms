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
import { Alert, Button } from "@/components/ui";
import { NavLink, NavMore, type NavItem } from "./nav-link";
import { navIcons } from "./nav-icons";

/**
 * The console shell. Seven daily destinations always visible, the rest under
 * "More", settings and sign-out as utility navigation at the bottom (IA: global,
 * local, utility). The header carries the one search a manager reaches for,
 * a guest's name. The bridge rail along the top is the brand's one device.
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
  const primary: NavItem[] = [
    { href: "/", label: t("dashboard"), icon: navIcons.dashboard },
    { href: "/calendar", label: t("calendar"), icon: navIcons.calendar },
    { href: "/reservations", label: t("reservations"), icon: navIcons.reservations },
    {
      href: "/inbox",
      label: t("inbox"),
      icon: navIcons.inbox,
      badge: badge.unread,
      alert: badge.breaching > 0,
      testId: "nav-inbox",
    },
    { href: "/operations", label: t("operations"), icon: navIcons.operations },
    { href: "/properties", label: t("properties"), icon: navIcons.properties },
    { href: "/channels", label: t("channels"), icon: navIcons.channels },
  ];
  const more: NavItem[] = [
    { href: "/front-desk", label: t("frontDesk") },
    { href: "/booking-engine", label: t("bookingEngine") },
    { href: "/owners", label: t("owners") },
    { href: "/reports", label: t("reports") },
    { href: "/reviews", label: t("reviews") },
    { href: "/alerts", label: t("alerts") },
    { href: "/maintenance", label: t("maintenance") },
    { href: "/sync-health", label: t("syncHealth") },
  ];
  const done = cx?.onboarding?.filter((s) => s.done).length ?? 0;
  const next = cx?.onboarding?.find((s) => !s.done);
  return (
    <div className="flex min-h-screen">
      <aside
        className="dark sticky top-0 flex h-screen w-60 shrink-0 flex-col bg-background text-foreground"
        data-theme="dark"
      >
        <div className="px-5 pt-5 pb-3">
          <Link href="/" className="inline-flex text-foreground" aria-label="OTAbridge">
            <Logo size={30} />
          </Link>
          <div className="bridge-rail mt-4 h-px w-full opacity-60" />
          {org ? (
            <p className="mt-3 truncate text-xs font-medium text-muted" data-testid="org-name">
              {org.name}
            </p>
          ) : null}
        </div>
        <nav className="scrollbar flex-1 overflow-y-auto px-3 pb-4" aria-label="Main">
          <ul className="space-y-0.5">
            {primary.map((l) => (
              <li key={l.href}>
                <NavLink {...l} />
              </li>
            ))}
          </ul>
          <NavMore label={t("more")} icon={navIcons.more} items={more} />
        </nav>
        <div className="border-t border-border px-3 py-3">
          <NavLink
            href="/settings"
            label={t("settings")}
            icon={navIcons.settings}
            testId="nav-settings"
          />
          {cx?.isOperator ? (
            <Link
              href="/ops"
              className="mt-1 block px-3 py-1 text-xs text-accent hover:underline"
              data-testid="ops-link"
            >
              {to("title")} →
            </Link>
          ) : null}
          <form action={logoutAction} className="mt-2 px-1">
            <Button type="submit" variant="ghost" size="sm" fullWidth>
              {t("signOut")}
            </Button>
          </form>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="bridge-rail h-[3px] w-full" aria-hidden="true" />
        <header className="flex items-center justify-between gap-4 border-b border-border bg-surface px-8 py-2.5">
          <form
            action="/reservations"
            method="get"
            role="search"
            className="relative w-full max-w-md"
          >
            <span className="pointer-events-none absolute inset-y-0 start-3 flex items-center text-muted">
              {navIcons.search}
            </span>
            <input
              type="search"
              name="q"
              placeholder={t("searchPlaceholder")}
              aria-label={t("search")}
              data-testid="global-search"
              className="h-9 w-full rounded-full border border-border bg-background ps-10 pe-4 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
            />
          </form>
          {cx?.onboarding ? (
            <Link
              href="/"
              className="flex shrink-0 items-center gap-2 text-sm"
              data-testid="onboarding-checklist"
            >
              <span className="text-muted">
                {tob("progress", { done, total: cx.onboarding.length })}
              </span>
              <span className="flex h-1.5 w-24 overflow-hidden rounded-full bg-default">
                <span
                  className="bridge-rail h-full rounded-full"
                  style={{ width: `${(done / cx.onboarding.length) * 100}%` }}
                />
              </span>
              {next ? <span className="font-medium text-accent">{tob(next.key)} →</span> : null}
              <span hidden>
                {cx.onboarding.map((s) => (
                  <span key={s.key} data-step={s.key} data-done={s.done ? "1" : "0"} />
                ))}
              </span>
            </Link>
          ) : null}
        </header>
        <main className="flex-1 px-8 py-7">
          <div className="mx-auto flex max-w-[1400px] flex-col gap-4">
            {cx?.impersonation ? (
              <Alert tone="warning" data-testid="impersonation-banner">
                {to("banner", {
                  org: cx.impersonation.orgName,
                  time: cx.impersonation.expiresAt.slice(11, 16),
                })}{" "}
                <Link href="/ops/impersonation" className="font-medium underline">
                  {to("leave")}
                </Link>
              </Alert>
            ) : null}
            {cx?.state === "past_due" ? (
              <Alert tone="warning" data-testid="tenant-banner" data-state="past_due">
                {tb("dunning", { date: "" })}{" "}
                <Link href="/settings/billing" className="font-medium underline">
                  {t("billing")}
                </Link>
              </Alert>
            ) : null}
            {cx?.announcements.map((a) => (
              <Alert
                key={a.id}
                tone={a.level === "incident" ? "error" : a.level === "warning" ? "warning" : "info"}
                title={a.title}
                data-testid="announcement-banner"
              >
                {a.body}
              </Alert>
            ))}
            {cx?.access === "billing_only" ? (
              <Alert tone="error" data-testid="tenant-banner" data-state={cx.state}>
                {cx.state === "expired" ? tb("expired") : tb("suspended")}{" "}
                <Link href="/settings/billing" className="font-medium underline">
                  {t("billing")}
                </Link>
              </Alert>
            ) : null}
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
