import { GITHUB, SPEC } from "@/lib/site";
import { ArrowIcon, GitHubIcon } from "./Icons";
import { ProductMock } from "./ProductMock";

export function Hero() {
  return (
    <section id="top" className="relative overflow-hidden">
      <div className="grid-bg absolute inset-0 -z-10" aria-hidden="true" />
      <div className="glow absolute inset-x-0 top-0 -z-10 h-[520px]" aria-hidden="true" />
      <div className="mx-auto grid max-w-6xl items-center gap-14 px-6 pb-20 pt-20 lg:grid-cols-[1fr_1fr] lg:pb-28 lg:pt-28">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full border border-line bg-panel px-3 py-1 text-xs font-semibold text-fg-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-amber" aria-hidden="true" />
            Milestone M0 in progress. Nothing an operator can use yet.
          </p>
          <h1 className="mt-6 text-4xl font-extrabold leading-[1.05] tracking-tight text-white sm:text-5xl lg:text-5xl">
            The PMS for people who manage properties{" "}
            <span className="gradient-text">for other people.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-fg-muted">
            Channel manager, reservations, turnover operations, unified inbox, owner statements and
            a direct booking engine in one fair-code platform. Run it on your servers or ours, on
            top of the Channex.io connectivity API.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a
              href={SPEC}
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-mint to-sky px-6 py-3 text-sm font-bold text-ink shadow-lg shadow-mint/20 transition hover:brightness-110"
            >
              Read the specification
              <ArrowIcon />
            </a>
            <a
              href={GITHUB}
              className="inline-flex items-center gap-2 rounded-full border border-line bg-panel px-6 py-3 text-sm font-semibold text-white transition hover:border-mint/60 hover:bg-panel-2"
            >
              <GitHubIcon className="h-4 w-4" />
              Follow on GitHub
            </a>
          </div>
          <dl className="mt-10 grid max-w-lg grid-cols-3 gap-6 border-t border-line pt-6 text-sm">
            <div>
              <dt className="text-fg-muted">Licence</dt>
              <dd className="mt-1 font-semibold text-white">Sustainable Use</dd>
            </div>
            <div>
              <dt className="text-fg-muted">Deploy</dt>
              <dd className="mt-1 font-semibold text-white">Docker Compose</dd>
            </div>
            <div>
              <dt className="text-fg-muted">Connectivity</dt>
              <dd className="mt-1 font-semibold text-white">40+ OTAs via Channex</dd>
            </div>
          </dl>
        </div>
        <ProductMock />
      </div>
    </section>
  );
}
