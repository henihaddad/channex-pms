import { LICENSE, LICENSE_EE } from "@/lib/site";
import { CheckIcon, CrossIcon } from "./Icons";
import { Section } from "./Section";

const allowed = [
  "Read every line of the source, always",
  "Self-host for your own portfolio, of any size",
  "Modify it and keep your changes private",
  "Offer consulting, setup and support around it",
  "Build plugins and integrations on the Apache-2.0 SDK",
  "Embed the Apache-2.0 booking widget on any site",
];

const restricted = [
  "Host it and charge other operators for access",
  "White-label it inside a product you sell",
  "Use files marked .ee. in production without an enterprise licence",
];

export function FairCode() {
  return (
    <Section
      id="fair-code"
      eyebrow="Fair-code"
      title="Source-available, self-hostable, sustainable."
      lead="We use the same licence model as n8n: the Sustainable Use License for the platform, an enterprise licence for a handful of clearly marked files, Apache-2.0 for everything you might embed or extend."
    >
      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-2xl border border-mint/30 bg-mint/5 p-7">
          <h3 className="text-lg font-bold text-white">You can</h3>
          <ul className="mt-4 space-y-3">
            {allowed.map((a) => (
              <li key={a} className="flex items-start gap-3">
                <CheckIcon className="mt-1 h-4 w-4 shrink-0 text-mint" />
                <span>{a}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl border border-line bg-panel p-7">
          <h3 className="text-lg font-bold text-white">You need an enterprise licence to</h3>
          <ul className="mt-4 space-y-3">
            {restricted.map((r) => (
              <li key={r} className="flex items-start gap-3">
                <CrossIcon className="mt-1 h-4 w-4 shrink-0 text-amber" />
                <span>{r}</span>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-sm leading-relaxed text-fg-muted">
            This is fair-code, not OSI open source, and we say so plainly. It is what lets a small
            team fund the work while every self-hoster keeps the full product for free. Read the{" "}
            <a href={LICENSE} className="text-mint underline-offset-4 hover:underline">
              Sustainable Use License
            </a>{" "}
            and the{" "}
            <a href={LICENSE_EE} className="text-mint underline-offset-4 hover:underline">
              Enterprise License
            </a>
            .
          </p>
        </div>
      </div>
    </Section>
  );
}
