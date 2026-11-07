import { cn } from "./cn";

export type ButtonVariant =
  "primary" | "secondary" | "tertiary" | "outline" | "ghost" | "soft" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const base =
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-full font-semibold whitespace-nowrap transition-colors select-none disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-foreground hover:bg-accent/90",
  secondary: "border border-border bg-surface text-foreground hover:bg-default",
  tertiary: "bg-default text-foreground hover:bg-border",
  outline: "border border-foreground/30 text-foreground hover:bg-default",
  ghost: "text-muted hover:bg-default hover:text-foreground",
  soft: "bg-accent-soft text-accent-soft-foreground hover:bg-accent-soft/70",
  danger: "border border-danger/30 text-danger hover:bg-danger-soft",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-9.5 px-4 text-sm",
  lg: "h-11 px-5 text-sm",
};

/** The one set of classes a button, a link that looks like one, and an anchor share. */
export function buttonClasses(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  className?: string,
  fullWidth?: boolean,
): string {
  return cn(base, variants[variant], sizes[size], fullWidth && "w-full", className);
}
