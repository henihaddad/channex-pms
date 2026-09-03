"use client";

import type React from "react";
import { useRouter } from "next/navigation";
import { I18nProvider, RouterProvider } from "@heroui/react";

/**
 * HeroUI runtime context: the locale React Aria formats dates and numbers
 * with (kept equal to next-intl's so server and client agree) and the router
 * its links navigate through.
 */
export function UiProvider({ locale, children }: { locale: string; children: React.ReactNode }) {
  const router = useRouter();
  return (
    <RouterProvider navigate={(href) => router.push(href)}>
      <I18nProvider locale={locale}>{children}</I18nProvider>
    </RouterProvider>
  );
}
