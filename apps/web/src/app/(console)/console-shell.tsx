"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { SectionTabs } from "@/components/ui";
import { NavLink, type NavItem } from "./nav-link";

export interface NavSectionDef {
  item: NavItem;
  /** Destinations inside the section, shown as tabs on its pages. Actions belong on the page. */
  tabs: Array<{ href: string; label: string }>;
}

function inSection(pathname: string, s: NavSectionDef): boolean {
  const hit = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
  return hit(s.item.href) || s.tabs.some((t) => hit(t.href));
}

/**
 * The console frame. One flat list of destinations, because a sidebar that folds
 * and unfolds makes you hunt; a section's own pages are tabs on the page itself.
 * Below `lg` the list moves into a drawer, so a phone shows the work, not the menu.
 */
export function ConsoleShell({
  sections,
  brand,
  footer,
  search,
  help,
  banners,
  labels,
  children,
}: {
  sections: NavSectionDef[];
  brand: ReactNode;
  footer: ReactNode;
  search: ReactNode;
  help: ReactNode;
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

  const current = sections.find((s) => inSection(pathname, s));
  const tabs =
    current && current.tabs.length > 0
      ? [{ href: current.item.href, label: current.item.label, exact: true }, ...current.tabs]
      : null;

  const list = (
    <nav className="scrollbar flex-1 overflow-y-auto px-3 pb-4" aria-label="Main">
      <ul className="space-y-0.5">
        {sections.map((s) => (
          <li key={s.item.href}>
            <NavLink {...s.item} />
          </li>
        ))}
      </ul>
    </nav>
  );

  return (
    <div className="flex min-h-screen">
      <aside
        className="dark sticky top-0 hidden h-screen w-60 shrink-0 flex-col bg-background text-foreground lg:flex"
        data-theme="dark"
      >
        {brand}
        {list}
        {footer}
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
            className="dark absolute inset-y-0 start-0 flex w-72 max-w-[85vw] flex-col bg-background text-foreground shadow-xl"
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
            {brand}
            {list}
            {footer}
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="bridge-rail h-[3px] w-full" aria-hidden="true" />
        <header className="flex items-center gap-2 border-b border-border bg-surface px-4 py-2.5 lg:gap-4 lg:px-8">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label={labels.menu}
            aria-expanded={open}
            data-testid="nav-menu"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-border text-foreground lg:hidden"
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
          {help}
        </header>
        <main className="flex-1 px-4 py-5 lg:px-8 lg:py-7">
          <div className="mx-auto flex max-w-[1400px] flex-col gap-4">
            {banners}
            {tabs ? <SectionTabs items={tabs} ariaLabel={labels.sectionPages} /> : null}
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
