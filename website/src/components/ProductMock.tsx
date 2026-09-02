const days = ["Mon 7", "Tue 8", "Wed 9", "Thu 10", "Fri 11", "Sat 12", "Sun 13"];

const rows: { name: string; cells: (null | { span: number; ch: string; tone: string })[] }[] = [
  {
    name: "Bourguiba 12",
    cells: [
      { span: 3, ch: "Airbnb", tone: "bg-rose-400/80" },
      null,
      { span: 2, ch: "Booking.com", tone: "bg-sky-400/80" },
      null,
    ],
  },
  {
    name: "La Marsa 4B",
    cells: [
      null,
      { span: 4, ch: "Direct", tone: "bg-mint/80" },
      null,
      { span: 1, ch: "Expedia", tone: "bg-amber/80" },
    ],
  },
  {
    name: "Sidi Bou Said Loft",
    cells: [
      { span: 2, ch: "Booking.com", tone: "bg-sky-400/80" },
      null,
      { span: 3, ch: "Airbnb", tone: "bg-rose-400/80" },
      null,
    ],
  },
];

export function ProductMock() {
  return (
    <div className="grid gap-4" aria-hidden="true">
      <div className="rounded-2xl border border-line bg-panel p-4 shadow-2xl shadow-black/40">
        <div className="flex items-center justify-between text-xs text-fg-muted">
          <span className="font-semibold text-white">Portfolio calendar</span>
          <span className="rounded-full bg-mint/15 px-2 py-0.5 font-medium text-mint">
            All 142 listings in sync
          </span>
        </div>
        <div className="mt-4 grid grid-cols-[minmax(0,2.2fr)_repeat(7,minmax(0,1fr))] gap-y-2 text-[11px]">
          <div />
          {days.map((d) => (
            <div key={d} className="text-center text-fg-muted">
              {d}
            </div>
          ))}
          {rows.map((r) => {
            const cells: React.ReactNode[] = [];
            let i = 0;
            for (const c of r.cells) {
              if (c) {
                cells.push(
                  <div
                    key={`${r.name}-${i}`}
                    className={`mx-0.5 truncate rounded-md px-2 py-1.5 font-semibold text-ink ${c.tone}`}
                    style={{ gridColumn: `span ${c.span} / span ${c.span}` }}
                  >
                    {c.ch}
                  </div>,
                );
                i += c.span;
              } else {
                cells.push(
                  <div
                    key={`${r.name}-${i}`}
                    className="mx-0.5 rounded-md border border-dashed border-line py-1.5"
                  />,
                );
                i += 1;
              }
            }
            return (
              <div key={r.name} className="contents">
                <div className="truncate pr-3 font-medium text-fg">{r.name}</div>
                {cells}
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-[1.2fr_1fr]">
        <div className="rounded-2xl border border-line bg-panel-2 p-4 text-xs shadow-2xl shadow-black/50">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-white">Owner statement</span>
            <span className="text-fg-muted">August 2026</span>
          </div>
          <dl className="mt-3 space-y-1.5 text-fg-muted">
            <div className="flex justify-between">
              <dt>Gross revenue</dt>
              <dd className="font-mono text-fg">12 480.00</dd>
            </div>
            <div className="flex justify-between">
              <dt>Management fee 20%</dt>
              <dd className="font-mono text-fg">-2 496.00</dd>
            </div>
            <div className="flex justify-between">
              <dt>Cleaning, repairs</dt>
              <dd className="font-mono text-fg">-640.00</dd>
            </div>
            <div className="flex justify-between border-t border-line pt-1.5 font-semibold text-white">
              <dt>Payout</dt>
              <dd className="font-mono text-mint">9 344.00</dd>
            </div>
          </dl>
          <p className="mt-3 rounded-md bg-mint/10 px-2 py-1 text-[11px] font-medium text-mint">
            Generated automatically. Zero edits.
          </p>
        </div>

        <div className="flex flex-col justify-between rounded-2xl border border-line bg-panel-2 p-4 text-xs shadow-xl">
          <div>
            <p className="font-semibold text-white">Turnover today</p>
            <p className="mt-1 text-fg-muted">
              6 checkouts, 4 same-day changeovers. <span className="text-mint">All assigned.</span>
            </p>
          </div>
          <ul className="mt-3 space-y-1.5 text-fg-muted">
            <li className="flex justify-between">
              <span>La Marsa 4B</span>
              <span className="text-fg">Amira · 11:00</span>
            </li>
            <li className="flex justify-between">
              <span>Sidi Bou Said Loft</span>
              <span className="text-fg">Karim · 12:30</span>
            </li>
            <li className="flex justify-between">
              <span>Bourguiba 12</span>
              <span className="text-fg">Amira · 14:00</span>
            </li>
          </ul>
          <p className="mt-3 rounded-md bg-sky/10 px-2 py-1 text-[11px] font-medium text-sky">
            Access codes sent to guests.
          </p>
        </div>
      </div>
    </div>
  );
}
