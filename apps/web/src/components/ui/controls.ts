/**
 * Shared classes for every text-like control: input, textarea, select, date. The edge uses the
 * control border (3:1, WCAG 1.4.11) and focus keeps the global 2px accent outline (2.4.7).
 */
export const controlClasses =
  "block w-full min-w-0 rounded-control border border-border-control bg-surface px-3.5 text-sm text-foreground placeholder:text-muted/80 focus:border-accent disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-danger";

export const controlHeight = { sm: "h-8 text-xs px-3", md: "h-10.5" } as const;
