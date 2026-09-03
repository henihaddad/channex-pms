import { OPEN_QUESTIONS } from "@/lib/site";
import { Section } from "./Section";

const faqs = [
  {
    q: "Is there something I can run today?",
    a: "Not as an operator. The specification is complete enough to build against and milestone M0 is under way: the monorepo, the framework-free domain layer with its first value objects and tests, Docker Compose and CI are in place. Contributors can run it today; a property cannot. The best thing you can do now is read the spec and tell us where a real property would break it.",
  },
  {
    q: "Do I need a Channex.io account?",
    a: "Yes for self-hosting: Channex provides the certified OTA connectivity and you bring your own account. For the hosted service we are working out with Channex whether tenants can share one master account. Channex sits behind a provider interface, so other connectivity providers can be added later.",
  },
  {
    q: "Is this open source?",
    a: "It is fair-code and source-available under the Sustainable Use License, the same model as n8n. You can read, self-host and modify it for your own business for free. You cannot resell it as a hosted service or white-label it without an enterprise licence. The SDK, plugin interfaces and booking widget are Apache-2.0.",
  },
  {
    q: "Will the self-hosted version be crippled?",
    a: "No, and this is a guarantee written into the specification. Self-hosted and hosted run from the same repository. Feature flags are never paywalls. The only enterprise-gated code is explicitly marked .ee. and always visible.",
  },
  {
    q: "Hotels too, or only short-term rentals?",
    a: "Both. The product is optimised for short-term rental managers operating 5 to 300 units on behalf of owners, because that is where the tooling gap is worst. Hotels and guesthouses are fully supported through a hotel property kind with room types, many identical units and a real front desk.",
  },
  {
    q: "What is the tech stack?",
    a: "TypeScript throughout. A full-stack Next.js app for the console, booking engine, portals and API, a plain Node worker on BullMQ for the sync engine, PostgreSQL and Redis. All domain logic lives in a framework-free core package shared by both.",
  },
  {
    q: "Why the name OTAbridge?",
    a: "It is the bridge between your properties and the online travel agencies: your calendar and rates on one side, Airbnb, Booking.com, Expedia and your own site on the other. Connectivity runs on the Channex.io API; this project is not affiliated with or endorsed by Channex.io.",
  },
];

export function Faq() {
  return (
    <Section id="faq" eyebrow="FAQ" title="Questions people ask first.">
      <div className="grid gap-4 lg:grid-cols-2">
        {faqs.map((f) => (
          <details
            key={f.q}
            className="group rounded-2xl border border-line bg-panel p-6 open:border-mint/40"
          >
            <summary className="cursor-pointer list-none text-base font-bold text-white marker:hidden">
              <span className="flex items-center justify-between gap-4">
                {f.q}
                <span className="text-fg-muted transition group-open:rotate-45" aria-hidden="true">
                  +
                </span>
              </span>
            </summary>
            <p className="mt-3 leading-relaxed text-fg-muted">{f.a}</p>
          </details>
        ))}
      </div>
      <p className="mt-8 text-sm text-fg-muted">
        Still undecided items live in the{" "}
        <a href={OPEN_QUESTIONS} className="text-mint underline-offset-4 hover:underline">
          open questions
        </a>
        . Opinions from people who run properties are the reviews we lack.
      </p>
    </Section>
  );
}
