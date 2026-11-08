"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/components/ui";

/** The settings pages as a left sub-nav (design board "Settings — Integrations"); a row of chips on a phone. */
export function SettingsNav({
  items,
  label,
}: {
  items: Array<{ href: string; label: string }>;
  label: string;
}) {
  const pathname = usePathname();
  return (
    <nav aria-label={label} className="min-w-0">
      <ul className="scrollbar -mx-1 flex gap-1 overflow-x-auto px-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0">
        {items.map((i) => {
          const active = pathname === i.href || pathname.startsWith(`${i.href}/`);
          return (
            <li key={i.href} className="shrink-0">
              <Link
                href={i.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "block rounded-xl border px-3 py-2 text-sm whitespace-nowrap transition-colors",
                  active
                    ? "border-border bg-surface font-semibold text-foreground"
                    : "border-transparent text-muted hover:bg-default hover:text-foreground",
                )}
              >
                {i.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
