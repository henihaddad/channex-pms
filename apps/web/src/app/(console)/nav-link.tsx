"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** A sidebar entry; the active one carries the mint-to-sky bar, the brand's device. */
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
      className={`relative flex items-center justify-between rounded-md px-3 py-1.5 text-[0.875rem] transition-colors ${
        active
          ? "bg-white/[0.07] font-semibold text-white"
          : "text-white/70 hover:bg-white/[0.05] hover:text-white"
      }`}
    >
      {active ? (
        <span
          className="bridge-rail absolute inset-y-1.5 -start-3 w-[3px] rounded-full"
          aria-hidden="true"
        />
      ) : null}
      <span className="truncate">{label}</span>
      {badge && badge > 0 ? (
        <span
          className={`ms-2 rounded-full px-1.5 text-[0.68rem] font-semibold tabular-nums ${alert ? "bg-amber text-ink" : "bg-mint text-ink"}`}
        >
          {badge}
        </span>
      ) : null}
    </Link>
  );
}
