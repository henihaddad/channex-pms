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
import { ConsoleShell, type NavSectionDef } from "./console-shell";
import { navIcons } from "./nav-icons";

/**
 * The console shell. Twelve destinations in one flat list that never folds, the
 * pages inside a section as tabs on the section itself, and the one search a
 * manager reaches for in the header. The bridge rail along the top is the
 * brand's one device.
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
  const t2 = await getTranslations("reservations");
  const ti = await getTranslations("inbox");
  const top = await getTranslations("operations");
  const to2 = await getTranslations("owners");
  const tpay = await getTranslations("payments");
  const sections: NavSectionDef[] = [
    { item: { href: "/", label: t("dashboard"), icon: navIcons.dashboard }, tabs: [] },
    {
      item: {
        href: "/inbox",
        label: t("inbox"),
        icon: navIcons.inbox,
        badge: badge.unread,
        alert: badge.breaching > 0,
        testId: "nav-inbox",
      },
      tabs: [
        { href: "/inbox/templates", label: ti("templates") },
        { href: "/inbox/automation", label: ti("automation") },
        { href: "/inbox/kpi", label: ti("kpi") },
      ],
    },
    { item: { href: "/calendar", label: t("calendar"), icon: navIcons.calendar }, tabs: [] },
    {
      item: { href: "/reservations", label: t("reservations"), icon: navIcons.reservations },
      tabs: [
        { href: "/reservations/requests", label: ti("requests") },
        { href: "/reservations/unmapped", label: t2("unmappedQueue") },
      ],
    },
    { item: { href: "/front-desk", label: t("frontDesk"), icon: navIcons.frontDesk }, tabs: [] },
    {
      item: { href: "/operations", label: t("operations"), icon: navIcons.operations },
      tabs: [
        { href: "/operations/blocks", label: top("blocks") },
        { href: "/operations/crews", label: top("crews") },
        { href: "/maintenance", label: t("maintenance") },
      ],
    },
    { item: { href: "/properties", label: t("properties"), icon: navIcons.properties }, tabs: [] },
    {
      item: { href: "/channels", label: t("channels"), icon: navIcons.channels },
      tabs: [{ href: "/sync-health", label: t("syncHealth") }],
    },
    {
      item: { href: "/booking-engine", label: t("bookingEngine"), icon: navIcons.direct },
      tabs: [{ href: "/booking-engine/payments", label: tpay("title") }],
    },
    {
      item: { href: "/owners", label: t("owners"), icon: navIcons.owners },
      tabs: [
        { href: "/owners/expenses", label: to2("expenses") },
        { href: "/owners/statements", label: to2("statements") },
        { href: "/owners/payouts", label: to2("payouts") },
      ],
    },
    {
      item: { href: "/reports", label: t("reports"), icon: navIcons.reports },
      tabs: [
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
      tabs: [
        { href: "/settings/organization", label: t("organization") },
        { href: "/settings/members", label: t("members") },
        { href: "/settings/billing", label: t("billing") },
        { href: "/settings/plugins", label: t("plugins") },
        { href: "/settings/audit", label: t("audit") },
        { href: "/settings/support", label: t("support") },
      ],
    },
  ];

  const brand = (
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
  );

  const footer = (
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
  );

  const search = (
    <form action="/reservations" method="get" role="search" className="relative w-full max-w-md">
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
  );

  const help = (
    <a
      href="https://github.com/henihaddad/channex-pms/blob/main/docs/operate.md"
      target="_blank"
      rel="noreferrer"
      className="ms-auto shrink-0 text-sm text-muted hover:text-foreground"
      data-testid="help-link"
    >
      {t("help")}
    </a>
  );

  const banners = (
    <>
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
    </>
  );

  return (
    <ConsoleShell
      sections={sections}
      brand={brand}
      footer={footer}
      search={search}
      help={help}
      banners={banners}
      labels={{ menu: t("menu"), close: t("closeMenu"), sectionPages: t("sectionPages") }}
    >
      {children}
    </ConsoleShell>
  );
}
