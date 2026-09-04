import Link from "next/link";
import { GITHUB, SIGN_UP } from "@/lib/site";
import { ArrowIcon, GitHubIcon } from "./Icons";

export function FinalCta() {
  return (
    <section className="relative overflow-hidden py-24">
      <div className="glow absolute inset-0 -z-10" aria-hidden="true" />
      <div className="mx-auto max-w-3xl px-6 text-center">
        <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-5xl">
          Put your portfolio on <span className="gradient-text">one calendar</span>.
        </h2>
        <p className="mt-5 text-lg leading-relaxed text-fg-muted">
          Create an organisation, add a property, connect Airbnb and Booking.com, and see the first
          booking land with its turnover task and owner line. Fourteen days free, no card needed.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <a
            href={SIGN_UP}
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-mint to-sky px-6 py-3 text-sm font-bold text-ink shadow-lg shadow-mint/20 transition hover:brightness-110"
          >
            Start free
            <ArrowIcon />
          </a>
          <Link
            href="/pricing"
            className="inline-flex items-center gap-2 rounded-full border border-line bg-panel px-6 py-3 text-sm font-semibold text-white transition hover:border-mint/60 hover:bg-panel-2"
          >
            See pricing
          </Link>
          <a
            href={GITHUB}
            className="inline-flex items-center gap-2 rounded-full border border-line bg-panel px-6 py-3 text-sm font-semibold text-white transition hover:border-mint/60 hover:bg-panel-2"
          >
            <GitHubIcon className="h-4 w-4" />
            Self-host from GitHub
          </a>
        </div>
      </div>
    </section>
  );
}
