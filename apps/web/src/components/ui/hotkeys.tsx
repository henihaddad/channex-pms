"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CommandPalette, type PaletteItem, type PaletteLabels } from "./command-palette";
import { ShortcutsSheet, type ShortcutGroup } from "./shortcuts-sheet";

type SearchFn = (q: {
  q: string;
}) => Promise<{ reservations: PaletteItem[]; properties: PaletteItem[] }>;

const typing = (e: KeyboardEvent) => {
  const el = e.target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable === true;
};

/**
 * The console's keyboard layer. ⌘K (Ctrl+K) opens the palette, "/" focuses
 * the header search, "?" shows the sheet, "n" starts a reservation and
 * "g" then a letter goes to a section, Gmail-style. Nothing fires while you
 * type in a field. Every shortcut is also a button somewhere, so nobody has
 * to learn them.
 */
export function ConsoleHotkeys({
  search,
  pages,
  actions,
  goTo,
  labels,
  sheet,
}: {
  search: SearchFn;
  pages: PaletteItem[];
  actions: PaletteItem[];
  /** Letter after "g" → href. */
  goTo: Record<string, string>;
  labels: PaletteLabels;
  sheet: { title: string; lead: string; groups: ShortcutGroup[] };
}) {
  const router = useRouter();
  const [palette, setPalette] = useState(false);
  const [help, setHelp] = useState(false);

  useEffect(() => {
    let chord: string | null = null;
    let chordAt = 0;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((v) => !v);
        return;
      }
      if (typing(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "/") {
        const box = document.querySelector<HTMLInputElement>('[data-testid="global-search"]');
        if (box) {
          e.preventDefault();
          box.focus();
          box.select();
        }
        return;
      }
      if (e.key === "?") {
        e.preventDefault();
        setHelp((v) => !v);
        return;
      }
      if (e.key === "Escape") {
        setHelp(false);
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
      if (k === "n") {
        e.preventDefault();
        router.push("/reservations/new");
      }
    };
    const onHash = () => {
      if (window.location.hash === "#shortcuts") {
        setHelp(true);
        history.replaceState(null, "", window.location.pathname + window.location.search);
      }
    };
    // the header search opens the palette on click when JavaScript is here; without it the form still submits
    const box = document.querySelector<HTMLInputElement>('[data-testid="global-search"]');
    const onBoxClick = (e: MouseEvent) => {
      e.preventDefault();
      setPalette(true);
    };
    box?.addEventListener("click", onBoxClick);
    window.addEventListener("keydown", onKey);
    window.addEventListener("hashchange", onHash);
    onHash();
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("hashchange", onHash);
      box?.removeEventListener("click", onBoxClick);
    };
  }, [goTo, router]);

  return (
    <>
      <CommandPalette
        open={palette}
        onOpenChange={setPalette}
        search={search}
        pages={pages}
        actions={actions}
        labels={labels}
      />
      <ShortcutsSheet
        open={help}
        onClose={() => setHelp(false)}
        title={sheet.title}
        lead={sheet.lead}
        groups={sheet.groups}
      />
    </>
  );
}
