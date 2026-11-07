import Link from "next/link";
import type { ReactNode } from "react";
import { navIcons } from "./nav-icons";

/**
 * Header menus built on <details>: no client JavaScript, the browser handles
 * open and close, Escape and focus. A click on an item navigates or submits.
 */
export function HeaderMenu({
  label,
  icon,
  children,
  testId,
  align = "end",
}: {
  label: string;
  icon?: ReactNode;
  children: ReactNode;
  testId?: string;
  align?: "start" | "end";
}) {
  return (
    <details className="group relative" data-testid={testId}>
      <summary className="flex h-9.5 cursor-pointer list-none items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-muted transition-colors hover:bg-default hover:text-foreground [&::-webkit-details-marker]:hidden">
        {icon}
        <span className="hidden sm:inline">{label}</span>
        <span aria-hidden="true" className="text-[10px]">
          ▾
        </span>
      </summary>
      <div
        className={`absolute top-full z-40 mt-1.5 min-w-56 rounded-xl border border-border bg-surface p-1.5 shadow-float ${align === "end" ? "end-0" : "start-0"}`}
      >
        {children}
      </div>
    </details>
  );
}

const itemClass =
  "flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-start text-sm text-foreground hover:bg-default";

export function MenuLink({
  href,
  children,
  hint,
  external,
  testId,
}: {
  href: string;
  children: ReactNode;
  hint?: ReactNode;
  external?: boolean;
  testId?: string;
}) {
  const inner = (
    <>
      <span>{children}</span>
      {hint ? <span className="text-xs text-muted">{hint}</span> : null}
    </>
  );
  return external ? (
    <a href={href} target="_blank" rel="noreferrer" className={itemClass} data-testid={testId}>
      {inner}
    </a>
  ) : (
    <Link href={href} className={itemClass} data-testid={testId}>
      {inner}
    </Link>
  );
}

export function MenuButton({
  children,
  name,
  value,
  current,
}: {
  children: ReactNode;
  name: string;
  value: string;
  current?: boolean;
}) {
  return (
    <button
      type="submit"
      name={name}
      value={value}
      className={itemClass}
      aria-current={current ? "true" : undefined}
    >
      <span>{children}</span>
      {current ? <span className="text-accent">{navIcons.check}</span> : null}
    </button>
  );
}

/** The alerts bell: a count when something is waiting, a quiet icon when nothing is. */
export function BellLink({ href, count, label }: { href: string; count: number; label: string }) {
  return (
    <Link
      href={href}
      aria-label={count > 0 ? `${label} · ${count}` : label}
      data-testid="alerts-bell"
      className="relative grid h-9.5 w-9.5 shrink-0 place-items-center rounded-full border border-border text-foreground transition-colors hover:bg-default"
    >
      {navIcons.bell}
      {count > 0 ? (
        <span className="absolute -top-1 -end-1 inline-flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-warning px-1 text-[10px] font-bold text-white tabular-nums">
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </Link>
  );
}
