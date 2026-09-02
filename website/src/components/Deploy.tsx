import { CheckIcon } from "./Icons";
import { Section } from "./Section";

const options = [
  {
    name: "Self-hosted",
    tag: "Free, forever",
    body: "One Docker Compose file: web, worker, Postgres, Redis, object storage. Your data on your servers, exportable in full at any time.",
    points: [
      "The complete product, no community edition",
      "Under sixty minutes to the first OTA booking on screen",
      "Bring your own Channex account",
      "Sustainable Use License",
    ],
    code: "docker compose up",
  },
  {
    name: "Hosted",
    tag: "Same codebase",
    body: "For operators who do not want to run servers. Managed upgrades, backups and Channex connectivity, billed per property. Coming with milestone M8.",
    points: [
      "Feature parity with self-hosted, guaranteed",
      "Feature flags are never paywalls",
      "Leave any time with a full export",
      "Enterprise licence for resellers and white-label",
    ],
    code: "planned for v1.0",
  },
];

export function Deploy() {
  return (
    <Section
      id="deploy"
      eyebrow="Self-host or cloud"
      title="Your servers or ours. Same code, same features."
      lead="The hosted service exists so operators without an ops team can still use the product. It is not a way to hold features back."
    >
      <div className="grid gap-6 md:grid-cols-2">
        {options.map((o) => (
          <article
            key={o.name}
            className="flex flex-col rounded-2xl border border-line bg-panel p-7"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold text-white">{o.name}</h3>
              <span className="rounded-full bg-mint/15 px-3 py-1 text-xs font-semibold text-mint">
                {o.tag}
              </span>
            </div>
            <p className="mt-3 leading-relaxed text-fg-muted">{o.body}</p>
            <ul className="mt-5 space-y-2.5 text-sm">
              {o.points.map((p) => (
                <li key={p} className="flex items-start gap-2.5">
                  <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-mint" />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
            <pre className="mt-6 rounded-xl border border-line bg-ink px-4 py-3 font-mono text-sm text-fg">
              <span className="text-fg-muted">$ </span>
              {o.code}
            </pre>
          </article>
        ))}
      </div>
    </Section>
  );
}
