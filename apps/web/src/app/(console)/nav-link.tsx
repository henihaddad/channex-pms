"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** A sidebar entry. Lives in the sidebar's dark scope, so HeroUI's dark tokens apply. */
export function NavLink({
  href,
  label,
  badge,
  alert,
  testId,
}: {
  href: string;
  label: string;
  badge?: number;
  alert?: boolean;
  testId?: string;
}) {
  const pathname = usePathname();
  const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      data-testid={testId}
      className={`relative flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm transition-colors ${
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
      <span className="truncate">{label}</span>
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
