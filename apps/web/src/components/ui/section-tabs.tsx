"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Local navigation inside a section: the current tab is underlined, so the page always answers "where am I". */
export function SectionTabs({
  items,
  ariaLabel,
}: {
  items: Array<{ href: string; label: string; exact?: boolean; testId?: string }>;
  ariaLabel: string;
}) {
  const pathname = usePathname();
  return (
    <nav aria-label={ariaLabel} className="-mb-px overflow-x-auto">
      <ul className="flex gap-1 border-b border-border">
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
                className={`inline-block whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors ${
                  active
                    ? "border-accent font-medium text-foreground"
                    : "border-transparent text-muted hover:border-border hover:text-foreground"
                }`}
              >
                {it.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
