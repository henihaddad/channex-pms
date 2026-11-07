"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export interface NavItem {
  href: string;
  label: string;
  icon?: ReactNode;
  badge?: number;
  alert?: boolean;
  testId?: string;
}

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

/** A sidebar entry: icon plus label, filled when active so "you are here" never needs guessing. */
export function NavLink({ href, label, icon, badge, alert, testId }: NavItem) {
  const pathname = usePathname();
  const active = isActive(pathname, href);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      data-testid={testId}
      className={`flex items-center gap-3 rounded-xl px-3 py-2.25 text-sm font-medium transition-colors ${
        active
          ? "bg-surface text-foreground"
          : "text-muted hover:bg-surface-secondary hover:text-foreground"
      }`}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {badge && badge > 0 ? (
        <span
          className={`inline-flex h-5 min-w-5.5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold tabular-nums ${
            alert ? "bg-warning text-white" : "bg-accent text-accent-foreground"
          }`}
        >
          {badge}
        </span>
      ) : null}
    </Link>
  );
}
