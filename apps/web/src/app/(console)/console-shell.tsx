"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { SectionTabs, SectionTabsContext } from "@/components/ui";
import { NavLink, type NavItem } from "./nav-link";

export interface NavSectionDef {
  item: NavItem;
  /** Destinations inside the section, shown as tabs under the page title. Actions belong on the page. */
  tabs: Array<{ href: string; label: string; count?: number }>;
  /** The first tab's label when it differs from the section's name ("Conversations" under Inbox). */
  firstTab?: string;
}

function inSection(pathname: string, s: NavSectionDef): boolean {
  const hit = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
  return hit(s.item.href) || s.tabs.some((t) => hit(t.href));
}

/**
 * The console frame (design canvas, November 2026): a dark rail of ten
 * destinations with Settings and the account at its foot, a white header with
 * the one search box, help, language, alerts and the primary action, and the
 * section's pages as tabs under the header. Below `lg` the rail becomes a
 * drawer, so a phone shows the work, not the menu.
 */
export function ConsoleShell({
  sections,
  footerSections,
  brand,
  footer,
  search,
  actions,
  banners,
  labels,
  children,
}: {
  sections: NavSectionDef[];
  /** Sections that live at the foot of the rail (Settings). */
  footerSections: NavSectionDef[];
  brand: ReactNode;
  footer: ReactNode;
  search: ReactNode;
  actions: ReactNode;
  banners: ReactNode;
  labels: { menu: string; close: string; sectionPages: string };
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const all = [...sections, ...footerSections];
  const current = all.find((s) => inSection(pathname, s));
  const tabs =
    current && current.tabs.length > 0
      ? [
          {
            href: current.item.href,
            label: current.firstTab ?? current.item.label,
            exact: true,
          },
          ...current.tabs,
        ]
      : null;
  const tabsEl = tabs ? <SectionTabs items={tabs} ariaLabel={labels.sectionPages} /> : null;

  const rail = (
    <>
      {brand}
      <nav className="scrollbar flex-1 overflow-y-auto px-3 pt-1 pb-4" aria-label="Main">
        <ul className="flex flex-col gap-0.5">
          {sections.map((s) => (
            <li key={s.item.href}>
              <NavLink {...s.item} />
            </li>
          ))}
        </ul>
      </nav>
      <div className="flex flex-col gap-0.5 border-t border-border px-3 pt-2.5 pb-4">
        <ul className="flex flex-col gap-0.5">
          {footerSections.map((s) => (
            <li key={s.item.href}>
              <NavLink {...s.item} />
            </li>
          ))}
        </ul>
        {footer}
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen">
      <aside
        className="dark sticky top-0 hidden h-screen w-[236px] shrink-0 flex-col bg-background text-foreground lg:flex"
        data-theme="dark"
      >
        {rail}
      </aside>

      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label={labels.close}
            className="absolute inset-0 bg-black/50"
            onClick={() => setOpen(false)}
          />
          <div
            className="dark absolute inset-y-0 start-0 flex w-72 max-w-[85vw] flex-col bg-background text-foreground shadow-float"
            data-theme="dark"
            role="dialog"
            aria-modal="true"
            aria-label={labels.menu}
            data-testid="nav-drawer"
            onClick={(e) => {
              // any link in the drawer takes you somewhere: the drawer's job is done
              if ((e.target as HTMLElement).closest("a")) setOpen(false);
            }}
          >
            {rail}
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="bridge-rail h-[3px] w-full" aria-hidden="true" />
        <header className="sticky top-0 z-30 border-b border-border bg-surface">
          <div className="flex items-center gap-3 px-4 py-2.5 lg:gap-4 lg:px-8">
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label={labels.menu}
              aria-expanded={open}
              data-testid="nav-menu"
              className="grid h-9.5 w-9.5 shrink-0 place-items-center rounded-full border border-border text-foreground lg:hidden"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                <path
                  d="M2 4h12M2 8h12M2 12h12"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
            {search}
            <span className="flex-1" />
            {actions}
          </div>
        </header>
        <main className="console-main flex-1 px-4 pt-6 pb-24 lg:px-8 lg:pt-7 lg:pb-10">
          <div className="flex w-full max-w-[1200px] flex-col gap-5">
            {banners}
            {tabsEl ? <div className="section-tabs-top">{tabsEl}</div> : null}
            <SectionTabsContext.Provider value={tabsEl}>{children}</SectionTabsContext.Provider>
          </div>
        </main>
      </div>
    </div>
  );
}
