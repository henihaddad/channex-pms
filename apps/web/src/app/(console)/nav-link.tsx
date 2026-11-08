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

/** A rail entry: a label, filled when active so "you are here" never needs guessing. */
export function NavLink({ href, label, badge, testId }: NavItem) {
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
          : "text-[#b6c0bd] hover:bg-surface-secondary hover:text-white"
      }`}
    >
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {badge && badge > 0 ? (
        <span className="inline-flex h-5 min-w-5.5 items-center justify-center rounded-full bg-[#f59e0b] px-1.75 text-[11px] font-bold text-[#141716] tabular-nums">
          {badge}
        </span>
      ) : null}
    </Link>
  );
}
