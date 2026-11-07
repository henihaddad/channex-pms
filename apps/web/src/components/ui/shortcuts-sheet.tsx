"use client";

import { useEffect, useRef } from "react";

export interface ShortcutGroup {
  title: string;
  items: Array<{ keys: string[]; label: string }>;
}

/** The "?" sheet: every shortcut that works, grouped. A native dialog, so the browser handles focus and Escape. */
export function ShortcutsSheet({
  open,
  onClose,
  title,
  lead,
  groups,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  lead: string;
  groups: ShortcutGroup[];
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className="m-auto w-[min(720px,calc(100vw-2rem))] rounded-2xl border border-border bg-surface p-0 text-foreground shadow-float backdrop:bg-[#101413]/45"
      data-testid="shortcuts-sheet"
    >
      <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
        <div>
          <h2 className="font-display text-xl font-bold">{title}</h2>
          <p className="mt-1 text-sm text-muted">{lead}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-border px-2.5 py-1 text-xs font-semibold text-muted hover:bg-default"
        >
          Esc
        </button>
      </div>
      <div className="grid gap-5 px-6 py-5 sm:grid-cols-2">
        {groups.map((g) => (
          <section key={g.title}>
            <h3 className="text-sm font-bold">{g.title}</h3>
            <dl className="mt-2 grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 text-sm">
              {g.items.map((it) => (
                <div key={it.label} className="contents">
                  <dt className="flex gap-1 whitespace-nowrap">
                    {it.keys.map((k) => (
                      <kbd
                        key={k}
                        className="rounded-md border border-border border-b-2 bg-surface px-1.5 py-0.5 text-[11px] font-semibold text-muted"
                      >
                        {k}
                      </kbd>
                    ))}
                  </dt>
                  <dd className="text-foreground">{it.label}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </dialog>
  );
}
