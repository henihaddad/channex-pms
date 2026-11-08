"use client";

import { createContext, useContext, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export interface SectionTab {
  href: string;
  label: string;
  exact?: boolean;
  testId?: string;
  /** A count shown after the label, as in "Requests · 2". */
  count?: number;
}

/** Local navigation inside a section: the current tab is underlined, so the page always answers "where am I". */
export function SectionTabs({ items, ariaLabel }: { items: SectionTab[]; ariaLabel: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label={ariaLabel} className="scrollbar-none overflow-x-auto">
      <ul className="flex gap-0.5 border-b border-border">
        {items.map((it) => {
          const active = it.exact
            ? pathname === it.href
            : pathname === it.href || pathname.startsWith(`${it.href}/`);
          return (
            <li key={it.href}>
              <Link
                href={it.href}
                aria-current={active ? "page" : undefined}
                data-testid={it.testId}
                className={`-mb-px inline-block border-b-2 px-3.5 py-2.5 text-sm whitespace-nowrap transition-colors ${
                  active
                    ? "border-accent font-semibold text-foreground"
                    : "border-transparent text-muted hover:border-border hover:text-foreground"
                }`}
              >
                {it.label}
                {it.count ? <span className="tabular-nums"> · {it.count}</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** The current section's tabs, handed down by the console shell so a page header can place them under its title. */
export const SectionTabsContext = createContext<ReactNode>(null);

/**
 * Where a page header puts the section tabs: under the title and lead, as the design has it.
 * The shell hides its own fallback row whenever this slot is on the page (globals.css).
 */
export function SectionTabsSlot() {
  const tabs = useContext(SectionTabsContext);
  // `false` is a page that wants no tabs at all (a form inside the section): an empty slot
  // still tells the shell not to draw its own row.
  if (tabs === false) return <div className="section-tabs-slot hidden" />;
  if (!tabs) return null;
  return <div className="section-tabs-slot">{tabs}</div>;
}
