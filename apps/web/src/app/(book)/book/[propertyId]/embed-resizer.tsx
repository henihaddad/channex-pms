"use client";

import { useEffect } from "react";

/** Inside the iframe: report the document height to the host page (spec 10 §10.3 postMessage resizing). */
export function EmbedResizer() {
  useEffect(() => {
    const post = () =>
      window.parent.postMessage(
        { type: "pms:resize", height: document.documentElement.scrollHeight },
        "*",
      );
    post();
    const ro = new ResizeObserver(post);
    ro.observe(document.body);
    return () => ro.disconnect();
  }, []);
  return null;
}
