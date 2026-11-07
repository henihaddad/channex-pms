/** Shared classes for every text-like control: input, textarea, select, date. */
export const controlClasses =
  "block w-full min-w-0 rounded-control border border-border bg-surface px-3.5 text-sm text-foreground placeholder:text-muted/80 focus:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-danger";

export const controlHeight = { sm: "h-8 text-xs px-3", md: "h-10.5" } as const;
