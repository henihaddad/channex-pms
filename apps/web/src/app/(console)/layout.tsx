import type React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { LOCALES } from "@/i18n/request";
import { currentOrgId, currentSession } from "@/server/session";
import { inboxBadge } from "@/server/inbox-badge";
import { consoleContext } from "@/server/console-context";
import { currentUserProfile, memberships } from "@/server/auth-flows";
import { logoutAction } from "../(auth)/auth.actions";
import { setLocaleAction } from "./shell.actions";
import { Logo } from "@/components/logo";
import { Alert, LinkButton } from "@/components/ui";
import { ConsoleShell, type NavSectionDef } from "./console-shell";
import { BellLink, HeaderMenu, MenuButton, MenuLink } from "./header-menus";
import { navIcons } from "./nav-icons";

/**
 * The console shell (design canvas, November 2026). Ten destinations in one
 * flat list that never folds, Settings and the account at the foot of the
 * rail, the pages inside a section as tabs, and the one search a manager
 * reaches for in the header. The bridge rail along the top is the brand's one
 * device.
 */
export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const session = await currentSession();
  if (!session) redirect("/login");
  const t = await getTranslations("nav");
  const orgId = await currentOrgId();
  const badge = orgId ? await inboxBadge(orgId, session.userId) : { unread: 0, breaching: 0 };
  const cx = orgId ? await consoleContext(orgId) : null;
  const [orgs, me, locale] = await Promise.all([
    memberships(session.userId),
    currentUserProfile(session.userId),
    getLocale(),
  ]);
  const org = orgs.find((o) => o.orgId === orgId) ?? orgs[0];
  const tb = await getTranslations("billing");
  const to = await getTranslations("ops");
  const t2 = await getTranslations("reservations");
  const ti = await getTranslations("inbox");
  const top = await getTranslations("operations");
  const to2 = await getTranslations("owners");
  const tpay = await getTranslations("payments");

  const sections: NavSectionDef[] = [
    { item: { href: "/", label: t("dashboard"), icon: navIcons.today }, tabs: [] },
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
        { href: "/inbox/automation", label: ti("automation") },
        { href: "/inbox/templates", label: ti("templates") },
        { href: "/reviews", label: t("reviews") },
        { href: "/inbox/kpi", label: ti("kpi") },
      ],
    },
    { item: { href: "/calendar", label: t("calendar"), icon: navIcons.calendar }, tabs: [] },
    {
      item: { href: "/reservations", label: t("reservations"), icon: navIcons.reservations },
      tabs: [
        { href: "/front-desk", label: t("frontDesk") },
        { href: "/reservations/requests", label: ti("requests") },
        { href: "/reservations/unmapped", label: t2("unmappedQueue") },
      ],
    },
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
      tabs: [
        { href: "/booking-engine", label: t("bookingEngine") },
        { href: "/sync-health", label: t("syncHealth") },
      ],
    },
    {
      item: { href: "/financials", label: t("financials"), icon: navIcons.financials },
      tabs: [
        { href: "/booking-engine/payments", label: tpay("title") },
        { href: "/owners/statements", label: to2("statements") },
        { href: "/owners/payouts", label: to2("payouts") },
        { href: "/owners/expenses", label: to2("expenses") },
      ],
    },
    {
      item: { href: "/owners", label: t("owners"), icon: navIcons.owners },
      tabs: [
        { href: "/owners/statements", label: to2("statements") },
        { href: "/owners/payouts", label: to2("payouts") },
        { href: "/owners/expenses", label: to2("expenses") },
      ],
    },
    {
      item: { href: "/reports", label: t("reports"), icon: navIcons.reports },
      tabs: [{ href: "/alerts", label: t("alerts") }],
    },
  ];
  const footerSections: NavSectionDef[] = [
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
        { href: "/settings/integrations", label: t("integrations") },
        { href: "/settings/plugins", label: t("plugins") },
        { href: "/settings/audit", label: t("audit") },
        { href: "/settings/support", label: t("support") },
      ],
    },
  ];

  const initials = (me?.name ?? "?")
    .split(/\s+/)
    .map((w) => w[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const brand = (
    <div className="px-5 pt-5 pb-3">
      <Link href="/" className="inline-flex text-foreground" aria-label="OTAbridge">
        <Logo size={28} />
      </Link>
      <div className="bridge-rail mt-4 h-px w-full opacity-60" />
      {org ? (
        <p className="mt-3 truncate text-xs font-semibold text-muted" data-testid="org-name">
          {org.name}
        </p>
      ) : null}
    </div>
  );

  const footer = (
    <div className="mt-1 flex items-center gap-3 rounded-xl px-3 py-2">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-linear-to-br from-[#34d399] to-[#22d3ee] text-[11px] font-bold text-[#0b1020]">
        {initials}
      </span>
      <span className="min-w-0 flex-1 text-sm leading-tight">
        <span className="block truncate font-medium text-foreground">{me?.name ?? ""}</span>
        <span className="block truncate text-[11px] text-muted">
          {cx?.isOperator ? (
            <Link href="/ops" className="text-accent hover:underline" data-testid="ops-link">
              {to("title")} →
            </Link>
          ) : (
            (org?.name ?? "")
          )}
        </span>
      </span>
      <form action={logoutAction}>
        <button
          type="submit"
          className="rounded-lg px-2 py-1 text-xs text-muted hover:bg-surface-secondary hover:text-foreground"
        >
          {t("signOut")}
        </button>
      </form>
    </div>
  );

  const search = (
    <form
      action="/reservations"
      method="get"
      role="search"
      className="relative w-full max-w-[460px] flex-1"
    >
      <span className="pointer-events-none absolute inset-y-0 start-3.5 flex items-center text-muted">
        {navIcons.search}
      </span>
      <input
        type="search"
        name="q"
        placeholder={t("searchPlaceholder")}
        aria-label={t("search")}
        data-testid="global-search"
        className="h-9.5 w-full rounded-full border border-border bg-background ps-10 pe-14 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
      />
      <kbd
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 end-3 my-auto h-5.5 rounded-md border border-border bg-surface px-1.5 font-sans text-[11px] leading-5 font-semibold text-muted"
      >
        {t("searchHint")}
      </kbd>
    </form>
  );

  const actions = (
    <>
      <HeaderMenu label={t("help")} testId="help-menu">
        <MenuLink
          href="https://github.com/henihaddad/channex-pms/blob/main/docs/operate.md"
          external
          testId="help-link"
        >
          {t("operateGuide")}
        </MenuLink>
        <MenuLink href="/settings/support">{t("contactSupport")}</MenuLink>
        <MenuLink href="/settings/support#shortcuts" hint="?">
          {t("shortcuts")}
        </MenuLink>
      </HeaderMenu>
      <HeaderMenu label={locale.toUpperCase()} icon={navIcons.globe} testId="language-menu">
        <form action={setLocaleAction} className="flex flex-col">
          {LOCALES.map((l) => (
            <MenuButton key={l} name="locale" value={l} current={l === locale}>
              {t(`languages.${l}`)}
            </MenuButton>
          ))}
        </form>
      </HeaderMenu>
      <BellLink href="/alerts" count={badge.breaching} label={t("activity")} />
      <LinkButton href="/reservations/new" variant="primary" className="hidden sm:inline-flex">
        {t("newReservation")}
      </LinkButton>
    </>
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
      footerSections={footerSections}
      brand={brand}
      footer={footer}
      search={search}
      actions={actions}
      banners={banners}
      labels={{ menu: t("menu"), close: t("closeMenu"), sectionPages: t("sectionPages") }}
    >
      {children}
    </ConsoleShell>
  );
}
