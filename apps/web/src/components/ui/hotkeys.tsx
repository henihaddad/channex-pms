"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import type { PaletteItem, PaletteLabels } from "./command-palette";
import { OPEN_PALETTE_EVENT } from "./palette-event";

// cmdk and the palette (about 20 KB gzipped) load on first use, not with every console page
const loadPalette = () => import("./command-palette");
const CommandPalette = dynamic(() => loadPalette().then((m) => m.CommandPalette), { ssr: false });

type SearchFn = (q: {
  q: string;
}) => Promise<{ reservations: PaletteItem[]; properties: PaletteItem[] }>;

export { OPEN_PALETTE_EVENT };

const typing = (e: KeyboardEvent) => {
  const el = e.target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable === true;
};

/**
 * The console's keyboard layer. ⌘K (Ctrl+K) opens the palette, "/" opens it too,
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
  // mounted from the first open on, so closing keeps its exit animation and its state
  const [used, setUsed] = useState(false);

  useEffect(() => {
    let chord: string | null = null;
    let chordAt = 0;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setUsed(true);
        setPalette((v) => !v);
        return;
      }
      if (e.defaultPrevented || typing(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "/") {
        e.preventDefault();
        setUsed(true);
        setPalette(true);
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
    const onOpen = () => {
      setUsed(true);
      setPalette(true);
    };
    // the header search is the palette's door: click or focus opens it (one behaviour for mouse and
    // keyboard); without JavaScript the form still submits to the reservations search
    const box = document.querySelector<HTMLInputElement>('[data-testid="global-search"]');
    const onBoxOpen = (e: Event) => {
      e.preventDefault();
      box?.blur();
      setUsed(true);
      setPalette(true);
    };
    const preload = () => void loadPalette();
    box?.addEventListener("click", onBoxOpen);
    box?.addEventListener("focus", onBoxOpen);
    box?.addEventListener("pointerenter", preload, { once: true });
    window.addEventListener("keydown", onKey);
    window.addEventListener("hashchange", onHash);
    window.addEventListener(OPEN_PALETTE_EVENT, onOpen);
    onHash();
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("hashchange", onHash);
      window.removeEventListener(OPEN_PALETTE_EVENT, onOpen);
      box?.removeEventListener("click", onBoxOpen);
      box?.removeEventListener("focus", onBoxOpen);
      box?.removeEventListener("pointerenter", preload);
    };
  }, [goTo, router, shortcutsHref]);

  if (!used && !palette) return null;
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
