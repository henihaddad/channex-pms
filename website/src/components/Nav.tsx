import Link from "next/link";
import { GITHUB, SIGN_IN, SIGN_UP } from "@/lib/site";
import { GitHubIcon } from "./Icons";

const links = [
  { href: "/#capabilities", label: "Capabilities" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#deploy", label: "Self-host or cloud" },
  { href: "/pricing", label: "Pricing" },
  { href: "/#fair-code", label: "Fair-code" },
  { href: "/#faq", label: "FAQ" },
];

export function Nav() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-ink/80 backdrop-blur">
      <nav
        className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6"
        aria-label="Main"
      >
        <Link href="/" className="flex items-center gap-2.5 font-bold text-white">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-mint to-sky text-ink">
            <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="currentColor" aria-hidden="true">
              <rect x="3" y="4" width="5" height="5" rx="1.2" />
              <rect x="9.5" y="4" width="5" height="5" rx="1.2" />
              <rect x="16" y="4" width="5" height="5" rx="1.2" />
              <rect x="3" y="10.5" width="5" height="5" rx="1.2" opacity=".45" />
              <rect x="9.5" y="10.5" width="11.5" height="5" rx="1.2" />
              <rect x="3" y="17" width="11.5" height="5" rx="1.2" />
              <rect x="16" y="17" width="5" height="5" rx="1.2" opacity=".45" />
            </svg>
          </span>
          <span>
            <span className="bg-linear-to-r from-mint to-sky bg-clip-text text-transparent">
              OTA
            </span>
            bridge
          </span>
        </Link>
        <ul className="hidden items-center gap-7 text-sm text-fg-muted lg:flex">
          {links.map((l) => (
            <li key={l.href}>
              <Link href={l.href} className="transition hover:text-white">
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-2 sm:gap-3">
          <a
            href={GITHUB}
            className="hidden h-9 w-9 place-items-center rounded-full border border-line bg-panel text-white transition hover:border-mint/60 hover:bg-panel-2 md:grid"
            aria-label="OTAbridge on GitHub"
          >
            <GitHubIcon className="h-4 w-4" />
          </a>
          <a
            href={SIGN_IN}
            className="rounded-full px-3 py-2 text-sm font-semibold text-white transition hover:text-mint"
          >
            Sign in
          </a>
          <a
            href={SIGN_UP}
            className="inline-flex items-center rounded-full bg-gradient-to-r from-mint to-sky px-4 py-2 text-sm font-bold text-ink shadow-lg shadow-mint/20 transition hover:brightness-110"
          >
            Start free
          </a>
        </div>
      </nav>
    </header>
  );
}
