"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/components/ui";

/**
 * The owner portal's page links. The page you are on is marked for a screen reader
 * (`aria-current="page"`) and drawn filled, so the owner always knows where they are
 * (Nielsen #1). Home matches only itself; every other link also matches its sub-pages.
 */
export function OwnerNav({ label, links }: { label: string; links: Array<[string, string]> }) {
  const path = usePathname();
  return (
    <nav
      aria-label={label}
      className="scrollbar-none mx-auto flex w-full max-w-[1100px] gap-1 overflow-x-auto px-4 pt-4 text-sm sm:px-6"
    >
      {links.map(([href, text]) => {
        const current = href === "/owner" ? path === href : path.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={current ? "page" : undefined}
            className={cn(
              "shrink-0 rounded-full px-3 py-1.5 font-medium transition-colors",
              current
                ? "bg-surface font-semibold text-foreground ring-1 ring-border-control ring-inset"
                : "text-muted hover:bg-surface hover:text-foreground",
            )}
          >
            {text}
          </Link>
        );
      })}
    </nav>
  );
}
