"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export interface NavItem {
  href: string;
  label: string;
  icon?: ReactNode;
  badge?: number;
  /** Something in the count is past its target (a guest waiting too long): the badge turns red. */
  alert?: boolean;
  /** What the count means, for screen readers ("3 unread, 1 past the reply target"). */
  badgeLabel?: string;
  testId?: string;
}

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

/** A rail entry: a label, filled when active so "you are here" never needs guessing. */
export function NavLink({ href, label, badge, alert, badgeLabel, testId }: NavItem) {
  const pathname = usePathname();
  const active = isActive(pathname, href);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      data-testid={testId}
      className={`flex items-center gap-3 rounded-[10px] px-3 py-2.25 text-sm font-medium transition-colors ${
        active
          ? "bg-surface text-white"
          : "text-rail-foreground hover:bg-surface-secondary hover:text-white"
      }`}
    >
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {badge && badge > 0 ? (
        <span
          className={`inline-flex h-5 min-w-5.5 items-center justify-center rounded-full px-1.75 text-[11px] font-bold tabular-nums ${
            alert
              ? "bg-danger-soft text-danger-soft-foreground ring-1 ring-danger"
              : "bg-badge text-badge-foreground"
          }`}
          data-alert={alert ? "true" : undefined}
        >
          <span aria-hidden={badgeLabel ? true : undefined}>{badge}</span>
          {badgeLabel ? <span className="sr-only">{badgeLabel}</span> : null}
        </span>
      ) : null}
    </Link>
  );
}
