import { SessionKeepAlive } from "@/components/session-keep-alive";
import type React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { LOCALES } from "@/i18n/request";
import { currentOrgId, currentSession } from "@/server/session";
import { inboxBadge } from "@/server/inbox-badge";
import { reservationBadges } from "@/server/reservation-badges";
import { consoleContext } from "@/server/console-context";
import { currentRoleKey, currentUserProfile, memberships } from "@/server/auth-flows";
import { logoutAction } from "../(auth)/auth.actions";
import { setLocaleAction } from "./shell.actions";
import { Logo } from "@/components/logo";
import { Alert, ConsoleHotkeys, LinkButton, type PaletteItem } from "@/components/ui";
import { paletteSearch } from "./palette.actions";
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
  const badge = orgId
    ? await inboxBadge(orgId, session.userId)
    : { unread: 0, breaching: 0, reviewsToAnswer: 0 };
  const resBadges = orgId ? await reservationBadges(orgId) : { requests: 0, needsRoom: 0 };
  const cx = orgId ? await consoleContext(orgId) : null;
  const [orgs, me, locale] = await Promise.all([
    memberships(session.userId),
    currentUserProfile(session.userId),
    getLocale(),
  ]);
  const org = orgs.find((o) => o.orgId === orgId) ?? orgs[0];
  const roleKey = org ? await currentRoleKey(session.userId, org.orgId) : null;
  const tb = await getTranslations("billing");
  const to = await getTranslations("ops");
  const t2 = await getTranslations("reservations");
  const ti = await getTranslations("inbox");
  const top = await getTranslations("operations");
  const to2 = await getTranslations("owners");
  const tpay = await getTranslations("payments");
  const tch = await getTranslations("channels");
  const tprop = await getTranslations("properties");
  const tfin = await getTranslations("financials");

  const sections: NavSectionDef[] = [
    { item: { href: "/", label: t("dashboard") }, tabs: [] },
    {
      item: {
        href: "/inbox",
        label: t("inbox"),
        badge: badge.unread,
        alert: badge.breaching > 0,
        testId: "nav-inbox",
      },
      firstTab: t("tabs.conversations"),
      tabs: [
        { href: "/inbox/automation", label: ti("automation") },
        { href: "/inbox/templates", label: ti("templates") },
        { href: "/reviews", label: t("reviews"), count: badge.reviewsToAnswer },
        { href: "/inbox/kpi", label: ti("kpi") },
      ],
    },
    { item: { href: "/calendar", label: t("calendar") }, tabs: [] },
    {
      item: { href: "/reservations", label: t("reservations") },
      firstTab: t("tabs.all"),
      // Front desk (hotel-kind only, spec 08 §8.10) is reached from Check-in, not a tab of its own.
      tabs: [
        { href: "/reservations/check-in", label: t2("tabs.checkIn") },
        { href: "/reservations/guests", label: t2("tabs.guests") },
        {
          href: "/reservations/requests",
          label: t2("tabs.requests"),
          count: resBadges.requests || undefined,
        },
        {
          href: "/reservations/unmapped",
          label: t2("unmappedQueue"),
          count: resBadges.needsRoom || undefined,
        },
      ],
    },
    {
      item: { href: "/operations", label: t("operations") },
      firstTab: t("tabs.turnovers"),
      tabs: [
        { href: "/maintenance", label: top("board.tabIssues") },
        { href: "/operations/crews", label: top("board.tabTeam") },
        { href: "/operations/blocks", label: top("blocks") },
      ],
    },
    {
      item: { href: "/properties", label: t("properties") },
      tabs: [
        { href: "/properties/rooms", label: tprop("tabs.rooms") },
        { href: "/properties/rate-plans", label: tprop("tabs.plans") },
        { href: "/properties/amenities", label: tprop("tabs.amenities") },
      ],
    },
    {
      item: { href: "/channels", label: t("channels") },
      firstTab: t("tabs.connections"),
      tabs: [
        { href: "/channels/rooms", label: tch("board.roomsTab") },
        { href: "/booking-engine", label: t("bookingEngine") },
        { href: "/sync-health", label: t("syncHealth") },
      ],
    },
    {
      item: { href: "/financials", label: t("financials") },
      firstTab: t("tabs.overview"),
      tabs: [
        { href: "/financials/transactions", label: tfin("transactions") },
        { href: "/financials/payment-rules", label: tpay("title") },
        { href: "/owners/payouts", label: to2("payouts") },
        { href: "/owners/expenses", label: to2("expenses") },
      ],
    },
    {
      item: { href: "/owners", label: t("owners") },
      firstTab: to2("title"),
      tabs: [{ href: "/owners/statements", label: to2("statements") }],
    },
    {
      item: { href: "/reports", label: t("reports") },
      firstTab: t("tabs.overview"),
      tabs: [{ href: "/alerts", label: t("alerts") }],
    },
  ];
  const footerSections: NavSectionDef[] = [
    {
      item: {
        href: "/settings",
        label: t("settings"),
        testId: "nav-settings",
      },
      // the settings pages are a left sub-nav inside the section (settings/layout.tsx)
      tabs: [],
    },
  ];

  const nameParts = (me?.name ?? "").trim().split(/\s+/).filter(Boolean);
  // "Heni H.": first name and the initial of the last, as the design writes it
  const shortName =
    nameParts.length > 1
      ? `${nameParts[0]} ${nameParts[nameParts.length - 1]![0]}.`
      : (nameParts[0] ?? "");
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

  const roleLabel = roleKey ? t(`roles.${roleKey}` as never) : null;
  const footer = (
    <details className="group relative">
      <summary
        className="flex cursor-pointer list-none items-center gap-2.5 rounded-[10px] px-3 py-2.25 text-[#b6c0bd] hover:bg-surface-secondary [&::-webkit-details-marker]:hidden"
        data-testid="account-menu"
      >
        <span className="grid h-6.5 w-6.5 shrink-0 place-items-center rounded-full bg-linear-to-br from-[#34d399] to-[#22d3ee] text-[11px] font-bold text-[#0b1020]">
          {initials}
        </span>
        <span className="min-w-0 flex-1 text-sm leading-tight font-medium">
          <span className="block truncate">{shortName}</span>
          <span className="block truncate text-[11px] font-normal text-muted">
            {[roleLabel, org?.name].filter(Boolean).join(" · ")}
          </span>
        </span>
      </summary>
      <div className="absolute start-0 end-0 bottom-full mb-1 flex flex-col rounded-xl border border-border bg-surface p-1 text-sm shadow-float">
        {cx?.isOperator ? (
          <Link
            href="/ops"
            className="rounded-lg px-3 py-2 text-foreground hover:bg-default"
            data-testid="ops-link"
          >
            {to("title")}
          </Link>
        ) : null}
        {orgs.length > 1 ? (
          <Link
            href="/settings/organization"
            className="rounded-lg px-3 py-2 text-foreground hover:bg-default"
          >
            {t("switchOrg")}
          </Link>
        ) : null}
        <form action={logoutAction}>
          <button
            type="submit"
            className="w-full rounded-lg px-3 py-2 text-start text-foreground hover:bg-default"
            data-testid="sign-out"
          >
            {t("signOut")}
          </button>
        </form>
      </div>
    </details>
  );

  const search = (
    <form
      action="/reservations"
      method="get"
      role="search"
      className="relative min-w-0 flex-[0_1_460px]"
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
        className="h-9.5 w-full rounded-full border border-border bg-background ps-10 pe-13 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
      />
      <kbd
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 end-3 my-auto h-5.5 rounded-md border border-border bg-surface px-1.5 font-sans text-[11px] leading-5 font-semibold text-muted"
      >
        {t("searchHint")}
      </kbd>
    </form>
  );

  const bell = <BellLink href="/alerts" count={badge.breaching} label={t("activity")} />;
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
        <MenuLink href="/shortcuts" hint="?">
          {t("shortcuts.title")}
        </MenuLink>
      </HeaderMenu>
      <HeaderMenu label={locale.toUpperCase()} testId="language-menu">
        <form action={setLocaleAction} className="flex flex-col">
          {LOCALES.map((l) => (
            <MenuButton key={l} name="locale" value={l} current={l === locale}>
              {t(`languages.${l}`)}
            </MenuButton>
          ))}
        </form>
      </HeaderMenu>
      {bell}
      <LinkButton href="/reservations/new" variant="primary" className="hidden sm:inline-flex">
        + {t("newReservation")}
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

  const pages: PaletteItem[] = [...sections, ...footerSections].flatMap((s) => [
    { id: s.item.href, title: s.item.label, href: s.item.href },
    ...s.tabs.map((tab) => ({
      id: tab.href,
      title: `${s.item.label} · ${tab.label}`,
      href: tab.href,
    })),
  ]);
  const paletteActions: PaletteItem[] = [
    { id: "new-reservation", title: t("newReservation"), href: "/reservations/new", hint: "N" },
    { id: "import", title: t("importAirbnb"), href: "/properties/import" },
    { id: "block", title: t("blockNights"), href: "/operations/blocks" },
    { id: "new-property", title: t("addProperty"), href: "/properties/new" },
  ];
  const goTo = {
    t: "/",
    i: "/inbox",
    c: "/calendar",
    r: "/reservations",
    o: "/operations",
    p: "/properties",
    s: "/settings",
  };
  const tp = await getTranslations("nav.palette");
  const paletteLabels = {
    placeholder: tp("placeholder"),
    empty: tp("empty"),
    reservations: tp("reservations"),
    properties: tp("properties"),
    pages: tp("pages"),
    actions: tp("actions"),
    footer: tp("footer"),
    keys: tp("keys"),
    replyTo: tp("replyTo"),
    replySub: tp("replySub"),
    newFor: tp("newFor"),
    newForSub: tp("newForSub"),
    block: tp("block"),
    blockSub: tp("blockSub"),
    calendarOf: tp("calendarOf"),
    calendarOfSub: tp("calendarOfSub"),
    try: tp("try"),
    blockCmd: tp("blockCmd"),
    blockCmdSub: tp("blockCmdSub"),
    fromDay: tp("fromDay"),
    priceCmd: tp("priceCmd"),
    priceCmdSub: tp("priceCmdSub"),
    switchCmd: tp("switchCmd"),
    switchCmdSub: tp("switchCmdSub"),
    examples: [tp("example1"), tp("example2"), tp("example3")],
    languages: Object.fromEntries(LOCALES.map((l) => [l, t(`languages.${l}`)])),
  };

  return (
    <>
      <ConsoleHotkeys
        search={paletteSearch}
        pages={pages}
        actions={paletteActions}
        goTo={goTo}
        labels={paletteLabels}
        onLocale={setLocaleAction}
      />
      <SessionKeepAlive />
      <ConsoleShell
        sections={sections}
        footerSections={footerSections}
        brand={brand}
        footer={footer}
        search={search}
        actions={actions}
        banners={banners}
        labels={{
          menu: t("menu"),
          close: t("closeMenu"),
          sectionPages: t("sectionPages"),
          more: t("more"),
          search: t("search"),
        }}
        bell={bell}
        phoneTabs={[
          { href: "/", label: t("dashboard") },
          { href: "/inbox", label: t("inbox"), badge: badge.unread },
          { href: "/calendar", label: t("calendar") },
          { href: "/reservations", label: t("bookings") },
        ]}
      >
        {children}
      </ConsoleShell>
    </>
  );
}
