import {
  CONTRIBUTING,
  DISCUSSIONS,
  GITHUB,
  LICENSE,
  LICENSE_EE,
  OPEN_QUESTIONS,
  ROADMAP,
  SECURITY,
  SPEC,
} from "@/lib/site";

const columns = [
  {
    title: "Project",
    links: [
      { href: SPEC, label: "Specification" },
      { href: ROADMAP, label: "Roadmap" },
      { href: OPEN_QUESTIONS, label: "Open questions" },
      { href: CONTRIBUTING, label: "Contributing" },
    ],
  },
  {
    title: "Community",
    links: [
      { href: GITHUB, label: "GitHub" },
      { href: DISCUSSIONS, label: "Discussions" },
      { href: `${GITHUB}/issues`, label: "Issues" },
      { href: SECURITY, label: "Security policy" },
    ],
  },
  {
    title: "Licensing",
    links: [
      { href: LICENSE, label: "Sustainable Use License" },
      { href: LICENSE_EE, label: "Enterprise License" },
      { href: "https://faircode.io", label: "What is fair-code?" },
      {
        href: `${GITHUB}/blob/main/CONTRIBUTOR_LICENSE_AGREEMENT.md`,
        label: "Contributor agreement",
      },
    ],
  },
];

export function Footer() {
  return (
    <footer className="border-t border-line bg-ink-2/60">
      <div className="mx-auto grid max-w-6xl gap-10 px-6 py-14 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div>
          <p className="text-lg font-bold text-white">Channex PMS</p>
          <p className="mt-2 max-w-xs text-sm leading-relaxed text-fg-muted">
            Property management and channel manager for people who manage properties for other
            people. Fair-code, self-hostable, built on the Channex.io API.
          </p>
        </div>
        {columns.map((c) => (
          <div key={c.title}>
            <p className="text-sm font-semibold text-white">{c.title}</p>
            <ul className="mt-3 space-y-2 text-sm text-fg-muted">
              {c.links.map((l) => (
                <li key={l.label}>
                  <a href={l.href} className="transition hover:text-white">
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-6 py-6 text-xs text-fg-muted sm:flex-row sm:items-center sm:justify-between">
          <p>Copyright 2026 Heni Haddad and the Channex PMS contributors.</p>
          <p>Channex PMS is a working title. Not affiliated with or endorsed by Channex.io.</p>
        </div>
      </div>
    </footer>
  );
}
