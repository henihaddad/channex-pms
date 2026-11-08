"use client";

import type React from "react";
import { usePathname } from "next/navigation";

/**
 * The brand panel beside the sign-in and sign-up cards. Sign-up has its own copy (the
 * trial and the three steps to a live calendar); every other auth page shares the
 * product claim. Both are rendered on the server and picked here by path.
 */
export function AuthAside({
  panels,
}: {
  panels: { default: React.ReactNode; signup: React.ReactNode };
}) {
  const path = usePathname();
  return <>{path.startsWith("/signup") ? panels.signup : panels.default}</>;
}
