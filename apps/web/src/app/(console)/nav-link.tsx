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
 * The secondary group: closed by default so the sidebar shows the seven daily
 * destinations, opened by the person or automatically when the page they are on
 * lives inside it. The choice is remembered per browser.
 */
export function NavMore({
  label,
  icon,
  items,
}: {
  label: string;
  icon: ReactNode;
  items: NavItem[];
}) {
  const pathname = usePathname();
  const inside = items.some((i) => isActive(pathname, i.href));
  // "1" open, "0" closed, unset: open only while the current page lives in the group
  const stored = useSyncExternalStore(subscribeNav, readNavPreference, () => null);
  const open = stored === null ? inside : stored === "1";
  const toggle = () => writeNavPreference(open ? "0" : "1");
  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls="nav-more"
        data-testid="nav-more"
        className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-colors hover:bg-surface-secondary hover:text-foreground ${
          inside && !open ? "font-medium text-foreground" : "text-muted"
        }`}
      >
        {icon}
        <span className="flex-1 text-start">{label}</span>
        <span
          className={`text-xs transition-transform ${open ? "rotate-90" : ""}`}
          aria-hidden="true"
        >
          ›
        </span>
      </button>
      <ul
        id="nav-more"
        hidden={!open}
        className="mt-0.5 ms-4 space-y-0.5 border-s border-border ps-1"
      >
        {items.map((l) => (
          <li key={l.href}>
            <NavLink {...l} />
          </li>
        ))}
      </ul>
    </div>
  );
}

const NAV_KEY = "pms.nav.more";
const NAV_EVENT = "pms:nav";

function readNavPreference(): string | null {
  try {
    return window.localStorage.getItem(NAV_KEY);
  } catch {
    return null;
  }
}

function writeNavPreference(value: string): void {
  try {
    window.localStorage.setItem(NAV_KEY, value);
  } catch {
    /* no storage: the group still toggles for this render via the event */
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
