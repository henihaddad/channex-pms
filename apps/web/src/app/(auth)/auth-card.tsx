import type React from "react";
import { cn } from "@/components/ui";

/** The card every auth page sits in: a display title, then the form. */
export function AuthCard({
  title,
  children,
  className,
}: {
  title: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "flex w-full flex-col gap-[18px] rounded-[20px] border border-border bg-surface p-8 shadow-[0_12px_32px_rgba(20,23,22,0.06)]",
        className,
      )}
    >
      <h1 className="font-display text-[26px] leading-tight font-bold tracking-[-0.02em] text-foreground">
        {title}
      </h1>
      {children}
    </section>
  );
}

/** "No account yet? Create your organization" and its siblings under a card's form. */
export function AuthFootnote({ children }: { children: React.ReactNode }) {
  return <p className="text-[13px] text-muted">{children}</p>;
}

export const authLinkClass =
  "font-semibold text-accent underline underline-offset-2 hover:text-accent-soft-foreground";
