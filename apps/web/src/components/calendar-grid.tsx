"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useRouter } from "next/navigation";
import { guestPrice, Money } from "@pms/core";
import { type CalendarLabels } from "@/components/calendar-labels";
import {
  addDays,
  covers,
  fmt,
  heroPlan,
  HATCH,
  Kbd,
  ListingThumb,
  mondayIndex,
  rich,
  type Block,
  type GridProperty,
  type GridRatePlan,
  type GridRoomType,
  type RateCell,
  type Stay,
  type SyncState,
  type Values,
} from "@/components/calendar-shared";
import { channelColour, channelInk, channelName, channelNameOf } from "@/lib/channels";
import { money as moneyText } from "@/lib/format";
import { loadStaysAction, saveNightNotesAction } from "@/app/(console)/calendar/calendar.actions";

type Row =
  | { kind: "property"; key: string; property: GridProperty }
  | { kind: "room_type"; key: string; property: GridProperty; roomType: GridRoomType }
  | {
      kind: "rate_plan";
      key: string;
      property: GridProperty;
      roomType: GridRoomType;
      ratePlan: GridRatePlan;
      derived: boolean;
      /** A listing with one room type and one base plan is one row: the plan row carries the listing. */
      hero: boolean;
    };
type PlanRow = Extract<Row, { kind: "rate_plan" }>;
type Rect = { r1: number; r2: number; c1: number; c2: number };
type Target = { property: GridProperty; ratePlan: GridRatePlan; cell: RateCell };

const HEADER_H = 50;
const LABEL_W = 260;
const MIN_COL_W = 64;
const ROW_H: Record<Row["kind"], number> = { property: 52, room_type: 34, rate_plan: 44 };
const rowHeight = (row: Row | undefined): number =>
  row?.kind === "rate_plan" && row.hero ? 54 : ROW_H[row?.kind ?? "rate_plan"];
const DOT: Record<SyncState, string> = {
  pending: "bg-muted",
  in_flight: "bg-sky-500",
  synced: "bg-success",
  failed: "bg-danger",
  conflicted: "bg-warning",
};
const isWeekend = (iso: string): boolean => mondayIndex(iso) >= 4 && mondayIndex(iso) <= 5;

/** A field has the keyboard: the calendar's letter keys stay out of its way. */
const typing = (e: KeyboardEvent | React.KeyboardEvent): boolean => {
  const t = e.target as HTMLElement | null;
  return !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
};

/**
 * Portfolio calendar, strip view (spec 06 §6.2): listings down, nights across, bookings as
 * bars in their channel's colour. Click a night or drag across nights (⌘-click adds another
 * range) and the panel under the strip edits price, open or blocked, stay limits, check-in
 * days and a private note, saved in one press. Keyboard-first (CAL-1), optimistic with a
 * sync dot per night (CAL-3), server-backed undo (CAL-4), conflicts show both values (CAL-5),
 * states resolve over SSE.
 */
export function CalendarGrid({
  start: initialStart,
  days: initialDays,
  propertyId,
  groups,
  properties: allProperties,
  tips,
  viewSwitch,
  labels: L,
}: {
  start: string;
  days: number;
  propertyId?: string;
  groups: Array<{ id: string; name: string }>;
  properties: Array<{ id: string; title: string }>;
  tips: Array<{ propertyId: string | null; title: string; link: string }>;
  viewSwitch: ReactNode;
  labels: CalendarLabels;
}) {
  const [start, setStart] = useState(initialStart);
  const [days, setDays] = useState(initialDays);
  const [groupId, setGroupId] = useState<string>("");
  const [data, setData] = useState<GridProperty[]>([]);
  const [stays, setStays] = useState<{ stays: Stay[]; blocks: Block[] }>({ stays: [], blocks: [] });
  const [loadMs, setLoadMs] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [focus, setFocus] = useState<{ r: number; c: number } | null>(null);
  const [anchor, setAnchor] = useState<{ r: number; c: number } | null>(null);
  const [extra, setExtra] = useState<Rect[]>([]);
  const [editing, setEditing] = useState<string>("");
  const [isEditing, setIsEditing] = useState(false);
  const [message, setMessage] = useState<string>("");
  const [conflict, setConflict] = useState<{
    ratePlanId: string;
    date: string;
    mine: Values;
    theirs: Values;
    version: number;
  } | null>(null);
  const [undoStack, setUndoStack] = useState<Array<Array<{ id: string; propertyId: string }>>>([]);
  const [bulk, setBulk] = useState<{
    preview?: { cellCount: number; warnings: string[]; blocked: string[] };
    /** The operation the preview was computed for; Apply re-runs exactly it (BULK-1). */
    ops?: unknown[];
  }>({});
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [hover, setHover] = useState<{ r: number; c: number; x: number; y: number } | null>(null);
  const [tipsOpen, setTipsOpen] = useState(tips.length > 0);
  const [clip, setClip] = useState<number | null>(null);
  const [width, setWidth] = useState(1100);
  const [maxH, setMaxH] = useState(640);
  const dragging = useRef(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const parentRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const dates = useMemo(
    () => Array.from({ length: days }, (_, i) => addDays(start, i)),
    [start, days],
  );
  const end = dates[dates.length - 1] ?? start;
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const colW = Math.max(MIN_COL_W, Math.floor((width - LABEL_W - 2) / days));

  // the strip fills the width it is given; the page never scrolls sideways on 14 nights
  useLayoutEffect(() => {
    const el = parentRef.current;
    if (!el) return;
    const measure = () => {
      setWidth(el.clientWidth);
      setMaxH(Math.max(320, Math.round(window.innerHeight * 0.72)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const load = useCallback(async () => {
    const t0 = performance.now();
    const q = new URLSearchParams({ from: start, to: end });
    if (propertyId) q.set("propertyId", propertyId);
    if (groupId) q.set("groupId", groupId);
    const res = await fetch(`/api/v1/ari/grid?${q.toString()}`, { cache: "no-store" });
    if (!res.ok) {
      setMessage(fmt(L.loadFailed, { status: res.status }));
      return;
    }
    const body = (await res.json()) as { properties: GridProperty[] };
    setData(body.properties);
    setLoadMs(Math.round(performance.now() - t0));
    // the bars need booking:read; without it the strip still shows prices and availability
    loadStaysAction({ from: start, to: end, propertyIds: body.properties.map((p) => p.id) })
      .then(setStays)
      .catch(() => setStays({ stays: [], blocks: [] }));
  }, [start, end, propertyId, groupId, L.loadFailed]);
  useEffect(() => {
    void load();
  }, [load]);

  // a drag ends wherever the mouse goes up
  useEffect(() => {
    const up = () => {
      dragging.current = false;
    };
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  }, []);

  // the right-click menu closes on a press outside it, a scroll or a resize
  useEffect(() => {
    if (!menu) return;
    const press = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(null);
    };
    const close = () => setMenu(null);
    const scroller = parentRef.current;
    const sx = scroller?.scrollLeft ?? 0;
    const sy = scroller?.scrollTop ?? 0;
    const onScroll = () => {
      if (!scroller) return;
      if (Math.abs(scroller.scrollLeft - sx) > 4 || Math.abs(scroller.scrollTop - sy) > 4) close();
    };
    window.addEventListener("pointerdown", press);
    window.addEventListener("resize", close);
    scroller?.addEventListener("scroll", onScroll);
    return () => {
      window.removeEventListener("pointerdown", press);
      window.removeEventListener("resize", close);
      scroller?.removeEventListener("scroll", onScroll);
    };
  }, [menu]);

  // realtime: cell states resolve over SSE (CAL-3)
  useEffect(() => {
    if (data.length === 0) return;
    const q = new URLSearchParams();
    for (const p of data) q.append("propertyId", p.id);
    const es = new EventSource(`/api/v1/ari/events?${q.toString()}`);
    es.addEventListener("cells", (ev) => {
      const changes = JSON.parse((ev as MessageEvent<string>).data) as Array<{
        kind: "rate" | "availability";
        id: string;
        date: string;
        state: SyncState;
        version: number;
        value: unknown;
      }>;
      setData((prev) =>
        prev.map((p) => ({
          ...p,
          roomTypes: p.roomTypes.map((rt) => ({
            ...rt,
            cells: rt.cells.map((c) => {
              const ch = changes.find(
                (x) => x.kind === "availability" && x.id === rt.id && x.date === c[0],
              );
              return ch ? [c[0], Number(ch.value), ch.state, ch.version] : c;
            }),
            ratePlans: rt.ratePlans.map((rp) => ({
              ...rp,
              cells: rp.cells.map((c) => {
                const ch = changes.find(
                  (x) => x.kind === "rate" && x.id === rp.id && x.date === c[0],
                );
                return ch ? [c[0], ch.value as Values, ch.state, ch.version] : c;
              }),
            })),
          })),
        })),
      );
    });
    return () => es.close();
  }, [data.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (const p of data) {
      const hero = heroPlan(p);
      if (hero) {
        out.push({
          kind: "rate_plan",
          key: hero.plan.id,
          property: p,
          roomType: hero.rt,
          ratePlan: hero.plan,
          derived: false,
          hero: true,
        });
        if (expanded.has(p.id))
          for (const rp of hero.rt.ratePlans)
            if (rp.parentRatePlanId !== null)
              out.push({
                kind: "rate_plan",
                key: rp.id,
                property: p,
                roomType: hero.rt,
                ratePlan: rp,
                derived: true,
                hero: false,
              });
        continue;
      }
      out.push({ kind: "property", key: p.id, property: p });
      if (collapsed.has(p.id)) continue;
      for (const rt of p.roomTypes) {
        out.push({ kind: "room_type", key: rt.id, property: p, roomType: rt });
        if (collapsed.has(rt.id)) continue;
        for (const rp of rt.ratePlans)
          out.push({
            kind: "rate_plan",
            key: rp.id,
            property: p,
            roomType: rt,
            ratePlan: rp,
            derived: rp.parentRatePlanId !== null,
            hero: false,
          });
      }
    }
    return out;
  }, [data, collapsed, expanded]);

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (i) => rowHeight(rows[i]),
    getItemKey: (i) => rows[i]?.key ?? i,
    overscan: 8,
  });
  const colVirtualizer = useVirtualizer({
    horizontal: true,
    count: dates.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => colW,
    overscan: 4,
  });
  useEffect(() => {
    colVirtualizer.measure();
  }, [colW, colVirtualizer]);

  const cellAt = (row: Row, c: number): RateCell | undefined =>
    row.kind === "rate_plan" ? row.ratePlan.cells.find((x) => x[0] === dates[c]) : undefined;
  const current = useMemo<Rect | null>(() => {
    if (!focus) return null;
    const a = anchor ?? focus;
    return {
      r1: Math.min(a.r, focus.r),
      r2: Math.max(a.r, focus.r),
      c1: Math.min(a.c, focus.c),
      c2: Math.max(a.c, focus.c),
    };
  }, [focus, anchor]);
  const rects = useMemo(() => (current ? [...extra, current] : extra), [current, extra]);
  const inRects = (r: number, c: number): boolean =>
    rects.some((s) => r >= s.r1 && r <= s.r2 && c >= s.c1 && c <= s.c2);
  const selected = useMemo(() => {
    const out: Array<{ row: PlanRow; cell: RateCell }> = [];
    const seen = new Set<string>();
    for (const sel of rects)
      for (let r = sel.r1; r <= sel.r2; r++) {
        const row = rows[r];
        if (!row || row.kind !== "rate_plan" || row.derived) continue;
        for (let c = sel.c1; c <= sel.c2; c++) {
          const cell = row.ratePlan.cells.find((x) => x[0] === dates[c]);
          const k = `${row.ratePlan.id}|${String(c)}`;
          if (cell && !seen.has(k)) {
            seen.add(k);
            out.push({ row, cell });
          }
        }
      }
    return out;
  }, [rects, rows, dates]);
  const selectedPlans = useMemo(() => {
    const seen = new Map<string, PlanRow>();
    for (const t of selected) seen.set(t.row.ratePlan.id, t.row);
    return [...seen.values()];
  }, [selected]);
  const selectedDates = useMemo(() => {
    const s = new Set<string>();
    for (const sel of rects) for (let c = sel.c1; c <= sel.c2; c++) s.add(dates[c]!);
    return [...s].sort();
  }, [rects, dates]);
  const derivedOnly = useMemo(() => {
    if (rects.length === 0 || selected.length > 0) return false;
    return rects.some((sel) => {
      for (let r = sel.r1; r <= sel.r2; r++) if (rows[r]?.kind === "rate_plan") return true;
      return false;
    });
  }, [rects, selected.length, rows]);

  const staysByRoomType = useMemo(() => {
    const m = new Map<string, Stay[]>();
    for (const s of stays.stays)
      if (s.roomTypeId) m.set(s.roomTypeId, [...(m.get(s.roomTypeId) ?? []), s]);
    return m;
  }, [stays]);
  const blocksByRoomType = useMemo(() => {
    const m = new Map<string, Block[]>();
    for (const b of stays.blocks) m.set(b.roomTypeId, [...(m.get(b.roomTypeId) ?? []), b]);
    return m;
  }, [stays]);

  const patchLocal = (
    ratePlanId: string,
    date: string,
    values: Values,
    state: SyncState,
    version?: number,
  ) =>
    setData((prev) =>
      prev.map((p) => ({
        ...p,
        roomTypes: p.roomTypes.map((rt) => ({
          ...rt,
          ratePlans: rt.ratePlans.map((rp) =>
            rp.id !== ratePlanId
              ? rp
              : {
                  ...rp,
                  cells: rp.cells.map((c) =>
                    c[0] !== date ? c : [c[0], { ...c[1], ...values }, state, version ?? c[3]],
                  ),
                },
          ),
        })),
      })),
    );

  /** One PATCH per property; returns the undo id, or null when nothing was written. */
  const submitEdits = async (
    kind: "rates" | "restrictions",
    pid: string,
    edits: Array<{ ratePlanId: string; date: string; values: Values; expectedVersion?: number }>,
  ): Promise<string | null | false> => {
    for (const e of edits) patchLocal(e.ratePlanId, e.date, e.values, "pending");
    const res = await fetch(`/api/v1/ari/${kind}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ propertyId: pid, edits }),
    });
    const body = (await res.json()) as {
      outcomes?: Array<{
        ok: boolean;
        ratePlanId: string;
        date: string;
        version?: number;
        reason?: string;
        current?: { values: Values; version: number };
      }>;
      undoId?: string | null;
      detail?: string;
    };
    if (res.status === 409 && body.outcomes) {
      const c = body.outcomes.find((o) => !o.ok && o.current);
      const mine = edits.find((e) => e.ratePlanId === c?.ratePlanId && e.date === c?.date);
      if (c?.current && mine) {
        patchLocal(c.ratePlanId, c.date, c.current.values, "synced", c.current.version);
        setConflict({
          ratePlanId: c.ratePlanId,
          date: c.date,
          mine: mine.values,
          theirs: c.current.values,
          version: c.current.version,
        });
      }
      return false;
    }
    if (!res.ok) {
      setMessage(body.detail ?? fmt(L.editFailed, { status: res.status }));
      await load();
      return false;
    }
    for (const o of body.outcomes ?? [])
      if (o.ok && o.version) patchLocal(o.ratePlanId, o.date, {}, "pending", o.version);
    return body.undoId ?? null;
  };

  const channelsOf = (props: GridProperty[]): string[] => {
    const set = new Set<string>();
    for (const p of props) for (const c of p.channels) if (c !== "direct") set.add(c);
    return [...set].map((c) => channelNameOf(c as "airbnb"));
  };
  const joinList = (xs: string[]): string =>
    xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")}${L.and}${xs.at(-1)!}`;
  const savedMessage = (nights: number, props: GridProperty[]): string => {
    const head = nights === 1 ? L.savedNight : fmt(L.savedNights, { n: nights });
    const chans = channelsOf(props);
    return chans.length > 0 ? `${head} · ${fmt(L.sentTo, { channels: joinList(chans) })}` : head;
  };

  /**
   * Write edits grouped by property and kind; one undo entry covers the whole save, so
   * ⌘Z puts back everything a press of Save changed.
   */
  const writeTargets = async (
    list: Array<{ t: Target; kind: "rates" | "restrictions"; values: Values }>,
  ): Promise<boolean> => {
    const groupsBy = new Map<
      string,
      Array<{ ratePlanId: string; date: string; values: Values; expectedVersion?: number }>
    >();
    for (const { t, kind, values } of list) {
      const k = `${kind}|${t.property.id}`;
      groupsBy.set(k, [
        ...(groupsBy.get(k) ?? []),
        { ratePlanId: t.ratePlan.id, date: t.cell[0], values, expectedVersion: t.cell[3] },
      ]);
    }
    const ids: Array<{ id: string; propertyId: string }> = [];
    // rates first; a night whose rate this save just wrote has a new version, so its
    // restriction edit goes without the stale one rather than tripping over ourselves
    const bumped = new Set<string>();
    for (const [k, edits] of [...groupsBy.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
      const [kind, pid] = k.split("|") as ["rates" | "restrictions", string];
      const fresh = edits.map((e) =>
        kind === "restrictions" && bumped.has(`${e.ratePlanId}|${e.date}`)
          ? { ratePlanId: e.ratePlanId, date: e.date, values: e.values }
          : e,
      );
      if (kind === "rates") for (const e of edits) bumped.add(`${e.ratePlanId}|${e.date}`);
      const id = await submitEdits(kind, pid, fresh);
      if (id === false) return false;
      if (id) ids.push({ id, propertyId: pid });
    }
    if (ids.length > 0) setUndoStack((s) => [...s, ids]);
    return true;
  };

  /** Write the same values to every selected night (keys, menu, paste). */
  const writeSelection = async (kind: "rates" | "restrictions", values: Values) => {
    const ok = await writeTargets(
      selected.map(({ row, cell }) => ({
        t: { property: row.property, ratePlan: row.ratePlan, cell },
        kind,
        values,
      })),
    );
    if (ok)
      setMessage(
        savedMessage(new Set(selected.map((s) => s.cell[0])).size, [
          ...new Set(selected.map((s) => s.row.property)),
        ]),
      );
  };

  const commitEdit = async () => {
    if (!focus || !isEditing) return;
    const row = rows[focus.r];
    const cell = row ? cellAt(row, focus.c) : undefined;
    setIsEditing(false);
    if (!row || row.kind !== "rate_plan" || !cell) return;
    const n = Math.round(Number(editing) * 100);
    if (!Number.isFinite(n) || n < 0) return;
    if (selected.length > 1) await writeSelection("rates", { rate: n });
    else {
      const ok = await writeTargets([
        {
          t: { property: row.property, ratePlan: row.ratePlan, cell },
          kind: "rates",
          values: { rate: n },
        },
      ]);
      if (ok) setMessage(savedMessage(1, [row.property]));
    }
  };

  const undo = async () => {
    const last = undoStack[undoStack.length - 1];
    if (!last) return;
    for (const u of [...last].reverse()) {
      const res = await fetch(
        `/api/v1/ari/bulk/${u.id}/undo?propertyId=${encodeURIComponent(u.propertyId)}`,
        { method: "POST" },
      );
      if (!res.ok) {
        setMessage(fmt(L.editFailed, { status: res.status }));
        return;
      }
    }
    setUndoStack((s) => s.slice(0, -1));
    setMessage(L.undone);
    await load();
  };

  /** A percentage change goes through the bulk operation: preview first (BULK-1), then apply. */
  const runBulk = async (dryRun: boolean, ops: unknown[]) => {
    if (!current || selectedPlans.length === 0) return;
    const pid = selectedPlans[0]!.property.id;
    const body = {
      propertyId: pid,
      dateFrom: dates[current.c1],
      dateTo: dates[current.c2],
      ratePlanIds: selectedPlans.filter((p) => p.property.id === pid).map((p) => p.ratePlan.id),
      ops,
      horizonEnd: addDays(start, 730),
      dryRun,
    };
    const res = await fetch("/api/v1/ari/bulk", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const r = (await res.json()) as {
      cellCount: number;
      warnings: string[];
      blocked: string[];
      applied: boolean;
      id: string | null;
      detail?: string;
    };
    if (!res.ok && !r.blocked) {
      setMessage(r.detail ?? fmt(L.editFailed, { status: res.status }));
      return;
    }
    if (dryRun || !r.applied) setBulk({ preview: r, ops });
    else {
      setBulk({});
      if (r.id) setUndoStack((s) => [...s, [{ id: r.id!, propertyId: pid }]]);
      setMessage(fmt(L.applied, { n: r.cellCount }));
      await load();
    }
  };

  const clearSelection = () => {
    setFocus(null);
    setAnchor(null);
    setExtra([]);
    setBulk({});
  };
  const todayIndex = dates.indexOf(today);
  /** "T" and the Today button: tonight in view, or the strip moved to start today. */
  const goToday = () => {
    if (todayIndex < 0) {
      clearSelection();
      setStart(today);
      return;
    }
    colVirtualizer.scrollToIndex(todayIndex, { align: "start" });
    if (focus) {
      setFocus({ r: focus.r, c: todayIndex });
      setAnchor(null);
    }
  };
  const shiftWeek = (dir: 1 | -1) => {
    clearSelection();
    setStart((s) => addDays(s, 7 * dir));
  };
  const focusProperty = (): string | undefined =>
    selectedPlans[0]?.property.id ??
    (current ? rows[current.r1]?.property.id : undefined) ??
    propertyId ??
    data[0]?.id;
  const goYear = () => {
    const pid = focusProperty();
    router.push(`/calendar?view=year${pid ? `&propertyId=${pid}` : ""}`);
  };
  /** "R" and the menu: a staff booking on the selected listing and nights, dates filled in. */
  const newReservationHere = () => {
    if (!current) return;
    const property = selectedPlans[0]?.property ?? rows[current.r1]?.property;
    const q = new URLSearchParams({
      arrivalDate: dates[current.c1]!,
      departureDate: addDays(dates[current.c2]!, 1),
    });
    if (property) q.set("propertyId", property.id);
    router.push(`/reservations/new?${q.toString()}`);
  };
  const focusPanel = (id: string) => {
    setMenu(null);
    requestAnimationFrame(() => document.getElementById(id)?.focus());
  };
  const copyPrice = () => {
    const row = focus ? rows[focus.r] : undefined;
    const rate = row && focus ? cellAt(row, focus.c)?.[1].rate : undefined;
    if (rate === undefined) return;
    setClip(rate);
    void navigator.clipboard?.writeText(String(rate / 100)).catch(() => undefined);
    setMessage(fmt(L.copied, { price: moneyText(rate, row!.property.currency) }));
  };
  const pastePrice = () => {
    if (clip !== null && selected.length > 0) void writeSelection("rates", { rate: clip });
  };
  const openMenu = (e: React.MouseEvent, r: number, c: number) => {
    e.preventDefault();
    if (!inRects(r, c)) {
      setExtra([]);
      setFocus({ r, c });
      setAnchor({ r, c });
    }
    setIsEditing(false);
    setHover(null);
    setMenu({ x: e.clientX, y: e.clientY });
    parentRef.current?.focus({ preventScroll: true });
  };
  const selectRow = (r: number) => {
    setExtra([]);
    setAnchor({ r, c: 0 });
    setFocus({ r, c: dates.length - 1 });
    parentRef.current?.focus({ preventScroll: true });
  };
  const selectColumn = (c: number) => {
    setExtra([]);
    setAnchor({ r: 0, c });
    setFocus({ r: rows.length - 1, c });
    parentRef.current?.focus({ preventScroll: true });
  };

  // keys that work with no night focused: ← → a week, T today, 1–4 the range, Y the year
  const winKeys = useRef<(e: KeyboardEvent) => void>(() => undefined);
  winKeys.current = (e: KeyboardEvent) => {
    if (e.defaultPrevented || typing(e) || e.metaKey || e.ctrlKey || e.altKey) return;
    if (focus && parentRef.current?.contains(document.activeElement)) return;
    const k = e.key.toLowerCase();
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      shiftWeek(e.key === "ArrowLeft" ? -1 : 1);
    } else if (k === "t") {
      e.preventDefault();
      goToday();
    } else if (/^[1-4]$/.test(e.key)) {
      e.preventDefault();
      setDays([14, 30, 60, 90][Number(e.key) - 1]!);
    } else if (k === "y") {
      e.preventDefault();
      goYear();
    }
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => winKeys.current(e);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const onKeyDown = async (e: React.KeyboardEvent) => {
    if (typing(e) && !isEditing) return;
    const handled = () => {
      e.preventDefault();
      e.stopPropagation();
    };
    const plain = !e.metaKey && !e.ctrlKey && !e.altKey;
    if (!isEditing && plain && e.key.toLowerCase() === "t") {
      handled();
      goToday();
      return;
    }
    if (!isEditing && plain && e.key.toLowerCase() === "y") {
      handled();
      goYear();
      return;
    }
    if (!focus) {
      if (plain && /^[1-4]$/.test(e.key)) {
        handled();
        setDays([14, 30, 60, 90][Number(e.key) - 1]!);
      } else if (plain && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
        handled();
        shiftWeek(e.key === "ArrowLeft" ? -1 : 1);
      }
      return;
    }
    const move = (dr: number, dc: number) => {
      const r = Math.max(0, Math.min(rows.length - 1, focus.r + dr));
      const c = Math.max(0, Math.min(dates.length - 1, focus.c + dc));
      setFocus({ r, c });
      if (!e.shiftKey) {
        setAnchor(null);
        setExtra([]);
      } else setAnchor((a) => a ?? focus);
      rowVirtualizer.scrollToIndex(r);
      colVirtualizer.scrollToIndex(c);
    };
    if (isEditing) {
      if (e.key === "Enter" || e.key === "Tab") {
        handled();
        await commitEdit();
        move(0, e.key === "Tab" ? 1 : 0);
      } else if (e.key === "Escape") setIsEditing(false);
      e.stopPropagation();
      return;
    }
    const arrows: Record<string, [number, number]> = {
      ArrowRight: [0, 1],
      ArrowLeft: [0, -1],
      ArrowDown: [1, 0],
      ArrowUp: [-1, 0],
    };
    if (arrows[e.key]) {
      handled();
      move(...arrows[e.key]!);
    } else if (e.key === "Escape") {
      e.stopPropagation();
      if (menu || hover) {
        setMenu(null);
        setHover(null);
        return;
      }
      clearSelection();
    } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
      handled();
      await undo();
    } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "c") {
      handled();
      copyPrice();
    } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "v") {
      handled();
      pastePrice();
    } else if (plain && /^[bomrpn]$/i.test(e.key)) {
      // the same verbs as the right-click menu, one letter each
      const k = e.key.toLowerCase();
      handled();
      if (k === "r") newReservationHere();
      else if (selected.length > 0) {
        if (k === "b") await writeSelection("restrictions", { stopSell: true });
        else if (k === "o") await writeSelection("restrictions", { stopSell: false });
        else if (k === "m") focusPanel("panel-min-stay");
        else if (k === "n") focusPanel("panel-note");
        else focusPanel("panel-price");
      }
    } else if (/^[0-9]$/.test(e.key) || e.key === "Enter") {
      const row = rows[focus.r];
      if (row?.kind === "rate_plan" && !row.derived) {
        handled();
        const cell = cellAt(row, focus.c);
        setEditing(e.key === "Enter" ? String((cell?.[1].rate ?? 0) / 100) : e.key);
        setIsEditing(true);
      }
    }
  };

  const nightsCount = selectedDates.length;
  const panelOpen = rects.length > 0 && (selected.length > 0 || derivedOnly);
  const monthLabel = new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${dates[0] ?? start}T00:00:00Z`));
  const shortDate = (iso: string) =>
    new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(
      new Date(`${iso}T00:00:00Z`),
    );
  const rangeLabel = (from: string, to: string): string => {
    if (from === to) return shortDate(from);
    const a = new Date(`${from}T00:00:00Z`);
    const b = new Date(`${to}T00:00:00Z`);
    return a.getUTCMonth() === b.getUTCMonth()
      ? `${String(a.getUTCDate())}–${shortDate(to)}`
      : `${shortDate(from)} – ${shortDate(to)}`;
  };
  const gridHeight = Math.min(rowVirtualizer.getTotalSize() + HEADER_H + 2, maxH);
  const hoverRow = hover ? rows[hover.r] : undefined;
  const filterValue = propertyId ? `p:${propertyId}` : groupId ? `g:${groupId}` : "";
  const settingsHref = `/calendar/settings${focusProperty() ? `?propertyId=${focusProperty()!}` : ""}`;

  return (
    <div className="space-y-4" data-testid="calendar">
      <div className="flex flex-wrap items-center gap-2.5 text-[13px]">
        {viewSwitch}
        <div
          className="inline-flex overflow-hidden rounded-full border border-border bg-surface"
          role="group"
          aria-label={L.range}
        >
          {(
            [
              [14, L.horizon14],
              [30, L.horizon30],
              [60, L.horizon60],
              [90, L.horizon90],
            ] as const
          ).map(([d, label]) => (
            <button
              key={d}
              type="button"
              aria-pressed={d === days}
              onClick={() => setDays(d)}
              className={`px-3 py-[7px] font-semibold transition-colors ${d === days ? "bg-foreground text-background" : "text-muted hover:text-foreground"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <select
          aria-label={L.allProperties}
          className="h-[34px] rounded-full border border-border bg-surface px-3 font-semibold text-muted"
          value={filterValue}
          onChange={(e) => {
            const v = e.target.value;
            clearSelection();
            if (v.startsWith("p:")) router.push(`/calendar?view=strip&propertyId=${v.slice(2)}`);
            else {
              if (propertyId) router.push("/calendar?view=strip");
              setGroupId(v.startsWith("g:") ? v.slice(2) : "");
            }
          }}
          data-testid="calendar-filter"
        >
          <option value="">{L.allProperties}</option>
          {groups.length > 0 ? (
            <optgroup label={L.groupsLabel}>
              {groups.map((g) => (
                <option key={g.id} value={`g:${g.id}`}>
                  {g.name}
                </option>
              ))}
            </optgroup>
          ) : null}
          {allProperties.length > 1 ? (
            <optgroup label={L.propertiesLabel}>
              {allProperties.map((p) => (
                <option key={p.id} value={`p:${p.id}`}>
                  {p.title}
                </option>
              ))}
            </optgroup>
          ) : null}
        </select>
        <button
          type="button"
          className="h-[34px] rounded-full border border-border bg-surface px-3 font-semibold hover:bg-default"
          onClick={goToday}
          data-testid="go-today"
        >
          {L.today}
        </button>
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => setTipsOpen((v) => !v)}
          aria-expanded={tipsOpen}
          className={`inline-flex h-[34px] items-center gap-1.5 rounded-full border px-3 font-semibold ${tips.length > 0 ? "border-amber-300 bg-amber-50 text-warning-soft-foreground" : "border-border bg-surface text-muted hover:text-foreground"}`}
          data-testid="price-tips"
        >
          <span aria-hidden="true">✦</span>
          {tips.length > 0 ? fmt(L.priceTipsCount, { n: tips.length }) : L.priceTips}
        </button>
        <Link
          href={settingsHref}
          className="inline-flex h-[34px] items-center gap-1.5 rounded-full border border-border bg-surface px-3 font-semibold hover:bg-default"
          data-testid="pricing-settings"
        >
          <span aria-hidden="true">⚙</span>
          {L.pricingSettings}
        </Link>
        <a
          href="#shortcuts"
          aria-label={L.shortcuts}
          className="inline-flex h-[34px] w-[34px] items-center justify-center rounded-full border border-border bg-surface font-semibold hover:bg-default"
        >
          ?
        </a>
        <span className="sr-only" data-testid="grid-stats">
          {loadMs === null
            ? ""
            : fmt(L.loadedIn, { rows: rows.length, days: dates.length, ms: loadMs })}
        </span>
      </div>

      {tipsOpen ? (
        <div
          className="flex flex-wrap items-center gap-3 rounded-card border border-amber-300 bg-amber-50 px-4 py-2.5 text-[13px] dark:bg-warning-soft"
          data-testid="price-tips-banner"
        >
          <strong>{L.priceTips}</strong>
          {tips.length > 0 ? (
            <>
              <span className="text-muted">{tips.map((t) => t.title).join(" · ")}</span>
              <span className="flex-1" />
              <Link
                href={tips[0]!.link}
                className="inline-flex h-8 items-center rounded-full bg-accent px-3 font-bold text-accent-foreground"
              >
                {L.tipsReview}
              </Link>
            </>
          ) : (
            <>
              <span className="text-muted">{L.tipsNone}</span>
              <span className="flex-1" />
              <button
                type="button"
                className="h-8 rounded-full border border-border bg-surface px-3 font-semibold"
                onClick={() => setTipsOpen(false)}
              >
                {L.close}
              </button>
            </>
          )}
        </div>
      ) : null}

      {conflict ? (
        <div
          className="rounded-xl border border-warning/50 bg-warning-soft p-3 text-sm"
          role="alertdialog"
          data-testid="conflict"
        >
          <p className="font-medium">{L.conflictTitle}</p>
          <p className="text-xs">
            {L.mine}: {describe(conflict.mine, data, L)} · {L.theirs}:{" "}
            {describe(conflict.theirs, data, L)}
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              className="h-7 rounded-full bg-accent px-3 text-xs font-semibold text-accent-foreground"
              onClick={() => {
                const c = conflict;
                setConflict(null);
                const row = rows.find(
                  (r) => r.kind === "rate_plan" && r.ratePlan.id === c.ratePlanId,
                );
                if (row?.kind === "rate_plan")
                  void submitEdits("rates", row.property.id, [
                    {
                      ratePlanId: c.ratePlanId,
                      date: c.date,
                      values: c.mine,
                      expectedVersion: c.version,
                    },
                  ]);
              }}
            >
              {L.keepMine}
            </button>
            <button
              type="button"
              className="h-7 rounded-full border border-border px-3 text-xs font-semibold"
              onClick={() => setConflict(null)}
            >
              {L.keepTheirs}
            </button>
          </div>
        </div>
      ) : null}

      <div
        ref={parentRef}
        className="relative select-none overflow-auto rounded-card border border-border bg-surface text-xs outline-none"
        style={{ height: gridHeight }}
        tabIndex={0}
        onKeyDown={(e) => void onKeyDown(e)}
        onMouseLeave={() => {
          if (hoverTimer.current) clearTimeout(hoverTimer.current);
          setHover(null);
        }}
        data-testid="grid-scroller"
      >
        <div
          style={{
            height: rowVirtualizer.getTotalSize() + HEADER_H,
            width: colVirtualizer.getTotalSize() + LABEL_W,
            position: "relative",
          }}
        >
          <div className="sticky top-0 z-20 flex bg-surface-secondary" style={{ height: HEADER_H }}>
            <div
              className="sticky start-0 z-30 flex items-center border-b border-border bg-surface-secondary px-3.5 text-xs font-semibold text-muted"
              style={{ width: LABEL_W }}
            >
              {monthLabel}
            </div>
            {colVirtualizer.getVirtualItems().map((col) => {
              const d = dates[col.index]!;
              const isToday = d === today;
              return (
                <button
                  type="button"
                  key={col.key}
                  tabIndex={-1}
                  onDoubleClick={() => selectColumn(col.index)}
                  title={L.selectNightEverywhere}
                  className={`absolute top-0 flex flex-col items-center justify-center border-b leading-tight ${isToday ? "border-b-2 border-accent font-bold text-accent" : "border-border font-medium text-muted"} ${isWeekend(d) && !isToday ? "bg-default" : ""}`}
                  style={{ left: LABEL_W + col.start, width: colW, height: HEADER_H }}
                >
                  <span className="text-[10px]">{L.weekdayNames.split(",")[mondayIndex(d)]}</span>
                  <span className="text-xs">{Number(d.slice(8))}</span>
                </button>
              );
            })}
          </div>
          {rowVirtualizer.getVirtualItems().map((vr) => {
            const row = rows[vr.index]!;
            const h = rowHeight(row);
            const r = vr.index;
            const rt = row.kind === "property" ? undefined : row.roomType;
            const single =
              rt !== undefined &&
              rt.countOfRooms === 1 &&
              (row.kind === "room_type" || (row.kind === "rate_plan" && row.hero));
            const rowStays = single ? (staysByRoomType.get(rt.id) ?? []) : [];
            const rowBlocks = rt ? (blocksByRoomType.get(rt.id) ?? []) : [];
            return (
              <div
                key={vr.key}
                className="absolute left-0 flex"
                style={{ top: vr.start + HEADER_H, height: h, width: "100%" }}
                data-row-kind={row.kind}
              >
                <div
                  className={`sticky start-0 z-10 flex items-center gap-2.5 border-b border-default bg-surface px-3.5 ${row.kind === "room_type" ? "ps-6" : row.kind === "rate_plan" && !row.hero ? "ps-10 text-muted" : ""}`}
                  style={{ width: LABEL_W }}
                >
                  {row.kind === "property" ? (
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-2.5 text-start"
                      onClick={() =>
                        setCollapsed((s) => {
                          const n = new Set(s);
                          if (n.has(row.property.id)) n.delete(row.property.id);
                          else n.add(row.property.id);
                          return n;
                        })
                      }
                      aria-expanded={!collapsed.has(row.property.id)}
                    >
                      <ListingLabel
                        property={row.property}
                        subtitle={[
                          row.property.city,
                          fmt(L.roomTypes, { n: row.property.roomTypes.length }),
                        ]}
                      />
                    </button>
                  ) : row.kind === "room_type" ? (
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-1 text-start"
                      onClick={() =>
                        setCollapsed((s) => {
                          const n = new Set(s);
                          if (n.has(row.roomType.id)) n.delete(row.roomType.id);
                          else n.add(row.roomType.id);
                          return n;
                        })
                      }
                      aria-expanded={!collapsed.has(row.roomType.id)}
                    >
                      <span className="truncate font-semibold">{row.roomType.title}</span>
                      <span className="text-[11px] text-muted">
                        · {fmt(L.rooms, { n: row.roomType.countOfRooms })}
                      </span>
                    </button>
                  ) : row.hero ? (
                    <>
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-center gap-2.5 text-start"
                        onClick={() => selectRow(r)}
                        title={L.selectWholeRow}
                      >
                        <ListingLabel
                          property={row.property}
                          subtitle={[
                            row.property.city,
                            row.ratePlan.title,
                            row.roomType.countOfRooms > 1
                              ? fmt(L.rooms, { n: row.roomType.countOfRooms })
                              : null,
                          ]}
                        />
                      </button>
                      {row.roomType.ratePlans.length > 1 ? (
                        <button
                          type="button"
                          className="shrink-0 rounded-full border border-border px-1.5 text-[10px] font-semibold text-muted hover:text-foreground"
                          aria-expanded={expanded.has(row.property.id)}
                          onClick={() =>
                            setExpanded((s) => {
                              const n = new Set(s);
                              if (n.has(row.property.id)) n.delete(row.property.id);
                              else n.add(row.property.id);
                              return n;
                            })
                          }
                          title={fmt(L.showDerived, { n: row.roomType.ratePlans.length - 1 })}
                        >
                          +{row.roomType.ratePlans.length - 1}
                        </button>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <span className="truncate">{row.ratePlan.title}</span>
                      {row.derived ? (
                        <span className="rounded-full bg-default px-1.5 text-[10px]">
                          {L.derived}
                        </span>
                      ) : null}
                    </>
                  )}
                </div>
                {colVirtualizer.getVirtualItems().map((col) => {
                  const date = dates[col.index]!;
                  const c = col.index;
                  const inSelection = inRects(r, c);
                  const focused = focus?.r === r && focus.c === c;
                  const block = rowBlocks.find((b) => covers(b, date));
                  const common = `absolute border-b border-default text-center ${isWeekend(date) ? "bg-default/70" : ""} ${inSelection ? "!bg-accent-soft/60 outline-2 -outline-offset-2 outline-accent" : ""} ${focused ? "ring-2 ring-inset ring-accent" : ""}`;
                  const style = { left: LABEL_W + col.start, width: colW, height: h };
                  const down = (e: React.MouseEvent) => {
                    if (e.button !== 0) return;
                    e.preventDefault();
                    dragging.current = true;
                    if (e.metaKey || e.ctrlKey) setExtra((x) => (current ? [...x, current] : x));
                    else if (!e.shiftKey) setExtra([]);
                    setFocus({ r, c });
                    setAnchor(e.shiftKey ? (anchor ?? focus) : { r, c });
                    setIsEditing(false);
                    setBulk({});
                    setHover(null);
                    parentRef.current?.focus();
                  };
                  const enter = (e: React.MouseEvent) => {
                    if (dragging.current) {
                      setFocus({ r, c });
                      return;
                    }
                    if (hoverTimer.current) clearTimeout(hoverTimer.current);
                    if (row.kind !== "rate_plan" || menu) return;
                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    hoverTimer.current = setTimeout(
                      () => setHover({ r, c, x: rect.right, y: rect.top }),
                      450,
                    );
                  };
                  if (row.kind === "property") {
                    return (
                      <div
                        key={col.key}
                        className={common}
                        style={style}
                        onMouseDown={down}
                        onMouseEnter={enter}
                        onContextMenu={(e) => openMenu(e, r, c)}
                      />
                    );
                  }
                  if (row.kind === "room_type") {
                    const av = row.roomType.cells.find((x) => x[0] === date);
                    return (
                      <div
                        key={col.key}
                        className={`${common} flex flex-col items-center justify-center text-[11px] ${av && av[1] < 0 ? "bg-danger-soft text-danger" : ""}`}
                        style={{ ...style, ...(block ? { backgroundImage: HATCH } : {}) }}
                        onMouseDown={down}
                        onMouseEnter={enter}
                        onContextMenu={(e) => openMenu(e, r, c)}
                      >
                        {av ? (
                          <span className={av[1] <= 0 ? "font-semibold text-danger" : "text-muted"}>
                            {fmt(L.left, { n: av[1] })}
                          </span>
                        ) : null}
                      </div>
                    );
                  }
                  const cell = row.ratePlan.cells.find((x) => x[0] === date);
                  const ed = focused && isEditing;
                  const v = cell?.[1];
                  const av = row.hero ? row.roomType.cells.find((x) => x[0] === date) : undefined;
                  const multi = row.hero && row.roomType.countOfRooms > 1;
                  const blocked = v?.stopSell === true;
                  const hatched = !multi && (blocked || block !== undefined);
                  const note = row.property.notes[`${row.ratePlan.id}|${date}`];
                  const booked = !multi && av !== undefined && av[1] <= 0 && !block;
                  const underBar = rowStays.some((st) => covers(st, date));
                  return (
                    <div
                      key={col.key}
                      className={`${common} flex flex-col items-center justify-center gap-0.5 px-1 ${row.derived ? "text-muted" : ""}`}
                      style={{ ...style, ...(hatched ? { backgroundImage: HATCH } : {}) }}
                      onMouseDown={down}
                      onMouseEnter={enter}
                      onContextMenu={(e) => openMenu(e, r, c)}
                      onDoubleClick={() => {
                        if (!row.derived) {
                          setEditing(String((cell?.[1].rate ?? 0) / 100));
                          setIsEditing(true);
                        }
                      }}
                      data-testid={focused ? "focused-cell" : undefined}
                      data-state={cell?.[2]}
                      data-cell={`${row.ratePlan.id}:${date}`}
                      title={note}
                    >
                      {ed ? (
                        <input
                          autoFocus
                          className="w-full border-0 bg-surface p-0 text-center text-[13px] font-semibold outline-none"
                          value={editing}
                          onChange={(e) => setEditing(e.target.value)}
                          onBlur={() => void commitEdit()}
                          data-testid="cell-editor"
                        />
                      ) : underBar ? null : hatched ? (
                        <>
                          <span className="font-semibold text-muted">—</span>
                          <span className="text-[10px] text-muted">
                            {block
                              ? (L[`block_${block.reason}` as keyof CalendarLabels] ?? L.blocked)
                              : L.blocked}
                          </span>
                        </>
                      ) : (
                        <>
                          <span
                            className={`font-semibold tabular-nums ${inSelection ? "text-accent" : ""}`}
                          >
                            {v?.rate === undefined
                              ? "—"
                              : new Intl.NumberFormat("en-GB").format(v.rate / 100)}
                          </span>
                          {multi && av ? (
                            <span
                              className={`text-[10px] ${av[1] <= 0 ? "font-semibold text-danger" : "text-muted"}`}
                            >
                              {fmt(L.left, { n: av[1] })}
                            </span>
                          ) : booked ? (
                            <span className="text-[10px] text-muted">{L.booked}</span>
                          ) : cell ? (
                            <span className="flex items-center gap-1">
                              <span className={`h-1.5 w-1.5 rounded-full ${DOT[cell[2]]}`} />
                              {note ? (
                                <span
                                  className="h-1.5 w-1.5 rounded-full bg-warning"
                                  aria-label={L.privateNote}
                                />
                              ) : null}
                            </span>
                          ) : null}
                        </>
                      )}
                    </div>
                  );
                })}
                {rowStays.map((s) => {
                  const a = Math.max(0, dates.indexOf(s.from < start ? start : s.from));
                  const lastNight = addDays(s.to, -1);
                  const bEnd = lastNight > end ? dates.length - 1 : dates.indexOf(lastNight);
                  if (bEnd < 0 || s.from > end) return null;
                  const ch = channelName(s.otaName);
                  return (
                    <Link
                      key={s.bookingId}
                      href={`/reservations/${s.bookingId}`}
                      className="absolute top-1/2 z-[5] -translate-y-1/2 truncate rounded-full px-2.5 py-[5px] text-[11px] font-semibold whitespace-nowrap shadow-sm hover:brightness-110"
                      style={{
                        left: LABEL_W + a * colW + 4,
                        width: (bEnd - a + 1) * colW - 8,
                        background: channelColour(s.otaName),
                        color: channelInk(s.otaName),
                      }}
                      title={`${s.guest || L.guest} · ${ch}`}
                      data-testid="booking-bar"
                      onMouseEnter={() => setHover(null)}
                    >
                      {s.guest || L.guest} · {ch}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {hover && hoverRow?.kind === "rate_plan" && !menu ? (
        <HoverCard L={L} row={hoverRow} date={dates[hover.c]!} x={hover.x} y={hover.y} />
      ) : null}

      {menu && current ? (
        <div
          ref={menuRef}
          role="menu"
          className="fixed z-50 w-[230px] overflow-hidden rounded-card border border-border bg-surface p-1.5 text-[13px] shadow-float"
          style={{
            left: Math.min(menu.x, (typeof window === "undefined" ? 0 : window.innerWidth) - 240),
            top: Math.min(menu.y, (typeof window === "undefined" ? 0 : window.innerHeight) - 330),
          }}
          data-testid="context-menu"
        >
          <p className="truncate px-2.5 pt-1.5 pb-2 text-[11px] font-bold tracking-wider text-muted uppercase">
            {(selectedPlans[0]?.property ?? rows[current.r1]?.property)?.title} ·{" "}
            {rangeLabel(dates[current.c1]!, dates[current.c2]!)}
          </p>
          {(
            [
              ["price", L.setPrice, "P", selected.length > 0],
              ["block", L.blockNights, "B", selected.length > 0],
              ["open", L.open, "O", selected.length > 0],
              ["min", L.minStayMenu, "M", selected.length > 0],
              ["note", L.addNote, "N", selected.length > 0],
              ["new", L.newReservationHere, "R", true],
              ["copy", L.copyPrice, "⌘C", selected.length > 0],
              ["paste", L.pastePrice, "⌘V", selected.length > 0],
            ] as const
          )
            .filter(([, , , show]) => show)
            .map(([id, label, key]) => (
              <button
                key={id}
                type="button"
                role="menuitem"
                disabled={id === "paste" && clip === null}
                className="flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-start hover:bg-default disabled:opacity-50 disabled:hover:bg-transparent"
                onClick={() => {
                  setMenu(null);
                  if (id === "price") focusPanel("panel-price");
                  else if (id === "min") focusPanel("panel-min-stay");
                  else if (id === "note") focusPanel("panel-note");
                  else if (id === "block") void writeSelection("restrictions", { stopSell: true });
                  else if (id === "open") void writeSelection("restrictions", { stopSell: false });
                  else if (id === "copy") copyPrice();
                  else if (id === "paste") pastePrice();
                  else newReservationHere();
                }}
              >
                <span>{label}</span>
                <Kbd>{key}</Kbd>
              </button>
            ))}
        </div>
      ) : null}

      <div
        className={`grid items-start gap-5 ${panelOpen ? "lg:grid-cols-[minmax(0,1fr)_340px]" : ""}`}
      >
        <div className="flex min-w-0 flex-col gap-3">
          <ul className="flex flex-wrap gap-4 px-0.5 py-1 text-xs text-muted" aria-label={L.legend}>
            <li className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-success" aria-hidden="true" />
              {L.legendSynced}
            </li>
            <li className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-sky-500" aria-hidden="true" />
              {L.legendSending}
            </li>
            <li className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-danger" aria-hidden="true" />
              {L.legendFailed}
            </li>
            <li className="flex items-center gap-1.5">
              <span
                className="h-2.5 w-3.5 rounded-sm text-foreground/60"
                style={{ backgroundImage: HATCH }}
                aria-hidden="true"
              />
              {L.blocked}
            </li>
            <li className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-warning" aria-hidden="true" />
              {L.privateNote}
            </li>
          </ul>
          <section
            className="rounded-card border border-border bg-surface px-[18px] py-3.5"
            data-testid="calendar-tips-sheet"
          >
            <h2 className="font-sans text-sm font-bold">{L.tipsTitle}</h2>
            <ul className="mt-2.5 grid gap-x-5 gap-y-2 text-[13px] sm:grid-cols-2">
              {[L.trickDrag, L.trickType, L.trickMenu, L.trickHeader, L.trickKeys, L.trickCopy].map(
                (t) => (
                  <li key={t}>{rich(t)}</li>
                ),
              )}
            </ul>
          </section>
        </div>
        {panelOpen && current ? (
          <SelectionPanel
            key={rects
              .map((s) => `${String(s.r1)}-${String(s.r2)}-${String(s.c1)}-${String(s.c2)}`)
              .join("|")}
            L={L}
            nights={nightsCount}
            dates={selectedDates}
            rangeLabel={rangeLabel(selectedDates[0]!, selectedDates.at(-1)!)}
            plans={selectedPlans}
            cells={selected}
            data={data}
            derivedOnly={derivedOnly}
            bulk={bulk}
            onClose={clearSelection}
            onSave={async (s) => {
              const targets: Target[] = [];
              const plansFor = (p: GridProperty) =>
                p.roomTypes.flatMap((rt) =>
                  rt.ratePlans.filter((rp) => rp.parentRatePlanId === null),
                );
              if (s.scope === "selection")
                for (const t of selected)
                  targets.push({
                    property: t.row.property,
                    ratePlan: t.row.ratePlan,
                    cell: t.cell,
                  });
              else {
                const props =
                  s.scope === "all" ? data : [...new Set(selectedPlans.map((p) => p.property))];
                for (const p of props)
                  for (const rp of plansFor(p))
                    for (const d of selectedDates) {
                      const cell = rp.cells.find((x) => x[0] === d);
                      if (cell) targets.push({ property: p, ratePlan: rp, cell });
                    }
              }
              const list: Array<{ t: Target; kind: "rates" | "restrictions"; values: Values }> = [];
              for (const t of targets) {
                if (s.rate !== undefined && t.cell[1].rate !== s.rate)
                  list.push({ t, kind: "rates", values: { rate: s.rate } });
                const rv = s.restrictions(t.cell[0], t.cell[1]);
                if (rv) list.push({ t, kind: "restrictions", values: rv });
              }
              const ok = list.length === 0 ? true : await writeTargets(list);
              if (!ok) return;
              if (s.note !== null) {
                const byProp = new Map<
                  string,
                  Array<{ ratePlanId: string; date: string; body: string }>
                >();
                for (const t of targets)
                  byProp.set(t.property.id, [
                    ...(byProp.get(t.property.id) ?? []),
                    { ratePlanId: t.ratePlan.id, date: t.cell[0], body: s.note },
                  ]);
                for (const [pid, notes] of byProp)
                  await saveNightNotesAction({ propertyId: pid, notes });
                await load();
              }
              setMessage(
                savedMessage(new Set(targets.map((t) => t.cell[0])).size, [
                  ...new Set(targets.map((t) => t.property)),
                ]),
              );
            }}
            onPreviewPercent={(pct) =>
              void runBulk(true, [
                { op: "adjust_rate_percent", basisPoints: Math.round(pct * 100) },
              ])
            }
            onApply={() => void runBulk(false, bulk.ops ?? [])}
            onCancelPreview={() => setBulk({})}
          />
        ) : null}
      </div>

      {message ? (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 z-40 inline-flex max-w-[calc(100vw-32px)] -translate-x-1/2 items-center gap-3 rounded-xl bg-foreground px-3.5 py-2.5 text-[13px] text-background shadow-float lg:left-[268px] lg:translate-x-0"
          data-testid="calendar-toast"
        >
          <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400" aria-hidden="true" />
          <span>{message}</span>
          {undoStack.length > 0 ? (
            <button
              type="button"
              className="font-bold text-teal-300 hover:underline"
              onClick={() => void undo()}
            >
              {L.undo}
            </button>
          ) : null}
          {undoStack.length > 0 ? <Kbd>⌘Z</Kbd> : null}
          <button
            type="button"
            aria-label={L.dismiss}
            className="ms-1 text-background/60 hover:text-background"
            onClick={() => setMessage("")}
          >
            ✕
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** Restriction values in words, for the conflict prompt. */
function describe(v: Values, data: GridProperty[], L: CalendarLabels): string {
  const cur = data[0]?.currency ?? "EUR";
  return [
    v.rate !== undefined ? moneyText(v.rate, cur) : "",
    v.stopSell ? L.blocked : "",
    v.minStay ? `${L.minNights} ${String(v.minStay)}` : "",
  ]
    .filter(Boolean)
    .join(", ");
}

function ListingLabel({
  property,
  subtitle,
}: {
  property: GridProperty;
  subtitle: Array<string | null | undefined>;
}) {
  return (
    <>
      <ListingThumb property={property} />
      <span className="min-w-0">
        <strong className="block truncate text-[13px]">{property.title}</strong>
        <span className="block truncate text-[11px] font-normal text-muted">
          {subtitle.filter(Boolean).join(" · ")}
        </span>
      </span>
    </>
  );
}

/** What one night costs and shows, everywhere, on hover (design: the night card). */
function HoverCard({
  L,
  row,
  date,
  x,
  y,
}: {
  L: CalendarLabels;
  row: PlanRow;
  date: string;
  x: number;
  y: number;
}) {
  const cell = row.ratePlan.cells.find((c) => c[0] === date);
  const v = cell?.[1];
  const cur = row.property.currency;
  const label = new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
  const note = row.property.notes[`${row.ratePlan.id}|${date}`];
  const otas = row.property.channels.filter((c) => c !== "direct" && c !== "other");
  const sync: Record<SyncState, [string, string]> = {
    synced: [L.syncSynced, "text-success-soft-foreground"],
    pending: [L.syncPending, "text-muted"],
    in_flight: [L.legendSending, "text-sky-700"],
    failed: [L.legendFailed, "text-danger"],
    conflicted: [L.syncConflicted, "text-warning"],
  };
  const left = Math.min(x + 8, (typeof window === "undefined" ? 1440 : window.innerWidth) - 262);
  return (
    <div
      className="pointer-events-none fixed z-40 w-[250px] rounded-card border border-border bg-surface px-3.5 py-3 text-xs shadow-float"
      style={{ left, top: Math.max(8, y - 8) }}
      data-testid="night-card"
    >
      <div className="flex items-baseline justify-between gap-2">
        <strong className="truncate text-[13px]">
          {label} · {row.property.title}
        </strong>
        {isWeekend(date) ? <span className="text-muted">{L.weekend}</span> : null}
      </div>
      <table className="mt-2 w-full border-collapse">
        <tbody>
          <tr>
            <td className="py-[3px]">{L.yourPrice}</td>
            <td className="py-[3px] text-end font-bold">{moneyText(v?.rate, cur)}</td>
          </tr>
          {v?.rate !== undefined
            ? otas.map((ch) => {
                const bps = row.property.pricing.markupBps[ch] ?? 0;
                const shown = guestPrice(
                  Money.of(v.rate!, cur),
                  bps,
                  row.property.pricing.rounding,
                );
                return (
                  <tr key={ch} className="text-muted">
                    <td className="py-[3px]">
                      {channelNameOf(ch as "airbnb")} · +{bps / 100}%
                    </td>
                    <td className="py-[3px] text-end">
                      {fmt(L.guestSees, { price: moneyText(shown.minor, cur) })}
                    </td>
                  </tr>
                );
              })
            : null}
          {v?.rate !== undefined ? (
            <tr className="text-muted">
              <td className="py-[3px]">{channelNameOf("direct")}</td>
              <td className="py-[3px] text-end">
                {fmt(L.bestPrice, { price: moneyText(v.rate, cur) })}
              </td>
            </tr>
          ) : null}
          <tr className="text-muted">
            <td className="py-[3px]">{L.minStayShort}</td>
            <td className="py-[3px] text-end">
              {v?.minStay && v.minStay > 1 ? fmt(L.nights, { n: v.minStay }) : L.night}
            </td>
          </tr>
          {v?.stopSell || v?.closedToArrival ? (
            <tr className="text-muted">
              <td className="py-[3px]">{L.status}</td>
              <td className="py-[3px] text-end">{v.stopSell ? L.blocked : L.closedToArrival}</td>
            </tr>
          ) : null}
          {cell ? (
            <tr>
              <td className="py-[3px] text-muted">{L.sync}</td>
              <td className={`py-[3px] text-end ${sync[cell[2]][1]}`}>{sync[cell[2]][0]}</td>
            </tr>
          ) : null}
        </tbody>
      </table>
      {note ? (
        <p className="mt-2 rounded-lg bg-warning-soft px-2 py-1 text-warning-soft-foreground">
          {note}
        </p>
      ) : null}
      <p className="mt-2 text-muted">{L.hoverHint}</p>
    </div>
  );
}

type SaveSpec = {
  scope: "selection" | "plans" | "all";
  rate?: number;
  /** Restriction values for one night, or null to leave it as it is. */
  restrictions: (date: string, current: Values) => Values | null;
  /** The note for every night, or null to leave notes alone. */
  note: string | null;
};

/** The editor for the selected nights (design: the side panel), saved with one press. */
function SelectionPanel({
  L,
  nights,
  dates,
  rangeLabel,
  plans,
  cells,
  data,
  derivedOnly,
  bulk,
  onClose,
  onSave,
  onPreviewPercent,
  onApply,
  onCancelPreview,
}: {
  L: CalendarLabels;
  nights: number;
  dates: string[];
  rangeLabel: string;
  plans: PlanRow[];
  cells: Array<{ row: PlanRow; cell: RateCell }>;
  data: GridProperty[];
  derivedOnly: boolean;
  bulk: { preview?: { cellCount: number; warnings: string[]; blocked: string[] }; ops?: unknown[] };
  onClose: () => void;
  onSave: (s: SaveSpec) => Promise<void>;
  onPreviewPercent: (pct: number) => void;
  onApply: () => void;
  onCancelPreview: () => void;
}) {
  const first = cells[0]?.cell[1];
  const currency = plans[0]?.property.currency ?? "EUR";
  const symbol = moneyText(0, currency).replace(/[\d.,\s−-]/g, "") || currency;
  const uniform = <K extends keyof Values>(k: K): Values[K] | undefined => {
    const v = first?.[k];
    return cells.every((c) => c.cell[1][k] === v) ? v : undefined;
  };
  const listing = plans.length === 1 ? plans[0]! : null;
  const props = [...new Set(plans.map((p) => p.property))];
  const initialRate = uniform("rate");
  const initialBlocked = uniform("stopSell") === true;
  const initialMin = uniform("minStay");
  const initialMax = uniform("maxStay");
  const weekdays = L.weekdayShort.split(",");
  const initialCheckIn = weekdays.map((_, wd) => {
    const ofDay = cells.filter((c) => mondayIndex(c.cell[0]) === wd);
    return ofDay.length === 0 || !ofDay.every((c) => c.cell[1].closedToArrival === true);
  });
  const notes = cells.map((c) => c.row.property.notes[`${c.row.ratePlan.id}|${c.cell[0]}`] ?? "");
  const initialNote = notes.every((n) => n === notes[0]) ? (notes[0] ?? "") : "";

  const [price, setPrice] = useState(initialRate !== undefined ? String(initialRate / 100) : "");
  const [blocked, setBlocked] = useState(initialBlocked);
  const initialMinText =
    initialMin !== undefined ? String(initialMin) : cells.length > 1 ? "" : "1";
  const initialMaxText = initialMax !== undefined ? String(initialMax) : "";
  const [minStay, setMinStay] = useState(initialMinText);
  const [maxStay, setMaxStay] = useState(initialMaxText);
  const [checkIn, setCheckIn] = useState(initialCheckIn);
  const [note, setNote] = useState(initialNote);
  const [scope, setScope] = useState<SaveSpec["scope"]>("selection");
  const [pct, setPct] = useState("10");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [more, setMore] = useState(false);
  const ctd = uniform("closedToDeparture") === true;

  const priceMinor = price.trim() === "" ? undefined : Math.round(Number(price) * 100);
  const otas = [...new Set(props.flatMap((p) => p.channels))].filter(
    (c) => c !== "direct" && c !== "other",
  );
  const chanNames = otas.map((c) => channelNameOf(c as "airbnb"));
  const weekdayList =
    nights <= 7 ? dates.map((d) => L.weekdayNames.split(",")[mondayIndex(d)]).join(", ") : "";
  const title = listing
    ? `${listing.property.title} · ${rangeLabel}`
    : props.length === 1
      ? `${props[0]!.title} · ${rangeLabel}`
      : `${fmt(L.listingsCount, { n: props.length })} · ${rangeLabel}`;

  const save = async () => {
    if (priceMinor !== undefined && (!Number.isFinite(priceMinor) || priceMinor < 0)) {
      setError(L.invalidPrice);
      return;
    }
    const min = Number(minStay);
    const max = maxStay.trim() === "" || maxStay.trim() === "—" ? undefined : Number(maxStay);
    if (
      (minStay !== initialMinText && (!Number.isInteger(min) || min < 1)) ||
      (max !== undefined && (!Number.isInteger(max) || max < Math.max(1, min || 1)))
    ) {
      setError(L.invalidStay);
      return;
    }
    setError("");
    setBusy(true);
    await onSave({
      scope,
      rate: priceMinor !== undefined && priceMinor !== initialRate ? priceMinor : undefined,
      // only what the manager touched is written; a field left alone keeps each night's own value
      restrictions: (date, cur) => {
        const out: Values = {};
        if (blocked !== initialBlocked && (cur.stopSell === true) !== blocked)
          out.stopSell = blocked;
        if (minStay !== initialMinText && (cur.minStay ?? 1) !== min) out.minStay = min;
        if (maxStay !== initialMaxText && max !== undefined && cur.maxStay !== max)
          out.maxStay = max;
        const wd = mondayIndex(date);
        if (checkIn[wd] !== initialCheckIn[wd] && (cur.closedToArrival === true) === checkIn[wd])
          out.closedToArrival = !checkIn[wd];
        return Object.keys(out).length > 0 ? out : null;
      },
      note: note !== initialNote ? note : null,
    });
    setBusy(false);
  };

  return (
    <aside
      className="flex flex-col gap-3 rounded-card border border-border bg-surface px-5 py-[18px] text-xs lg:sticky lg:top-4"
      data-testid="selection-panel"
      aria-label={title}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="truncate font-sans text-[15px] font-bold">{title}</h2>
          <p className="mt-0.5 text-xs text-muted">
            {nights === 1 ? L.night : fmt(L.nights, { n: nights })}
            {weekdayList ? ` · ${weekdayList}` : ""}
          </p>
        </div>
        <button
          type="button"
          className="text-xs text-muted hover:text-foreground"
          onClick={onClose}
          aria-label={L.cancel}
        >
          Esc
        </button>
      </div>

      {derivedOnly ? (
        <p className="rounded-xl bg-default p-3 text-muted">{L.derivedNote}</p>
      ) : (
        <>
          <label className="flex flex-col gap-1.5 font-semibold" htmlFor="panel-price">
            {L.pricePerNight}
            <span className="flex items-center overflow-hidden rounded-[10px] border border-border focus-within:ring-2 focus-within:ring-accent">
              <span className="px-3 font-medium text-muted">{symbol}</span>
              <input
                id="panel-price"
                data-testid="panel-price"
                inputMode="decimal"
                className="h-[42px] min-w-0 flex-1 bg-transparent text-lg font-bold outline-none"
                value={price}
                placeholder={initialRate === undefined && cells.length > 1 ? L.mixed : ""}
                onChange={(e) => setPrice(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void save();
                }}
              />
              <button
                type="button"
                className="flex h-[42px] items-center border-s border-border px-3 font-semibold text-accent"
                onClick={() => {
                  setMore(true);
                  requestAnimationFrame(() => document.getElementById("panel-pct")?.focus());
                }}
              >
                ±%
              </button>
            </span>
          </label>
          <div className="flex flex-wrap gap-1.5">
            {initialRate !== undefined && priceMinor !== undefined && priceMinor !== initialRate ? (
              <span className="rounded-full bg-default px-2.5 py-[3px] font-semibold text-muted">
                {fmt(L.was, { price: moneyText(initialRate, currency) })}
              </span>
            ) : null}
            {priceMinor !== undefined && Number.isFinite(priceMinor) && priceMinor >= 0
              ? otas.slice(0, 2).map((ch) => {
                  const p0 = props[0]!;
                  const shown = guestPrice(
                    Money.of(priceMinor, currency),
                    p0.pricing.markupBps[ch] ?? 0,
                    p0.pricing.rounding,
                  );
                  return (
                    <span
                      key={ch}
                      className="rounded-full bg-default px-2.5 py-[3px] font-semibold text-muted"
                    >
                      {fmt(L.channelShows, {
                        channel: channelNameOf(ch as "airbnb"),
                        price: moneyText(shown.minor, currency),
                      })}
                    </span>
                  );
                })
              : null}
          </div>
          <div className="flex gap-1.5" role="group">
            <button
              type="button"
              aria-pressed={!blocked}
              data-testid="panel-open"
              onClick={() => setBlocked(false)}
              className={`flex-1 rounded-[10px] p-[9px] text-[13px] font-semibold ${!blocked ? "bg-foreground text-background" : "border border-border text-muted"}`}
            >
              {L.open}
            </button>
            <button
              type="button"
              aria-pressed={blocked}
              data-testid="panel-block"
              onClick={() => setBlocked(true)}
              className={`flex-1 rounded-[10px] p-[9px] text-[13px] font-semibold ${blocked ? "bg-foreground text-background" : "border border-border text-muted"}`}
            >
              {L.block}
            </button>
          </div>
          <div className="font-semibold">
            {L.openOn}
            <div className="mt-1.5 flex flex-wrap gap-1">
              {[...otas, "direct"].map((ch) => (
                <span
                  key={ch}
                  className={`rounded-full px-2.5 py-[5px] text-[11px] font-semibold ${blocked ? "border border-border text-muted" : "bg-foreground text-background"}`}
                >
                  {channelNameOf(ch as "airbnb")}
                </span>
              ))}
            </div>
            <span className="mt-1 block text-[11px] font-normal text-muted">{L.openOnNote}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 font-semibold" htmlFor="panel-min-stay">
              {L.minNights}
              <input
                id="panel-min-stay"
                inputMode="numeric"
                className="h-9 rounded-[10px] border border-border bg-surface text-center font-semibold outline-none focus:ring-2 focus:ring-accent"
                value={minStay}
                onChange={(e) => setMinStay(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 font-semibold" htmlFor="panel-max-stay">
              {L.maxNights}
              <input
                id="panel-max-stay"
                inputMode="numeric"
                placeholder="—"
                className="h-9 rounded-[10px] border border-border bg-surface text-center font-semibold outline-none focus:ring-2 focus:ring-accent"
                value={maxStay}
                onChange={(e) => setMaxStay(e.target.value)}
              />
            </label>
          </div>
          <div className="font-semibold">
            {L.checkInAllowed}
            <div className="mt-1.5 flex gap-1" role="group" aria-label={L.checkInAllowed}>
              {weekdays.map((d, i) => (
                <button
                  key={d}
                  type="button"
                  aria-pressed={checkIn[i]}
                  onClick={() => setCheckIn((x) => x.map((v, j) => (j === i ? !v : v)))}
                  className={`flex-1 rounded-lg py-1.5 text-[11px] font-semibold ${checkIn[i] ? "bg-foreground text-background" : "border border-border text-muted"}`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
          <label className="flex flex-col gap-1 font-semibold" htmlFor="panel-note">
            {L.privateNote}
            <input
              id="panel-note"
              placeholder={L.privateNotePlaceholder}
              className="h-9 rounded-[10px] border border-border bg-surface px-2.5 text-[13px] font-normal outline-none focus:ring-2 focus:ring-accent"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
            />
          </label>
          <label className="flex flex-col gap-1 font-semibold" htmlFor="panel-scope">
            {L.applyTo}
            <select
              id="panel-scope"
              className="h-9 rounded-[10px] border border-border bg-surface px-2.5 text-[13px] font-normal"
              value={scope}
              onChange={(e) => setScope(e.target.value as SaveSpec["scope"])}
            >
              <option value="selection">
                {listing
                  ? fmt(L.applySelection, {
                      plan: `${listing.property.title} · ${listing.ratePlan.title}`,
                    })
                  : L.applySelected}
              </option>
              <option value="plans">{L.applyAllPlans}</option>
              {data.length > 1 ? <option value="all">{L.applyAll}</option> : null}
            </select>
          </label>
          {error ? <p className="text-danger">{error}</p> : null}
          <button
            type="button"
            className="flex h-11 items-center justify-center gap-2.5 rounded-[10px] bg-accent text-sm font-bold text-accent-foreground disabled:opacity-60"
            onClick={() => void save()}
            disabled={busy}
            data-testid="panel-save-price"
          >
            {nights === 1 ? L.saveNight : fmt(L.saveNights, { n: nights })}
            <Kbd>↵</Kbd>
          </button>
          <p className="text-[11px] text-muted">
            {chanNames.length > 0
              ? fmt(L.panelReaches, { channels: chanNames.join(` ${L.andWord} `) })
              : L.panelReachesNone}{" "}
            <Kbd>⌘Z</Kbd> {L.undoesHint}
          </p>
          <details
            className="rounded-xl border border-border"
            open={more}
            onToggle={(e) => setMore((e.target as HTMLDetailsElement).open)}
          >
            <summary className="cursor-pointer px-3 py-2 font-semibold text-muted select-none">
              {L.advanced}
            </summary>
            <div className="space-y-3 border-t border-border p-3">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={ctd}
                  onChange={(e) =>
                    void onSave({
                      scope: "selection",
                      restrictions: () => ({ closedToDeparture: e.target.checked }),
                      note: null,
                    })
                  }
                />
                {L.closedToDeparture}
              </label>
              <div className="space-y-1.5">
                <label className="font-semibold text-muted" htmlFor="panel-pct">
                  {L.adjustPercent}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="panel-pct"
                    data-testid="panel-pct"
                    type="number"
                    className="h-9 w-20 rounded-[10px] border border-border bg-surface px-3 outline-none focus:ring-2 focus:ring-accent"
                    value={pct}
                    onChange={(e) => setPct(e.target.value)}
                  />
                  <span className="text-muted">%</span>
                  <button
                    type="button"
                    className="ms-auto h-9 rounded-full border border-border px-3 font-semibold"
                    data-testid="panel-preview-pct"
                    onClick={() => {
                      const n = Number(pct);
                      if (Number.isFinite(n) && n !== 0) onPreviewPercent(n);
                    }}
                  >
                    {L.preview}
                  </button>
                </div>
              </div>
              {bulk.preview ? (
                <div className="space-y-2 rounded-xl bg-default p-3" data-testid="bulk-preview">
                  <p className="font-medium">
                    {fmt(L.wouldChange, { n: bulk.preview.cellCount })} {L.nothingChanged}
                  </p>
                  {bulk.preview.warnings.map((w) => (
                    <p key={w} className="text-warning-soft-foreground">
                      {w}
                    </p>
                  ))}
                  {bulk.preview.blocked.map((w) => (
                    <p key={w} className="text-danger">
                      {w}
                    </p>
                  ))}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="h-8 rounded-full bg-accent px-3 font-semibold text-accent-foreground disabled:opacity-50"
                      data-testid="bulk-apply"
                      disabled={bulk.preview.blocked.length > 0 || !bulk.ops}
                      onClick={onApply}
                    >
                      {fmt(L.apply, { n: bulk.preview.cellCount })}
                    </button>
                    <button
                      type="button"
                      className="h-8 rounded-full border border-border px-3 font-semibold"
                      onClick={onCancelPreview}
                    >
                      {L.cancel}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </details>
        </>
      )}
    </aside>
  );
}
