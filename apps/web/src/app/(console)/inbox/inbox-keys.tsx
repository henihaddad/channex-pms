"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const typing = (el: Element | null) =>
  !!el &&
  (el.tagName === "INPUT" ||
    el.tagName === "TEXTAREA" ||
    el.tagName === "SELECT" ||
    (el as HTMLElement).isContentEditable);

/**
 * The inbox's keys (shortcuts page): J / K next and previous conversation, R reply, S suggest a
 * reply from the guide, E close the conversation, A assign. ⌘↵ sends from the composer itself.
 * Each one presses a button that is on the screen, so a key never does something a click cannot.
 */
export function InboxKeys() {
  const router = useRouter();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.defaultPrevented ||
        e.metaKey ||
        e.ctrlKey ||
        e.altKey ||
        typing(document.activeElement)
      )
        return;
      const k = e.key.toLowerCase();
      if (k === "j" || k === "k") {
        const rows = [
          ...document.querySelectorAll<HTMLAnchorElement>('[data-testid="thread-row"]'),
        ];
        if (rows.length === 0) return;
        const at = rows.findIndex((r) => r.getAttribute("aria-current") === "true");
        const next =
          k === "j" ? Math.min(rows.length - 1, at + 1) : Math.max(0, at === -1 ? 0 : at - 1);
        e.preventDefault();
        router.push(rows[next]!.getAttribute("href")!);
        return;
      }
      const click = (sel: string) => {
        const el = document.querySelector<HTMLElement>(sel);
        if (!el) return false;
        e.preventDefault();
        el.click();
        return true;
      };
      if (k === "r") {
        const box = document.querySelector<HTMLTextAreaElement>('[data-testid="guest-body"]');
        if (box) {
          e.preventDefault();
          box.focus();
        } else click('[data-testid="mode-guest"]');
      } else if (k === "s") click('[data-testid="suggest-reply"]');
      else if (k === "e") click('[data-testid="close-thread"]');
      else if (k === "a") {
        const d = document.querySelector<HTMLDetailsElement>("details[data-assign]");
        if (d) {
          e.preventDefault();
          d.open = true;
          d.querySelector<HTMLSelectElement>("select")?.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);
  return null;
}
