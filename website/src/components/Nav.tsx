import { GITHUB, SPEC } from "@/lib/site";
import { GitHubIcon } from "./Icons";

const links = [
  { href: "#capabilities", label: "Capabilities" },
  { href: "#how-it-works", label: "How it works" },
  { href: "#deploy", label: "Self-host or cloud" },
  { href: "#fair-code", label: "Fair-code" },
  { href: "#roadmap", label: "Roadmap" },
  { href: "#faq", label: "FAQ" },
];

export function Nav() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-ink/80 backdrop-blur">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6" aria-label="Main">
        <a href="#top" className="flex items-center gap-2.5 font-bold text-white">
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
          Channex PMS
        </a>
        <ul className="hidden items-center gap-7 text-sm text-fg-muted lg:flex">
          {links.map((l) => (
            <li key={l.href}>
              <a href={l.href} className="transition hover:text-white">
                {l.label}
              </a>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-3">
          <a
            href={SPEC}
            className="hidden text-sm font-medium text-fg-muted transition hover:text-white sm:block"
          >
            Specification
          </a>
          <a
            href={GITHUB}
            className="inline-flex items-center gap-2 rounded-full border border-line bg-panel px-4 py-2 text-sm font-semibold text-white transition hover:border-mint/60 hover:bg-panel-2"
          >
            <GitHubIcon className="h-4 w-4" />
            Star on GitHub
          </a>
        </div>
      </nav>
    </header>
  );
}
