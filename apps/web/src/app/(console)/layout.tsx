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
import { NavLink } from "./nav-link";

/**
 * The console shell. The sidebar is grouped by what an operator does, not by
 * module: today's work, the portfolio, insight, settings. It sits in HeroUI's
 * dark scope so it reads as chrome; the workspace uses the light theme. The
 * bridge rail along the top is the brand's one device.
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
  const done = cx?.onboarding?.filter((s) => s.done).length ?? 0;
  const next = cx?.onboarding?.find((s) => !s.done);
  return (
    <div className="flex min-h-screen">
      <aside
        className="dark sticky top-0 flex h-screen w-64 shrink-0 flex-col bg-background text-foreground"
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
          {groups.map((g) => (
            <div key={g.label} className="mb-4">
              <p className="mb-1 px-3 text-[0.65rem] font-semibold tracking-[0.14em] text-muted uppercase">
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
        <div className="border-t border-border px-4 py-4">
          {cx?.isOperator ? (
            <Link
              href="/ops"
              className="mb-3 block px-1 text-xs text-accent hover:underline"
              data-testid="ops-link"
            >
              {to("title")} →
            </Link>
          ) : null}
          <form action={logoutAction}>
            <Button type="submit" variant="secondary" size="sm" fullWidth>
              {t("signOut")}
            </Button>
          </form>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="bridge-rail h-[3px] w-full" aria-hidden="true" />
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
            {cx?.onboarding ? (
              <div
                className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl bg-surface px-4 py-2.5 text-sm shadow-surface"
                data-testid="onboarding-checklist"
              >
                <span className="font-medium text-foreground">
                  {tob("title")}{" "}
                  <span className="text-muted tabular-nums">
                    {done}/{cx.onboarding.length}
                  </span>
                </span>
                <div className="flex h-1.5 w-32 overflow-hidden rounded-full bg-default">
                  <div
                    className="bridge-rail h-full rounded-full"
                    style={{ width: `${(done / cx.onboarding.length) * 100}%` }}
                  />
                </div>
                <ol className="flex flex-wrap gap-x-4 gap-y-1">
                  {cx.onboarding.map((s) => (
                    <li
                      key={s.key}
                      data-step={s.key}
                      data-done={s.done ? "1" : "0"}
                      className={s.done || s.key === next?.key ? "" : "hidden"}
                    >
                      <Link
                        href={s.href}
                        className={
                          s.done
                            ? "text-muted line-through decoration-success/60"
                            : "font-medium text-accent underline-offset-4 hover:underline"
                        }
                      >
                        {s.done ? "✓ " : "→ "}
                        {tob(s.key)}
                      </Link>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}
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
