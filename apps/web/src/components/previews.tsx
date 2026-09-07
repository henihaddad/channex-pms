import type { ReactNode } from "react";

/**
 * Sketches of a feature in use, shown beside an empty page so a new account can
 * see what the page will look like. Static markup, no data, never announced to
 * screen readers (the empty state's own text carries the meaning).
 */
const frame = (children: ReactNode) => (
  <div className="flex flex-col gap-2 text-[0.7rem] leading-tight">{children}</div>
);
const bar = (w: string, cls = "bg-default") => (
  <span className={`inline-block h-2 rounded-full ${cls}`} style={{ width: w }} />
);

export function CalendarPreview() {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return frame(
    <>
      <div className="grid grid-cols-8 gap-1 text-muted">
        <span />
        {days.map((d) => (
          <span key={d} className="text-center">
            {d}
          </span>
        ))}
      </div>
      {[
        { name: "Alfama Loft", start: 1, span: 3, tone: "bg-accent/70" },
        { name: "Sea Point 32", start: 4, span: 2, tone: "bg-success/60" },
        { name: "Garden Studio", start: 2, span: 4, tone: "bg-warning/60" },
      ].map((row) => (
        <div key={row.name} className="grid grid-cols-8 items-center gap-1">
          <span className="truncate text-muted">{row.name}</span>
          {Array.from({ length: 7 }, (_, i) => (
            <span
              key={i}
              className={`h-5 rounded ${i >= row.start && i < row.start + row.span ? row.tone : "bg-default/60"}`}
            />
          ))}
        </div>
      ))}
    </>,
  );
}

export function InboxPreview() {
  return frame(
    <>
      {[
        { who: "Ana", ch: "Airbnb", txt: "Is early check-in possible?" },
        { who: "Tom", ch: "Booking.com", txt: "We land at 22:00, is that ok?" },
        { who: "Lea", ch: "Direct", txt: "Thank you, it was lovely!" },
      ].map((m) => (
        <div key={m.who} className="rounded-xl bg-surface p-2 shadow-surface">
          <p className="flex items-center justify-between font-medium text-foreground">
            {m.who}
            <span className="text-muted">{m.ch}</span>
          </p>
          <p className="mt-1 text-muted">{m.txt}</p>
        </div>
      ))}
    </>,
  );
}

export function PropertiesPreview() {
  return frame(
    <div className="grid grid-cols-2 gap-2">
      {["Alfama Loft", "Sea Point 32"].map((t) => (
        <div key={t} className="overflow-hidden rounded-xl bg-surface shadow-surface">
          <div className="h-12 bg-gradient-to-br from-accent/40 to-success/30" />
          <div className="p-2">
            <p className="font-medium text-foreground">{t}</p>
            <p className="mt-1 flex gap-1">
              {bar("30%", "bg-accent/60")}
              {bar("20%", "bg-success/60")}
            </p>
          </div>
        </div>
      ))}
    </div>,
  );
}

export function ChannelsPreview() {
  return frame(
    <>
      {[
        { name: "Airbnb", state: "Active", tone: "bg-success/60" },
        { name: "Booking.com", state: "Active", tone: "bg-success/60" },
        { name: "Your own site", state: "Active", tone: "bg-accent/60" },
      ].map((c) => (
        <div
          key={c.name}
          className="flex items-center justify-between rounded-xl bg-surface p-2 shadow-surface"
        >
          <span className="font-medium text-foreground">{c.name}</span>
          <span className="flex items-center gap-1.5 text-muted">
            <span className={`h-2 w-2 rounded-full ${c.tone}`} />
            {c.state}
          </span>
        </div>
      ))}
    </>,
  );
}

export function ReportsPreview() {
  const bars = [40, 65, 55, 80, 70, 95];
  return frame(
    <>
      <div className="flex h-20 items-end gap-1.5">
        {bars.map((h, i) => (
          <span key={i} className="flex-1 rounded-t bg-accent/60" style={{ height: `${h}%` }} />
        ))}
      </div>
      <div className="mt-1 grid grid-cols-3 gap-2">
        {["Occupancy", "ADR", "RevPAR"].map((k) => (
          <div key={k} className="rounded-lg bg-surface p-2 shadow-surface">
            <p className="text-muted">{k}</p>
            {bar("60%")}
          </div>
        ))}
      </div>
    </>,
  );
}

export function OperationsPreview() {
  return frame(
    <>
      {[
        { t: "Check-out cleaning · Alfama Loft", d: "11:00 · Amira" },
        { t: "Inspection · Sea Point 32", d: "13:30 · Karim" },
        { t: "Change AC filter", d: "Thursday" },
      ].map((x) => (
        <div key={x.t} className="rounded-xl bg-surface p-2 shadow-surface">
          <p className="font-medium text-foreground">{x.t}</p>
          <p className="mt-0.5 text-muted">{x.d}</p>
        </div>
      ))}
    </>,
  );
}

export function OwnersPreview() {
  return frame(
    <div className="rounded-xl bg-surface p-3 shadow-surface">
      <p className="font-medium text-foreground">August statement</p>
      {[
        ["Gross revenue", "12 480.00"],
        ["Management fee 20%", "-2 496.00"],
        ["Cleaning, repairs", "-640.00"],
      ].map(([k, v]) => (
        <p key={k} className="mt-1 flex justify-between text-muted">
          <span>{k}</span>
          <span className="tabular-nums">{v}</span>
        </p>
      ))}
      <p className="mt-2 flex justify-between border-t border-border pt-1 font-medium text-foreground">
        <span>Payout</span>
        <span className="tabular-nums">9 344.00</span>
      </p>
    </div>,
  );
}
