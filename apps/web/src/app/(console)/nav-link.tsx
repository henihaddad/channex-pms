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

/**
 * A section of the sidebar: the section's own page, and its pages beneath it.
 * They unfold when you are inside the section, and the chevron opens or
 * closes it by hand; that choice is remembered per browser.
 */
export function NavSection({
  item,
  pages,
  toggleLabel,
}: {
  item: NavItem;
  pages: readonly NavItem[];
  /** Accessible name of the disclosure, with {section} replaced by the section's name. */
  toggleLabel: string;
}) {
  const pathname = usePathname();
  const inside = isActive(pathname, item.href) || pages.some((c) => isActive(pathname, c.href));
  const stored = useSyncExternalStore(
    subscribeNav,
    () => readNav(item.href),
    () => null,
  );
  const open = stored === null ? inside : stored === "1";
  return (
    <li>
      <div className="relative flex items-center">
        <NavLink {...item} />
        <button
          type="button"
          onClick={() => writeNav(item.href, open ? "0" : "1")}
          aria-expanded={open}
          aria-label={toggleLabel.replace("{section}", item.label)}
          data-testid={`nav-toggle-${item.href.replace(/\W+/g, "") || "root"}`}
          className="absolute end-1 grid h-7 w-7 place-items-center rounded-lg text-xs text-muted transition-colors hover:bg-surface-secondary hover:text-foreground"
        >
          <span className={`transition-transform ${open ? "rotate-90" : ""}`} aria-hidden="true">
            ›
          </span>
        </button>
      </div>
      <ul hidden={!open} className="mt-0.5 mb-1 ms-5 space-y-0.5 border-s border-border ps-2">
        {pages.map((c) => (
          <li key={c.href}>
            <NavLink {...c} />
          </li>
        ))}
      </ul>
    </li>
  );
}

const NAV_KEY = "pms.nav.open";
const NAV_EVENT = "pms:nav";

function readNav(key: string): string | null {
  try {
    const raw = window.localStorage.getItem(NAV_KEY);
    return raw ? ((JSON.parse(raw) as Record<string, string>)[key] ?? null) : null;
  } catch {
    return null;
  }
}

function writeNav(key: string, value: string): void {
  try {
    const raw = window.localStorage.getItem(NAV_KEY);
    const all = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    all[key] = value;
    window.localStorage.setItem(NAV_KEY, JSON.stringify(all));
  } catch {
    /* no storage: the section still toggles for this render through the event */
  }
  window.dispatchEvent(new Event(NAV_EVENT));
}

function subscribeNav(cb: () => void): () => void {
  window.addEventListener(NAV_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(NAV_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}
