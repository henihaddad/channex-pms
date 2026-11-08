"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CalendarLabels } from "@/components/calendar-labels";
import {
  addDays,
  covers,
  fmt,
  heroPlan,
  HATCH,
  mondayIndex,
  type GridProperty,
  type Stay,
  type Values,
} from "@/components/calendar-shared";
import { money } from "@/lib/format";
import { loadStaysAction, saveNightNotesAction } from "@/app/(console)/calendar/calendar.actions";

const monthStart = (iso: string): string => `${iso.slice(0, 7)}-01`;
const monthEnd = (first: string): string => {
  const d = new Date(`${first}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  return d.toISOString().slice(0, 10);
};
const shiftMonth = (first: string, n: number): string => {
  const d = new Date(`${first}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
};

/**
 * One listing, one month (CAL-9, design "Calendar · phone"): a tile per night with its
 * price, booked nights dark, the selection teal. Tap a night and tap or swipe to another to
 * select the nights between; the sheet sets price, open or blocked, minimum stay and a note
 * and saves them in one press, through the same ARI path, undo and push as the strip.
 */
export function CalendarMonth({
  properties,
  propertyId: initialProperty,
  start,
  labels: L,
}: {
  properties: Array<{ id: string; title: string }>;
  propertyId?: string;
  start: string;
  /** How many price tips wait (none yet: the sheet then offers no tip). */
  tipsCount?: number;
  labels: CalendarLabels;
}) {
  const router = useRouter();
  const [pid, setPid] = useState(initialProperty ?? properties[0]?.id ?? "");
  const [first, setFirst] = useState(monthStart(start));
  const [property, setProperty] = useState<GridProperty | null>(null);
  const [stays, setStays] = useState<Stay[]>([]);
  const [sel, setSel] = useState<{ a: string; b: string; open: boolean } | null>(null);
  const [message, setMessage] = useState("");
  const [undoIds, setUndoIds] = useState<string[]>([]);
  const dragging = useRef<{ moved: boolean } | null>(null);
  const last = monthEnd(first);
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const load = useCallback(() => {
    if (!pid) return Promise.resolve();
    const q = new URLSearchParams({ from: first, to: last, propertyId: pid });
    return fetch(`/api/v1/ari/grid?${q.toString()}`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) {
          setMessage(fmt(L.loadFailed, { status: res.status }));
          return;
        }
        const body = (await res.json()) as { properties: GridProperty[] };
        setProperty(body.properties[0] ?? null);
        loadStaysAction({ from: first, to: last, propertyIds: [pid] })
          .then((r) => setStays(r.stays))
          .catch(() => setStays([]));
      })
      .catch(() => setMessage(fmt(L.loadFailed, { status: 0 })));
  }, [pid, first, last, L.loadFailed]);
  useEffect(() => {
    void load();
  }, [load]);

  const plan = property
    ? (heroPlan(property)?.plan ??
      property.roomTypes[0]?.ratePlans.find((rp) => rp.parentRatePlanId === null))
    : undefined;
  const rt = property
    ? (heroPlan(property)?.rt ?? property.roomTypes.find((r) => r.ratePlans.includes(plan!)))
    : undefined;
  const dates = useMemo(() => {
    const out: string[] = [];
    for (let d = first; d <= last; d = addDays(d, 1)) out.push(d);
    return out;
  }, [first, last]);
  const lo = sel ? (sel.a < sel.b ? sel.a : sel.b) : null;
  const hi = sel ? (sel.a < sel.b ? sel.b : sel.a) : null;
  const picked = lo && hi ? dates.filter((d) => d >= lo && d <= hi) : [];
  const cellOf = (d: string) => plan?.cells.find((c) => c[0] === d);
  const stayOn = (d: string) => stays.find((s) => (!rt || s.roomTypeId === rt.id) && covers(s, d));
  const soldOut = (d: string) => {
    const av = rt?.cells.find((c) => c[0] === d);
    return av !== undefined && av[1] <= 0;
  };

  const tileAt = (x: number, y: number): string | null =>
    (document.elementFromPoint(x, y)?.closest("[data-day]") as HTMLElement | null)?.dataset.day ??
    null;
  const down = (d: string, e: React.PointerEvent) => {
    if (e.button !== 0) return;
    dragging.current = { moved: false };
    if (sel?.open && sel.a === sel.b) setSel({ a: sel.a, b: d, open: false });
    else setSel({ a: d, b: d, open: true });
  };
  const move = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    const d = tileAt(e.clientX, e.clientY);
    if (d && sel && d !== sel.b) {
      dragging.current.moved = true;
      setSel({ a: sel.a, b: d, open: false });
    }
  };
  const up = () => {
    dragging.current = null;
  };

  const write = async (
    kind: "rates" | "restrictions",
    edits: Array<{ ratePlanId: string; date: string; values: Values }>,
  ): Promise<string | null | false> => {
    if (edits.length === 0) return null;
    const res = await fetch(`/api/v1/ari/${kind}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ propertyId: pid, edits }),
    });
    const body = (await res.json()) as { undoId?: string | null; detail?: string };
    if (!res.ok) {
      setMessage(body.detail ?? fmt(L.editFailed, { status: res.status }));
      return false;
    }
    return body.undoId ?? null;
  };

  const save = async (s: { rate?: number; values: Values; note: string | null }) => {
    if (!plan) return;
    const ids: string[] = [];
    const rate = s.rate;
    if (rate !== undefined) {
      const id = await write(
        "rates",
        picked.map((date) => ({ ratePlanId: plan.id, date, values: { rate } })),
      );
      if (id === false) return;
      if (id) ids.push(id);
    }
    if (Object.keys(s.values).length > 0) {
      const id = await write(
        "restrictions",
        picked.map((date) => ({ ratePlanId: plan.id, date, values: s.values })),
      );
      if (id === false) return;
      if (id) ids.push(id);
    }
    if (s.note !== null)
      await saveNightNotesAction({
        propertyId: pid,
        notes: picked.map((date) => ({ ratePlanId: plan.id, date, body: s.note! })),
      });
    setUndoIds(ids);
    setMessage(picked.length === 1 ? L.savedNight : fmt(L.savedNights, { n: picked.length }));
    setSel(null);
    await load();
  };
  const undo = async () => {
    for (const id of [...undoIds].reverse())
      await fetch(`/api/v1/ari/bulk/${id}/undo?propertyId=${encodeURIComponent(pid)}`, {
        method: "POST",
      });
    setUndoIds([]);
    setMessage(L.undone);
    await load();
  };

  const monthName = new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" }).format(
    new Date(`${first}T00:00:00Z`),
  );
  const lead = mondayIndex(first);
  const weekdays = L.weekdayShort.split(",");
  const currency = property?.currency ?? "EUR";

  return (
    <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,560px)_340px] lg:items-start lg:gap-5">
      <div className="flex flex-col gap-3" data-testid="calendar-month">
        <div className="flex items-center gap-2">
          <select
            aria-label={L.propertiesLabel}
            className="h-9 min-w-0 flex-1 rounded-full border border-border bg-surface px-3.5 text-[13px]"
            value={pid}
            onChange={(e) => {
              if (e.target.value === "__strip") {
                router.push("/calendar?view=strip");
                return;
              }
              setSel(null);
              setPid(e.target.value);
            }}
          >
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
            <option value="__strip">{L.allPropertiesStrip}</option>
          </select>
          <button
            type="button"
            aria-label={L.prevMonth}
            className="h-9 rounded-full border border-border bg-surface px-3 text-[13px] font-semibold"
            onClick={() => {
              setSel(null);
              setFirst((f) => shiftMonth(f, -1));
            }}
          >
            ‹
          </button>
          <strong className="w-9 text-center text-[13px]">{monthName}</strong>
          <button
            type="button"
            aria-label={L.nextMonth}
            className="h-9 rounded-full border border-border bg-surface px-3 text-[13px] font-semibold"
            onClick={() => {
              setSel(null);
              setFirst((f) => shiftMonth(f, 1));
            }}
          >
            ›
          </button>
        </div>
        <div
          className="grid grid-cols-7 gap-1 text-center text-[10px] text-muted"
          aria-hidden="true"
        >
          {weekdays.map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
        <div
          className="grid touch-none grid-cols-7 gap-1 select-none"
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          onPointerLeave={up}
          role="grid"
          aria-label={monthName}
        >
          {Array.from({ length: lead }, (_, i) => (
            <span key={`lead-${String(i)}`} />
          ))}
          {dates.map((d) => {
            const cell = cellOf(d);
            const stay = stayOn(d);
            const booked = !!stay || soldOut(d);
            const blocked = cell?.[1].stopSell === true;
            const isSel = lo !== null && hi !== null && d >= lo && d <= hi;
            const tone = isSel
              ? "bg-accent text-accent-foreground border-accent"
              : booked
                ? "bg-foreground text-background border-foreground"
                : "bg-surface border-default";
            const inner = (
              <>
                <span
                  className={`text-[13px] font-semibold ${d === today && !isSel && !booked ? "text-accent underline" : ""}`}
                >
                  {Number(d.slice(8))}
                </span>
                <span className="text-[9px] opacity-80">
                  {booked && !isSel ? "" : blocked ? L.blocked : money(cell?.[1].rate, currency)}
                </span>
              </>
            );
            const cls = `flex aspect-square flex-col items-center justify-center gap-0.5 rounded-[10px] border ${tone}`;
            return booked && stay && !isSel ? (
              <Link
                key={d}
                href={`/reservations/${stay.bookingId}`}
                className={cls}
                data-day={d}
                title={stay.guest}
              >
                {inner}
              </Link>
            ) : (
              <button
                key={d}
                type="button"
                className={cls}
                style={blocked && !isSel ? { backgroundImage: HATCH } : undefined}
                data-day={d}
                aria-pressed={isSel}
                onPointerDown={(e) => down(d, e)}
              >
                {inner}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted">{L.monthHint}</p>
        <Link
          href="/calendar?view=day"
          className="self-start text-xs font-semibold text-accent hover:underline"
        >
          {L.closeOutLink} →
        </Link>
      </div>
      {picked.length > 0 && plan && property ? (
        <MonthSheet
          key={`${lo!}-${hi!}`}
          L={L}
          property={property}
          planId={plan.id}
          dates={picked}
          currency={currency}
          cells={picked.map((d) => cellOf(d)?.[1] ?? {})}
          onClose={() => setSel(null)}
          onSave={save}
        />
      ) : null}
      {message ? (
        <div
          role="status"
          className="fixed bottom-4 left-1/2 z-50 inline-flex max-w-[calc(100vw-32px)] -translate-x-1/2 items-center gap-3 rounded-xl bg-foreground px-3.5 py-2.5 text-[13px] text-background shadow-float"
        >
          <span>{message}</span>
          {undoIds.length > 0 ? (
            <button type="button" className="font-bold text-teal-300" onClick={() => void undo()}>
              {L.undo}
            </button>
          ) : null}
          <button
            type="button"
            aria-label={L.dismiss}
            className="text-background/60"
            onClick={() => setMessage("")}
          >
            ✕
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** The bottom sheet (design): dates and nights, price, open or block, minimum stay and note, save. */
function MonthSheet({
  L,
  property,
  planId,
  dates,
  currency,
  cells,
  onClose,
  onSave,
}: {
  L: CalendarLabels;
  property: GridProperty;
  planId: string;
  dates: string[];
  currency: string;
  cells: Values[];
  onClose: () => void;
  onSave: (s: { rate?: number; values: Values; note: string | null }) => Promise<void>;
}) {
  const same = <K extends keyof Values>(k: K) =>
    cells.every((c) => c[k] === cells[0]?.[k]) ? cells[0]?.[k] : undefined;
  const rate0 = same("rate");
  const blocked0 = same("stopSell") === true;
  const min0 = same("minStay");
  const notes = dates.map((d) => property.notes[`${planId}|${d}`] ?? "");
  const note0 = notes.every((n) => n === notes[0]) ? (notes[0] ?? "") : "";
  const [price, setPrice] = useState(rate0 !== undefined ? String(rate0 / 100) : "");
  const [blocked, setBlocked] = useState(blocked0);
  const [more, setMore] = useState(false);
  const [min, setMin] = useState(min0 !== undefined ? String(min0) : "");
  const [note, setNote] = useState(note0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const symbol = money(0, currency).replace(/[\d.,\s−-]/g, "") || currency;
  const label = (iso: string, withMonth: boolean) =>
    new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      ...(withMonth ? { month: "short" } : {}),
      timeZone: "UTC",
    }).format(new Date(`${iso}T00:00:00Z`));
  const range =
    dates.length === 1
      ? label(dates[0]!, true)
      : `${label(dates[0]!, false)}–${label(dates.at(-1)!, true)}`;
  const n = dates.length;

  const save = async () => {
    const r = price.trim() === "" ? undefined : Math.round(Number(price) * 100);
    if (r !== undefined && (!Number.isFinite(r) || r < 0)) {
      setError(L.invalidPrice);
      return;
    }
    const m = Number(min);
    if (min !== (min0 !== undefined ? String(min0) : "") && (!Number.isInteger(m) || m < 1)) {
      setError(L.invalidStay);
      return;
    }
    setBusy(true);
    const values: Values = {};
    if (blocked !== blocked0) values.stopSell = blocked;
    if (min !== (min0 !== undefined ? String(min0) : "")) values.minStay = m;
    await onSave({
      rate: r !== undefined && r !== rate0 ? r : undefined,
      values,
      note: note !== note0 ? note : null,
    });
    setBusy(false);
  };

  return (
    <section
      className="fixed inset-x-0 bottom-0 z-40 flex flex-col gap-2.5 rounded-t-[20px] bg-surface px-4 pt-2.5 pb-7 shadow-[0_-12px_32px_rgba(20,23,22,.12)] lg:static lg:rounded-card lg:border lg:border-border lg:pb-5 lg:shadow-none"
      data-testid="month-sheet"
      aria-label={range}
    >
      <span className="h-1 w-9 self-center rounded-full bg-border lg:hidden" aria-hidden="true" />
      <div className="flex items-baseline justify-between">
        <strong className="text-[15px]">
          {range} · {n === 1 ? L.night : fmt(L.nights, { n })}
        </strong>
        <button type="button" className="text-xs text-muted" onClick={onClose}>
          {L.close}
        </button>
      </div>
      <label className="flex items-center overflow-hidden rounded-xl border border-border focus-within:ring-2 focus-within:ring-accent">
        <span className="px-3 text-muted">{symbol}</span>
        <input
          inputMode="decimal"
          aria-label={L.pricePerNight}
          className="h-[46px] min-w-0 flex-1 bg-transparent text-xl font-bold outline-none"
          value={price}
          placeholder={rate0 === undefined ? L.mixed : ""}
          onChange={(e) => setPrice(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void save();
          }}
        />
      </label>
      <div className="flex gap-1.5">
        <button
          type="button"
          aria-pressed={!blocked}
          onClick={() => setBlocked(false)}
          className={`flex-1 rounded-[10px] py-[11px] text-[13px] font-semibold ${!blocked ? "bg-foreground text-background" : "border border-border text-muted"}`}
        >
          {L.open}
        </button>
        <button
          type="button"
          aria-pressed={blocked}
          onClick={() => setBlocked(true)}
          className={`flex-1 rounded-[10px] py-[11px] text-[13px] font-semibold ${blocked ? "bg-foreground text-background" : "border border-border text-muted"}`}
        >
          {L.block}
        </button>
        <button
          type="button"
          aria-expanded={more}
          onClick={() => setMore((v) => !v)}
          className={`flex-1 rounded-[10px] py-[11px] text-[13px] font-semibold ${more ? "bg-default text-foreground" : "border border-border text-muted"}`}
        >
          {L.minStayNote}
        </button>
      </div>
      {more ? (
        <div className="grid grid-cols-[96px_1fr] gap-2">
          <input
            inputMode="numeric"
            aria-label={L.minNights}
            placeholder={L.minNights}
            className="h-10 rounded-[10px] border border-border bg-surface text-center font-semibold"
            value={min}
            onChange={(e) => setMin(e.target.value)}
          />
          <input
            aria-label={L.privateNote}
            placeholder={L.privateNotePlaceholder}
            className="h-10 rounded-[10px] border border-border bg-surface px-3 text-[13px]"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
          />
        </div>
      ) : null}
      {error ? <p className="text-xs text-danger">{error}</p> : null}
      <button
        type="button"
        disabled={busy}
        onClick={() => void save()}
        className="h-12 rounded-full bg-accent text-[15px] font-bold text-accent-foreground disabled:opacity-60"
        data-testid="month-save"
      >
        {n === 1 ? L.saveNight : fmt(L.saveNights, { n })}
      </button>
    </section>
  );
}
