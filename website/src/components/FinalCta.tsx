import { DESIGN_PARTNER, GITHUB, SPEC } from "@/lib/site";
import { ArrowIcon, GitHubIcon } from "./Icons";

export function FinalCta() {
  return (
    <section className="relative overflow-hidden py-24">
      <div className="glow absolute inset-0 -z-10" aria-hidden="true" />
      <div className="mx-auto max-w-3xl px-6 text-center">
        <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-5xl">
          Be the portfolio that shapes <span className="gradient-text">v1.0</span>.
        </h2>
        <p className="mt-5 text-lg leading-relaxed text-fg-muted">
          We are looking for one short-term rental manager with 20 to 60 units and one small hotel to run the
          early releases on a real portfolio. A real portfolio on the M2 release matters more than anything
          else on the roadmap.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <a
            href={DESIGN_PARTNER}
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-mint to-sky px-6 py-3 text-sm font-bold text-ink shadow-lg shadow-mint/20 transition hover:brightness-110"
          >
            Apply as a design partner
            <ArrowIcon />
          </a>
          <a
            href={SPEC}
            className="inline-flex items-center gap-2 rounded-full border border-line bg-panel px-6 py-3 text-sm font-semibold text-white transition hover:border-mint/60 hover:bg-panel-2"
          >
            Read the specification
          </a>
          <a
            href={GITHUB}
            className="inline-flex items-center gap-2 rounded-full border border-line bg-panel px-6 py-3 text-sm font-semibold text-white transition hover:border-mint/60 hover:bg-panel-2"
          >
            <GitHubIcon className="h-4 w-4" />
            Star on GitHub
          </a>
        </div>
      </div>
    </section>
  );
}
