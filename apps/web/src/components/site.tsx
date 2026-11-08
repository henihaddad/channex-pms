import type React from "react";
import Link from "next/link";
import { LogoMark } from "./logo";
import { cn } from "./ui";

/**
 * The guest- and owner-facing site (booking site, guest portal, owner portal): the
 * manager's brand in a white header, a 1200px column, a quiet footer. No console
 * chrome and nothing loaded from a third party (BE-11).
 */

/** "Coastal Stays" with its first word in the accent, as the design sets a brand name. */
export function Brand({ name, href }: { name: string; href?: string }) {
  const [first, ...rest] = name.split(" ");
  const inner = (
    <>
      <LogoMark size={30} />
      <span className="font-display text-lg font-bold tracking-[-0.01em] text-foreground">
        <span className="text-accent">{first}</span>
        {rest.length ? ` ${rest.join(" ")}` : ""}
      </span>
    </>
  );
  return href ? (
    <Link href={href} className="inline-flex items-center gap-2.5">
      {inner}
    </Link>
  ) : (
    <span className="inline-flex items-center gap-2.5">{inner}</span>
  );
}

export function SiteHeader({
  brand,
  children,
}: {
  brand: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <header className="border-b border-border bg-surface px-4 sm:px-6">
      <div className="mx-auto flex min-h-[68px] max-w-[1200px] flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2">
        {brand}
        {children ? (
          <nav className="flex items-center gap-3 text-sm font-medium sm:gap-5">{children}</nav>
        ) : null}
      </div>
    </header>
  );
}

/** A header link: muted text, or the outlined pill for the one action ("Manage a booking"). */
export function SiteLink({
  href,
  pill,
  className,
  children,
}: {
  href: string;
  pill?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        pill
          ? "rounded-full border border-[#d5d9d7] px-4 py-2 text-foreground hover:bg-default"
          : "text-muted hover:text-foreground",
        className,
      )}
    >
      {children}
    </Link>
  );
}

export function SiteFooter({ left, right }: { left: React.ReactNode; right: React.ReactNode }) {
  return (
    <footer className="mt-auto border-t border-border px-4 py-7 text-[13px] text-muted sm:px-6">
      <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-4">
        <span className="inline-flex items-center gap-2">{left}</span>
        <span className="flex flex-wrap items-center gap-x-4 gap-y-1">{right}</span>
      </div>
    </footer>
  );
}

/** The site's centred column. */
export function SiteMain({
  children,
  className,
  id,
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <main id={id} className="w-full px-4 sm:px-6">
      <div className={cn("mx-auto w-full max-w-[1200px]", className)}>{children}</div>
    </main>
  );
}

/** A small uppercase line above a title ("BOOK DIRECT · NO COMMISSION"). */
export function Eyebrow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn("text-[13px] font-semibold tracking-[0.08em] text-accent uppercase", className)}
    >
      {children}
    </p>
  );
}

const GRADIENTS = [
  "linear-gradient(135deg, #cfe9e3 0%, #9fd3cf 55%, #b7e3ea 100%)",
  "linear-gradient(135deg, #f1e3cc 0%, #e4c9a3 55%, #d9b98e 100%)",
  "linear-gradient(135deg, #dfe6f3 0%, #b9c9e6 55%, #a9bbd9 100%)",
  "linear-gradient(135deg, #e6e2da 0%, #cfc7b8 55%, #bfb59f 100%)",
  "linear-gradient(135deg, #d8f3ee, #9fdcd4)",
];

/** A stable tint for a property without a photo, from its id, so it does not change between visits. */
export function tint(id: string): string {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return GRADIENTS[h % GRADIENTS.length]!;
}

/** A photo, or the property's tint when it has none yet. */
export function Photo({
  src,
  seed,
  tone,
  alt,
  className,
  children,
}: {
  src: string | null | undefined;
  seed: string;
  /** A tint picked by the caller (a list spreads them out); the seed's own otherwise. */
  tone?: string;
  alt: string;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn("relative overflow-hidden", className)}
      style={{ background: tone ?? tint(seed) }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- photos live on the manager's storage, not a Next image loader
        <img
          src={src}
          alt={alt}
          loading="lazy"
          className="absolute inset-0 size-full object-cover"
        />
      ) : null}
      {children}
    </div>
  );
}
