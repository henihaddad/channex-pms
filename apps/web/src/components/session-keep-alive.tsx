"use client";

import { useEffect } from "react";

/** A little under the access token's life, so an open tab never meets an expired one. */
const EVERY_MS = 10 * 60 * 1000;

/**
 * Keeps a signed-in tab signed in: renews the access token every ten minutes while the tab
 * is visible, and at once when someone comes back to a tab left alone longer than that, so
 * the next click or form post finds a valid session. The refresh token decides; when it has
 * expired or been revoked the next page load goes to the login page as before.
 */
export function SessionKeepAlive() {
  useEffect(() => {
    let last = Date.now();
    const renew = () => {
      last = Date.now();
      void fetch("/api/v1/auth/refresh", { method: "POST", credentials: "same-origin" }).catch(
        () => undefined,
      );
    };
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") renew();
    }, EVERY_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - last > EVERY_MS) renew();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  return null;
}
