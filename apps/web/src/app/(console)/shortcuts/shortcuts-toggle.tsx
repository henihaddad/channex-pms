"use client";

import { useSyncExternalStore } from "react";
import { setShortcutsEnabled, shortcutsEnabled } from "@/components/ui/palette-event";
import { announce } from "@/components/ui";

const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

/** The switch for single-letter shortcuts, remembered on this device. */
export function ShortcutsToggle({ label, on, off }: { label: string; on: string; off: string }) {
  const enabled = useSyncExternalStore(subscribe, shortcutsEnabled, () => true);
  return (
    <label className="flex items-center gap-3 text-sm font-medium text-foreground">
      <input
        type="checkbox"
        role="switch"
        checked={enabled}
        onChange={(e) => {
          setShortcutsEnabled(e.target.checked);
          for (const fn of listeners) fn();
          announce(e.target.checked ? on : off);
        }}
        className="size-5 accent-accent"
        data-testid="shortcuts-toggle"
      />
      {label}
    </label>
  );
}
