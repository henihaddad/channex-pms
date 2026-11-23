"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Re-renders the server page every few seconds while something is in progress, so nobody has to
 * press reload. Only while the tab is visible: a background tab waits, and refreshes once when the
 * host comes back to it. `active={false}` stops it (the work it was waiting for is done).
 */
export function AutoRefresh({
  everyMs = 15_000,
  active = true,
}: {
  everyMs?: number;
  active?: boolean;
}) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const visible = () => document.visibilityState === "visible";
    const id = window.setInterval(() => {
      if (visible()) router.refresh();
    }, everyMs);
    const onVisible = () => {
      if (visible()) router.refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router, everyMs, active]);
  return null;
}
