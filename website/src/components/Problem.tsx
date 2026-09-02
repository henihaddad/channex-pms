import { Section } from "./Section";

const pains = [
  {
    title: "Five logins and a spreadsheet",
    body: "A channel manager, a PMS, a booking engine, a cleaning app, and then owner statements assembled by hand every month. Each tool bills per listing. None of them talk to each other well.",
  },
  {
    title: "Paying twice for the same hard part",
    body: "The expensive half of every vendor is certified connectivity to Booking.com, Airbnb, Vrbo and Expedia. Channex already does that half and sells it as a plain API. Everyone else resells it wrapped in a mediocre calendar.",
  },
  {
    title: "The report your clients actually see",
    body: "Owners judge you on the monthly statement. It is the one document no channel manager produces, so it is built in Excel, late, with errors, by the person who should be selling.",
  },
];

export function Problem() {
  return (
    <Section
      eyebrow="The problem"
      title="Managing 40 apartments should not need five subscriptions."
      lead="Short-term rental managers and independent hotels pay repeatedly for software whose hardest part none of the vendors built themselves."
    >
      <div className="grid gap-6 md:grid-cols-3">
        {pains.map((p) => (
          <article key={p.title} className="rounded-2xl border border-line bg-panel p-6">
            <h3 className="text-lg font-bold text-white">{p.title}</h3>
            <p className="mt-3 leading-relaxed text-fg-muted">{p.body}</p>
          </article>
        ))}
      </div>
    </Section>
  );
}
