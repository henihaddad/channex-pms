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
import { NavLink, NavSection, type NavItem } from "./nav-link";
import { navIcons } from "./nav-icons";
import { StartWidget } from "./getting-started";
import { startLabels } from "./start-labels";

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
  const t2 = await getTranslations("reservations");
  const ti = await getTranslations("inbox");
  const top = await getTranslations("operations");
  const to2 = await getTranslations("owners");
  const tc = await getTranslations("channels");
  const tp = await getTranslations("properties");
  const tpay = await getTranslations("payments");
  const te = await getTranslations("engine");
  // Every section is visible; its pages unfold underneath it. No hidden drawer.
  const sections: Array<{ item: NavItem; children: NavItem[] }> = [
    { item: { href: "/", label: t("dashboard"), icon: navIcons.dashboard }, children: [] },
    {
      item: {
        href: "/inbox",
        label: t("inbox"),
        icon: navIcons.inbox,
        badge: badge.unread,
        alert: badge.breaching > 0,
        testId: "nav-inbox",
      },
      children: [
        { href: "/inbox/templates", label: ti("templates") },
        { href: "/inbox/automation", label: ti("automation") },
        { href: "/inbox/kpi", label: ti("kpi") },
      ],
    },
    { item: { href: "/calendar", label: t("calendar"), icon: navIcons.calendar }, children: [] },
    {
      item: { href: "/reservations", label: t("reservations"), icon: navIcons.reservations },
      children: [
        { href: "/reservations/unmapped", label: t2("unmappedQueue") },
        { href: "/reservations/new", label: t2("newBooking") },
      ],
    },
    {
      item: { href: "/front-desk", label: t("frontDesk"), icon: navIcons.frontDesk },
      children: [],
    },
    {
      item: { href: "/operations", label: t("operations"), icon: navIcons.operations },
      children: [
        { href: "/operations/blocks", label: top("blocks") },
        { href: "/operations/crews", label: top("crews") },
        { href: "/maintenance", label: t("maintenance") },
      ],
    },
    {
      item: { href: "/properties", label: t("properties"), icon: navIcons.properties },
      children: [
        { href: "/properties/new", label: tp("new") },
        { href: "/properties/import", label: tp("import") },
      ],
    },
    {
      item: { href: "/channels", label: t("channels"), icon: navIcons.channels },
      children: [
        { href: "/channels/connect", label: tc("connectViaChannex") },
        { href: "/sync-health", label: t("syncHealth") },
      ],
    },
    {
      item: { href: "/booking-engine", label: t("bookingEngine"), icon: navIcons.direct },
      children: [{ href: "/booking-engine/payments", label: tpay("title") }],
    },
    {
      item: { href: "/owners", label: t("owners"), icon: navIcons.owners },
      children: [
        { href: "/owners/expenses", label: to2("expenses") },
        { href: "/owners/statements", label: to2("statements") },
        { href: "/owners/payouts", label: to2("payouts") },
      ],
    },
    {
      item: { href: "/reports", label: t("reports"), icon: navIcons.reports },
      children: [
        { href: "/alerts", label: t("alerts") },
        { href: "/reviews", label: t("reviews") },
      ],
    },
    {
      item: {
        href: "/settings",
        label: t("settings"),
        icon: navIcons.settings,
        testId: "nav-settings",
      },
      children: [
        { href: "/settings/organization", label: t("organization") },
        { href: "/settings/members", label: t("members") },
        { href: "/settings/billing", label: t("billing") },
        { href: "/settings/plugins", label: t("plugins") },
        { href: "/settings/audit", label: t("audit") },
        { href: "/settings/support", label: t("support") },
      ],
    },
  ];
  void te;
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
            {sections.map((s) =>
              s.children.length === 0 ? (
                <li key={s.item.href}>
                  <NavLink {...s.item} />
                </li>
              ) : (
                <NavSection
                  key={s.item.href}
                  item={s.item}
                  pages={s.children}
                  toggleLabel={t("togglePages")}
                />
              ),
            )}
          </ul>
        </nav>
        <div className="border-t border-border px-3 py-3">
          {cx?.isOperator ? (
            <Link
              href="/ops"
              className="mb-1 block px-3 py-1 text-xs text-accent hover:underline"
              data-testid="ops-link"
            >
              {to("title")} →
            </Link>
          ) : null}
          <form action={logoutAction} className="px-1">
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
          <a
            href="https://github.com/henihaddad/channex-pms/blob/main/docs/operate.md"
            target="_blank"
            rel="noreferrer"
            className="shrink-0 text-sm text-muted hover:text-foreground"
            data-testid="help-link"
          >
            {t("help")}
          </a>
          {cx?.onboarding ? <StartWidget tracks={cx.onboarding} labels={startLabels(tob)} /> : null}
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
