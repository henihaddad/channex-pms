"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CommandPalette, type PaletteItem, type PaletteLabels } from "./command-palette";

type SearchFn = (q: {
  q: string;
}) => Promise<{ reservations: PaletteItem[]; properties: PaletteItem[] }>;

/** Anything that asks the console to open ⌘K (the phone header's search button) dispatches this. */
export const OPEN_PALETTE_EVENT = "pms:palette";

const typing = (e: KeyboardEvent) => {
  const el = e.target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable === true;
};

/**
 * The console's keyboard layer. ⌘K (Ctrl+K) opens the palette, "/" focuses the header search,
 * "?" opens the shortcuts page, "n" starts a reservation and "g" then a letter goes to a section,
 * Gmail-style. Nothing fires while you type in a field. Every shortcut is also a button somewhere,
 * so nobody has to learn them.
 */
export function ConsoleHotkeys({
  search,
  pages,
  actions,
  goTo,
  labels,
  onLocale,
  shortcutsHref = "/shortcuts",
}: {
  search: SearchFn;
  pages: PaletteItem[];
  actions: PaletteItem[];
  /** Letter after "g" → href. */
  goTo: Record<string, string>;
  labels: PaletteLabels;
  onLocale?: (form: FormData) => Promise<void>;
  shortcutsHref?: string;
}) {
  const router = useRouter();
  const [palette, setPalette] = useState(false);

  useEffect(() => {
    let chord: string | null = null;
    let chordAt = 0;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((v) => !v);
        return;
      }
      if (e.defaultPrevented || typing(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "/") {
        const box = document.querySelector<HTMLInputElement>('[data-testid="global-search"]');
        if (box && box.offsetParent !== null) {
          e.preventDefault();
          box.focus();
          box.select();
        }
        return;
      }
      if (e.key === "?") {
        e.preventDefault();
        router.push(shortcutsHref);
        return;
      }
      const k = e.key.toLowerCase();
      if (chord === "g" && Date.now() - chordAt < 1200) {
        chord = null;
        const href = goTo[k];
        if (href) {
          e.preventDefault();
          router.push(href);
        }
        return;
      }
      if (k === "g") {
        chord = "g";
        chordAt = Date.now();
        return;
      }
      // a page with its own single-letter keys (calendar, inbox, a reservation) claims them first
      if (k === "n" && !document.querySelector("[data-own-keys]")) {
        e.preventDefault();
        router.push("/reservations/new");
      }
    };
    const onHash = () => {
      if (window.location.hash === "#shortcuts") router.push(shortcutsHref);
    };
    const onOpen = () => setPalette(true);
    // the header search opens the palette on click when JavaScript is here; without it the form still submits
    const box = document.querySelector<HTMLInputElement>('[data-testid="global-search"]');
    const onBoxClick = (e: MouseEvent) => {
      e.preventDefault();
      setPalette(true);
    };
    box?.addEventListener("click", onBoxClick);
    window.addEventListener("keydown", onKey);
    window.addEventListener("hashchange", onHash);
    window.addEventListener(OPEN_PALETTE_EVENT, onOpen);
    onHash();
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("hashchange", onHash);
      window.removeEventListener(OPEN_PALETTE_EVENT, onOpen);
      box?.removeEventListener("click", onBoxClick);
    };
  }, [goTo, router, shortcutsHref]);

  return (
    <CommandPalette
      open={palette}
      onOpenChange={setPalette}
      search={search}
      pages={pages}
      actions={actions}
      labels={labels}
      onLocale={onLocale}
    />
  );
}
