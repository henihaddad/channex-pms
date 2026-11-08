"use client";

import type { ReactNode } from "react";
import { SectionTabs, SectionTabsContext, type SectionTab } from "@/components/ui";

/**
 * Replaces the section's tabs under a page title: one property's own pages (Overview,
 * Rooms & rates, Guide, Pricing…), or none at all for a form such as "Add a property".
 */
export function TabsOverride({
  items,
  ariaLabel,
  children,
}: {
  items: SectionTab[] | null;
  ariaLabel?: string;
  children: ReactNode;
}) {
  return (
    <SectionTabsContext.Provider
      value={items ? <SectionTabs items={items} ariaLabel={ariaLabel ?? ""} /> : false}
    >
      {children}
    </SectionTabsContext.Provider>
  );
}
