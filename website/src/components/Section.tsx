import type { ReactNode } from "react";

type Props = {
  id?: string;
  eyebrow?: string;
  title: string;
  lead?: string;
  children: ReactNode;
  className?: string;
};

export function Section({ id, eyebrow, title, lead, children, className = "" }: Props) {
  return (
    <section id={id} className={`scroll-mt-24 py-20 sm:py-28 ${className}`}>
      <div className="mx-auto max-w-6xl px-6">
        <div className="max-w-3xl">
          {eyebrow ? (
            <p className="text-sm font-semibold uppercase tracking-widest text-mint">{eyebrow}</p>
          ) : null}
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">{title}</h2>
          {lead ? <p className="mt-4 text-lg leading-relaxed text-fg-muted">{lead}</p> : null}
        </div>
        <div className="mt-12">{children}</div>
      </div>
    </section>
  );
}
