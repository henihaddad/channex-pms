"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore, type ReactNode } from "react";

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

/** A sidebar entry: icon plus label, a rail on the active one so "you are here" never needs guessing. */
export function NavLink({ href, label, icon, badge, alert, testId }: NavItem) {
  const pathname = usePathname();
  const active = isActive(pathname, href);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      data-testid={testId}
      className={`relative flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-colors ${
        active
          ? "bg-surface font-medium text-foreground shadow-surface"
          : "text-muted hover:bg-surface-secondary hover:text-foreground"
      }`}
    >
      {active ? (
        <span
          className="bridge-rail absolute inset-y-2 -start-3 w-[3px] rounded-full"
          aria-hidden="true"
        />
      ) : null}
      {icon}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {badge && badge > 0 ? (
        <span
          className={`chip chip--primary chip--sm ${alert ? "chip--warning" : "chip--accent"} tabular-nums`}
        >
          <span className="chip__label">{badge}</span>
        </span>
      ) : null}
    </Link>
  );
}
