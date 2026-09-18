"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Button } from "@/components/ui";
import { type CalendarLabels } from "@/components/calendar-labels";

type Values = {
  rate?: number;
  minStay?: number;
  maxStay?: number;
  closedToArrival?: boolean;
  closedToDeparture?: boolean;
  stopSell?: boolean;
};
type SyncState = "pending" | "in_flight" | "synced" | "failed" | "conflicted";
type RateCell = [string, Values, SyncState, number];
type AvailCell = [string, number, SyncState, number];
interface GridRatePlan {
  id: string;
  title: string;
  parentRatePlanId: string | null;
  cells: RateCell[];
}
interface GridRoomType {
  id: string;
  title: string;
  countOfRooms: number;
  isSystemManaged: boolean;
  cells: AvailCell[];
  ratePlans: GridRatePlan[];
}
interface GridProperty {
  id: string;
  title: string;
  kind: string;
  currency: string;
  state: string;
  groups: string[];
  photoUrl: string | null;
  roomTypes: GridRoomType[];
}

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
      /** A single-unit listing with one plan is one row: the plan row carries the listing itself. */
      hero: boolean;
    };
type PlanRow = Extract<Row, { kind: "rate_plan" }>;
const rowHeight = (row: Row | undefined): number =>
  row?.kind === "rate_plan" && row.hero ? 56 : ROW_H[row?.kind ?? "rate_plan"];

/** The strings the grid shows; the page resolves them from the `calendar` namespace. */
const fmt = (s: string, vars: Record<string, string | number>): string =>
  s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));

const COL_W = 84;
const HEADER_H = 52;
const LABEL_W = 268;
const ROW_H: Record<Row["kind"], number> = { property: 48, room_type: 32, rate_plan: 50 };
const DOT: Record<SyncState, string> = {
  pending: "bg-muted",
  in_flight: "bg-accent",
  synced: "bg-success",
  failed: "bg-danger",
  conflicted: "bg-warning",
};
const WEEKDAY = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** Blocked nights read as unavailable at a glance: a light hatch, like a closed date on a booking site. */
const HATCH =
  "repeating-linear-gradient(135deg, transparent 0 6px, color-mix(in oklab, currentColor 12%, transparent) 6px 7px)";

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const dayOf = (iso: string): { wd: number; day: number; month: number } => {
  const d = new Date(`${iso}T00:00:00Z`);
  return { wd: d.getUTCDay(), day: d.getUTCDate(), month: d.getUTCMonth() };
};
const money = (minor: number | undefined, currency: string): string =>
  minor === undefined
    ? "—"
    : new Intl.NumberFormat(undefined, {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
      }).format(minor / 100);
const shortDate = (iso: string): string => {
  const { day, month } = dayOf(iso);
  return `${String(day)} ${MONTH[month]!}`;
};

/**
 * Portfolio calendar (spec 06 §6.2): listings and their plans down, nights across.
 * Click a night or drag across nights and a side panel edits the price, whether the
 * nights sell, the minimum stay and the finer restrictions; nothing needs a toolbar.
 * Keyboard-first stays (CAL-1: arrows move, digits type a price, Enter commits),
 * edits are optimistic with a sync dot per night (CAL-3), undo is server-backed
 * (CAL-4), conflicts show both values (CAL-5), states resolve over SSE.
 */
export function CalendarGrid({
  start,
  days: initialDays,
  propertyId,
  groups,
  labels: L,
}: {
  start: string;
  days: number;
  propertyId?: string;
  groups: Array<{ id: string; name: string }>;
  labels: CalendarLabels;
}) {
  const [days, setDays] = useState(initialDays);
  const [groupId, setGroupId] = useState<string>("");
  const [data, setData] = useState<GridProperty[]>([]);
  const [loadMs, setLoadMs] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [focus, setFocus] = useState<{ r: number; c: number } | null>(null);
  const [anchor, setAnchor] = useState<{ r: number; c: number } | null>(null);
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
  const [undoStack, setUndoStack] = useState<Array<{ id: string; propertyId: string }>>([]);
  const [bulk, setBulk] = useState<{
    preview?: { cellCount: number; warnings: string[]; blocked: string[] };
    /** The operation the preview was computed for; Apply re-runs exactly it (BULK-1). */
    ops?: unknown[];
  }>({});
  const dragging = useRef(false);
  const parentRef = useRef<HTMLDivElement>(null);
  const dates = useMemo(
    () => Array.from({ length: days }, (_, i) => addDays(start, i)),
    [start, days],
  );
  const end = dates[dates.length - 1] ?? start;
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

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
      const only = p.roomTypes.length === 1 ? p.roomTypes[0] : undefined;
      const hero =
        p.kind === "single_unit" &&
        only !== undefined &&
        only.isSystemManaged &&
        only.ratePlans.length === 1;
      if (!hero) {
        out.push({ kind: "property", key: p.id, property: p });
        if (collapsed.has(p.id)) continue;
      }
      for (const rt of p.roomTypes) {
        const single = p.kind === "single_unit" && rt.isSystemManaged;
        if (!single) out.push({ kind: "room_type", key: rt.id, property: p, roomType: rt });
        if (!single && collapsed.has(rt.id)) continue;
        for (const rp of rt.ratePlans)
          out.push({
            kind: "rate_plan",
            key: rp.id,
            property: p,
            roomType: rt,
            ratePlan: rp,
            derived: rp.parentRatePlanId !== null,
            hero,
          });
      }
    }
    return out;
  }, [data, collapsed]);

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
    estimateSize: () => COL_W,
    overscan: 4,
  });

  const cellAt = (row: Row, c: number): RateCell | undefined =>
    row.kind === "rate_plan" ? row.ratePlan.cells.find((x) => x[0] === dates[c]) : undefined;
  const selection = useMemo(() => {
    if (!focus) return null;
    const a = anchor ?? focus;
    return {
      r1: Math.min(a.r, focus.r),
      r2: Math.max(a.r, focus.r),
      c1: Math.min(a.c, focus.c),
      c2: Math.max(a.c, focus.c),
    };
  }, [focus, anchor]);
  const rangeCells = useCallback(
    (sel: { r1: number; r2: number; c1: number; c2: number }) => {
      const out: Array<{ row: PlanRow; cell: RateCell }> = [];
      for (let r = sel.r1; r <= sel.r2; r++) {
        const row = rows[r];
        if (!row || row.kind !== "rate_plan" || row.derived) continue;
        for (let c = sel.c1; c <= sel.c2; c++) {
          const cell = row.ratePlan.cells.find((x) => x[0] === dates[c]);
          if (cell) out.push({ row, cell });
        }
      }
      return out;
    },
    [rows, dates],
  );
  const selected = useMemo(() => (selection ? rangeCells(selection) : []), [selection, rangeCells]);
  const selectedPlans = useMemo(() => {
    const seen = new Map<string, PlanRow>();
    for (const t of selected) seen.set(t.row.ratePlan.id, t.row);
    return [...seen.values()];
  }, [selected]);
  const derivedOnly = useMemo(() => {
    if (!selection || selected.length > 0) return false;
    for (let r = selection.r1; r <= selection.r2; r++)
      if (rows[r]?.kind === "rate_plan") return true;
    return false;
  }, [selection, selected.length, rows]);

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

  const submitEdits = async (
    kind: "rates" | "restrictions",
    propertyId: string,
    edits: Array<{ ratePlanId: string; date: string; values: Values; expectedVersion?: number }>,
  ) => {
    for (const e of edits) patchLocal(e.ratePlanId, e.date, e.values, "pending");
    const res = await fetch(`/api/v1/ari/${kind}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ propertyId, edits }),
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
      return;
    }
    if (!res.ok) {
      setMessage(body.detail ?? fmt(L.editFailed, { status: res.status }));
      await load();
      return;
    }
    for (const o of body.outcomes ?? [])
      if (o.ok && o.version) patchLocal(o.ratePlanId, o.date, {}, "pending", o.version);
    if (body.undoId) setUndoStack((s) => [...s, { id: body.undoId!, propertyId }]);
    setMessage(L.saved);
  };

  /** Write the same values to every selected night, one request per property. */
  const writeSelection = async (kind: "rates" | "restrictions", values: Values) => {
    const byProperty = new Map<
      string,
      Array<{ ratePlanId: string; date: string; values: Values; expectedVersion?: number }>
    >();
    for (const t of selected) {
      const list = byProperty.get(t.row.property.id) ?? [];
      list.push({
        ratePlanId: t.row.ratePlan.id,
        date: t.cell[0],
        values,
        expectedVersion: t.cell[3],
      });
      byProperty.set(t.row.property.id, list);
    }
    for (const [pid, edits] of byProperty) await submitEdits(kind, pid, edits);
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
    else
      await submitEdits("rates", row.property.id, [
        {
          ratePlanId: row.ratePlan.id,
          date: cell[0],
          values: { rate: n },
          expectedVersion: cell[3],
        },
      ]);
  };

  const undo = async () => {
    const last = undoStack[undoStack.length - 1];
    if (!last) return;
    const res = await fetch(
      `/api/v1/ari/bulk/${last.id}/undo?propertyId=${encodeURIComponent(last.propertyId)}`,
      { method: "POST" },
    );
    if (res.ok) {
      setUndoStack((s) => s.slice(0, -1));
      setMessage(L.undone);
      await load();
    } else setMessage(fmt(L.editFailed, { status: res.status }));
  };

  /** A percentage change goes through the bulk operation: preview first (BULK-1), then apply. */
  const runBulk = async (dryRun: boolean, ops: unknown[]) => {
    if (!selection || selectedPlans.length === 0) return;
    const propertyId = selectedPlans[0]!.property.id;
    const body = {
      propertyId,
      dateFrom: dates[selection.c1],
      dateTo: dates[selection.c2],
      ratePlanIds: selectedPlans
        .filter((p) => p.property.id === propertyId)
        .map((p) => p.ratePlan.id),
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
      if (r.id) setUndoStack((s) => [...s, { id: r.id!, propertyId }]);
      setMessage(fmt(L.applied, { n: r.cellCount }));
      await load();
    }
  };

  const onKeyDown = async (e: React.KeyboardEvent) => {
    if (!focus) return;
    const move = (dr: number, dc: number) => {
      const r = Math.max(0, Math.min(rows.length - 1, focus.r + dr));
      const c = Math.max(0, Math.min(dates.length - 1, focus.c + dc));
      setFocus({ r, c });
      if (!e.shiftKey) setAnchor(null);
      else setAnchor((a) => a ?? focus);
      rowVirtualizer.scrollToIndex(r);
      colVirtualizer.scrollToIndex(c);
    };
    if (isEditing) {
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        await commitEdit();
        move(0, e.key === "Tab" ? 1 : 0);
      } else if (e.key === "Escape") setIsEditing(false);
      return;
    }
    if (e.key === "ArrowRight") {
      e.preventDefault();
      move(0, 1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      move(0, -1);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      move(1, 0);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      move(-1, 0);
    } else if (e.key === "Escape") {
      setFocus(null);
      setAnchor(null);
    } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      await undo();
    } else if (/^[0-9]$/.test(e.key) || e.key === "Enter") {
      const row = rows[focus.r];
      if (row?.kind === "rate_plan" && !row.derived) {
        e.preventDefault();
        const cell = cellAt(row, focus.c);
        setEditing(e.key === "Enter" ? String((cell?.[1].rate ?? 0) / 100) : e.key);
        setIsEditing(true);
      }
    }
  };

  const nightsCount = selection ? selection.c2 - selection.c1 + 1 : 0;
  const panelOpen = selection !== null && (selected.length > 0 || derivedOnly);

  return (
    <div className="space-y-3" data-testid="calendar">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <div className="flex rounded-full border border-border bg-surface p-0.5">
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
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${d === days ? "bg-foreground text-background" : "text-muted hover:text-foreground"}`}
            >
              {label}
            </button>
          ))}
        </div>
        {groups.length > 0 ? (
          <select
            className="h-8 rounded-full border border-border bg-surface px-3 text-xs"
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
          >
            <option value="">{L.allGroups}</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        ) : null}
        <Button
          variant="secondary"
          className="h-8 px-3"
          onClick={() => void undo()}
          disabled={undoStack.length === 0}
        >
          {L.undo}
        </Button>
        {message ? (
          <span className="text-xs text-muted" role="status">
            {message}
          </span>
        ) : null}
        <span className="ms-auto text-xs text-muted" data-testid="grid-stats">
          {loadMs === null
            ? ""
            : fmt(L.loadedIn, { rows: rows.length, days: dates.length, ms: loadMs })}
        </span>
      </div>

      {conflict ? (
        <div
          className="rounded-xl border border-warning/50 bg-warning-soft p-3 text-sm"
          role="alertdialog"
          data-testid="conflict"
        >
          <p className="font-medium">{L.conflictTitle}</p>
          <p className="text-xs">
            {L.mine}: {JSON.stringify(conflict.mine)} · {L.theirs}:{" "}
            {JSON.stringify(conflict.theirs)}
          </p>
          <div className="mt-2 flex gap-2">
            <Button
              className="h-7 px-2 text-xs"
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
            </Button>
            <Button
              variant="secondary"
              className="h-7 px-2 text-xs"
              onClick={() => setConflict(null)}
            >
              {L.keepTheirs}
            </Button>
          </div>
        </div>
      ) : null}

      <div className={`grid gap-3 ${panelOpen ? "lg:grid-cols-[minmax(0,1fr)_320px]" : ""}`}>
        <div
          ref={parentRef}
          className="relative h-[72vh] select-none overflow-auto rounded-2xl border border-border bg-surface outline-none"
          tabIndex={0}
          onKeyDown={(e) => void onKeyDown(e)}
          data-testid="grid-scroller"
        >
          <div
            style={{
              height: rowVirtualizer.getTotalSize() + HEADER_H,
              width: colVirtualizer.getTotalSize() + LABEL_W,
              position: "relative",
            }}
          >
            <div className="sticky top-0 z-20 flex bg-surface" style={{ height: HEADER_H }}>
              <div
                className="sticky start-0 z-30 flex items-end border-e border-b border-border bg-surface px-3 pb-2 text-[11px] text-muted"
                style={{ width: LABEL_W }}
              >
                {selection ? "" : L.selectHint}
              </div>
              {colVirtualizer.getVirtualItems().map((col) => {
                const d = dates[col.index]!;
                const { wd, day, month } = dayOf(d);
                const isToday = d === today;
                const weekend = wd === 0 || wd === 6;
                const monthStart = day === 1 || col.index === 0;
                return (
                  <div
                    key={col.key}
                    className={`absolute top-0 flex flex-col items-center justify-end border-e border-b border-border pb-1.5 text-center leading-tight ${weekend ? "bg-surface-secondary/60" : ""}`}
                    style={{ left: LABEL_W + col.start, width: COL_W, height: HEADER_H }}
                  >
                    {monthStart ? (
                      <span className="absolute start-1 top-1 text-[10px] font-medium uppercase tracking-wide text-muted">
                        {MONTH[month]}
                      </span>
                    ) : null}
                    <span className="text-[10px] uppercase text-muted">{WEEKDAY[wd]}</span>
                    <span
                      className={`mt-0.5 flex h-6 w-6 items-center justify-center rounded-full text-sm ${isToday ? "bg-foreground font-semibold text-background" : "font-medium"}`}
                      title={isToday ? L.today : undefined}
                    >
                      {day}
                    </span>
                  </div>
                );
              })}
            </div>
            {rowVirtualizer.getVirtualItems().map((vr) => {
              const row = rows[vr.index]!;
              const h = rowHeight(row);
              return (
                <div
                  key={vr.key}
                  className="absolute left-0 flex"
                  style={{ top: vr.start + HEADER_H, height: h, width: "100%" }}
                  data-row-kind={row.kind}
                >
                  <div
                    className={`sticky start-0 z-10 flex items-center gap-2 border-e border-b border-border bg-surface px-3 text-xs ${row.kind === "property" || (row.kind === "rate_plan" && row.hero) ? "" : row.kind === "room_type" ? "ps-5 text-foreground" : "ps-8 text-muted"}`}
                    style={{ width: LABEL_W }}
                  >
                    {row.kind === "property" ? (
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-center gap-2 text-start"
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
                        <ListingLabel property={row.property} />
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
                        <span className="truncate font-medium">{row.roomType.title}</span>
                      </button>
                    ) : row.hero ? (
                      <ListingLabel property={row.property} />
                    ) : (
                      <>
                        <span className="truncate">{row.ratePlan.title}</span>
                        {row.derived ? (
                          <span className="rounded-full bg-surface-secondary px-1.5 text-[10px]">
                            {L.derived}
                          </span>
                        ) : null}
                      </>
                    )}
                  </div>
                  {colVirtualizer.getVirtualItems().map((col) => {
                    const date = dates[col.index]!;
                    const r = vr.index;
                    const c = col.index;
                    const { wd } = dayOf(date);
                    const weekend = wd === 0 || wd === 6;
                    const inSelection =
                      selection &&
                      r >= selection.r1 &&
                      r <= selection.r2 &&
                      c >= selection.c1 &&
                      c <= selection.c2;
                    const focused = focus?.r === r && focus.c === c;
                    const common = `absolute border-e border-b border-border ${weekend ? "bg-surface-secondary/40" : ""} ${inSelection ? "bg-accent/15" : ""} ${focused ? "ring-2 ring-inset ring-accent" : ""}`;
                    const style = { left: LABEL_W + col.start, width: COL_W, height: h };
                    const down = (e: React.MouseEvent) => {
                      if (e.button !== 0) return;
                      e.preventDefault();
                      dragging.current = true;
                      setFocus({ r, c });
                      setAnchor(e.shiftKey ? (anchor ?? focus) : { r, c });
                      setIsEditing(false);
                      setBulk({});
                      parentRef.current?.focus();
                    };
                    const enter = () => {
                      if (dragging.current) setFocus({ r, c });
                    };
                    if (row.kind === "property") {
                      const single =
                        row.property.kind === "single_unit" ? row.property.roomTypes[0] : undefined;
                      const av = single?.cells.find((x) => x[0] === date);
                      const booked = av !== undefined && av[1] <= 0;
                      return (
                        <div
                          key={col.key}
                          className={`${common} flex items-center justify-center text-[11px] ${booked ? "text-danger" : "text-muted"}`}
                          style={{ ...style, ...(booked ? { backgroundImage: HATCH } : {}) }}
                          onMouseDown={down}
                          onMouseEnter={enter}
                        >
                          {booked ? L.booked : ""}
                        </div>
                      );
                    }
                    if (row.kind === "room_type") {
                      const av = row.roomType.cells.find((x) => x[0] === date);
                      const full = av !== undefined && av[1] <= 0;
                      return (
                        <div
                          key={col.key}
                          className={`${common} flex items-center justify-between px-2 text-[11px] ${av && av[1] < 0 ? "bg-danger-soft text-danger" : full ? "text-muted" : ""}`}
                          style={style}
                          onMouseDown={down}
                          onMouseEnter={enter}
                        >
                          {av ? (
                            <>
                              <span>{fmt(L.left, { n: av[1] })}</span>
                              <span className={`h-1.5 w-1.5 rounded-full ${DOT[av[2]]}`} />
                            </>
                          ) : null}
                        </div>
                      );
                    }
                    const cell = row.ratePlan.cells.find((x) => x[0] === date);
                    const ed = focused && isEditing;
                    const v = cell?.[1];
                    const heroAv = row.hero
                      ? row.roomType.cells.find((x) => x[0] === date)
                      : undefined;
                    const booked = heroAv !== undefined && heroAv[1] <= 0;
                    const blocked = v?.stopSell === true;
                    const note = booked
                      ? L.booked
                      : blocked
                        ? L.blocked
                        : [
                            v?.minStay && v.minStay > 1 ? `min ${String(v.minStay)}` : "",
                            v?.closedToArrival ? "CTA" : "",
                            v?.closedToDeparture ? "CTD" : "",
                          ]
                            .filter(Boolean)
                            .join(" · ");
                    return (
                      <div
                        key={col.key}
                        className={`${common} flex flex-col justify-center px-2 ${booked || blocked ? "text-muted" : row.derived ? "text-muted" : "text-foreground"}`}
                        style={{
                          ...style,
                          ...(booked || blocked ? { backgroundImage: HATCH } : {}),
                        }}
                        onMouseDown={down}
                        onMouseEnter={enter}
                        onDoubleClick={() => {
                          if (!row.derived) {
                            setEditing(String((cell?.[1].rate ?? 0) / 100));
                            setIsEditing(true);
                          }
                        }}
                        data-testid={focused ? "focused-cell" : undefined}
                        data-state={cell?.[2]}
                        data-cell={`${row.ratePlan.id}:${date}`}
                      >
                        {ed ? (
                          <input
                            autoFocus
                            className="w-full border-0 bg-surface p-0 text-[13px] font-medium outline-none"
                            value={editing}
                            onChange={(e) => setEditing(e.target.value)}
                            onBlur={() => void commitEdit()}
                            data-testid="cell-editor"
                          />
                        ) : (
                          <>
                            <div className="flex items-start justify-between gap-1">
                              <span className={`text-[13px] ${row.derived ? "" : "font-medium"}`}>
                                {money(cell?.[1].rate, row.property.currency)}
                              </span>
                              {cell ? (
                                <span
                                  className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${DOT[cell[2]]}`}
                                  title={cell[2]}
                                />
                              ) : null}
                            </div>
                            {note ? (
                              <div className="truncate text-[10px] text-muted">{note}</div>
                            ) : null}
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>

        {panelOpen && selection ? (
          <SelectionPanel
            key={`${String(selection.r1)}-${String(selection.r2)}-${String(selection.c1)}-${String(selection.c2)}`}
            L={L}
            nights={nightsCount}
            from={dates[selection.c1]!}
            to={dates[selection.c2]!}
            plans={selectedPlans}
            cells={selected}
            derivedOnly={derivedOnly}
            bulk={bulk}
            onClose={() => {
              setFocus(null);
              setAnchor(null);
              setBulk({});
            }}
            onPrice={(minor) => void writeSelection("rates", { rate: minor })}
            onRestriction={(values) => void writeSelection("restrictions", values)}
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
    </div>
  );
}

/** The editor for the selected nights: price, whether they sell, minimum stay, and the finer restrictions folded away. */
function ListingLabel({ property }: { property: GridProperty }) {
  return (
    <>
      {property.photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote listing photo, no loader configured
        <img
          src={property.photoUrl}
          alt=""
          className="h-8 w-11 shrink-0 rounded-md object-cover"
          loading="lazy"
        />
      ) : (
        <span className="flex h-8 w-11 shrink-0 items-center justify-center rounded-md bg-surface-secondary text-sm font-medium text-muted">
          {property.title.slice(0, 1).toUpperCase()}
        </span>
      )}
      <span className="truncate text-[13px] font-semibold text-foreground">{property.title}</span>
    </>
  );
}

function SelectionPanel({
  L,
  nights,
  from,
  to,
  plans,
  cells,
  derivedOnly,
  bulk,
  onClose,
  onPrice,
  onRestriction,
  onPreviewPercent,
  onApply,
  onCancelPreview,
}: {
  L: CalendarLabels;
  nights: number;
  from: string;
  to: string;
  plans: PlanRow[];
  cells: Array<{ row: PlanRow; cell: RateCell }>;
  derivedOnly: boolean;
  bulk: { preview?: { cellCount: number; warnings: string[]; blocked: string[] }; ops?: unknown[] };
  onClose: () => void;
  onPrice: (minor: number) => void;
  onRestriction: (values: Values) => void;
  onPreviewPercent: (pct: number) => void;
  onApply: () => void;
  onCancelPreview: () => void;
}) {
  const first = cells[0]?.cell[1];
  const currency = plans[0]?.property.currency ?? "EUR";
  const uniform = <K extends keyof Values>(k: K): Values[K] | undefined => {
    const v = first?.[k];
    return cells.every((c) => c.cell[1][k] === v) ? v : undefined;
  };
  const [price, setPrice] = useState(first?.rate !== undefined ? String(first.rate / 100) : "");
  const [minStay, setMinStay] = useState(String(uniform("minStay") ?? 1));
  const [pct, setPct] = useState("10");
  const [priceError, setPriceError] = useState("");
  const blocked = uniform("stopSell");
  const cta = uniform("closedToArrival") === true;
  const ctd = uniform("closedToDeparture") === true;
  const listing = plans.length === 1 ? plans[0]! : null;
  const savePrice = () => {
    const n = Math.round(Number(price) * 100);
    if (!Number.isFinite(n) || n < 0) {
      setPriceError(L.invalidPrice);
      return;
    }
    setPriceError("");
    onPrice(n);
  };
  return (
    <aside
      className="flex h-fit flex-col gap-4 rounded-2xl border border-border bg-surface p-4 text-sm lg:sticky lg:top-4"
      data-testid="selection-panel"
      aria-label={`${from} – ${to}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-base font-semibold">
            {nights === 1 ? L.night : fmt(L.nights, { n: nights })}
          </p>
          <p className="text-xs text-muted">
            {shortDate(from)}
            {nights > 1 ? ` – ${shortDate(to)}` : ""}
          </p>
          <p className="mt-1 truncate text-xs text-muted">
            {listing
              ? listing.hero
                ? listing.property.title
                : `${listing.property.title} · ${listing.ratePlan.title}`
              : plans
                  .map((p) => p.property.title)
                  .filter((t, i, a) => a.indexOf(t) === i)
                  .join(", ")}
          </p>
        </div>
        <button
          type="button"
          className="rounded-full p-1 text-muted hover:bg-surface-secondary hover:text-foreground"
          onClick={onClose}
          aria-label={L.cancel}
        >
          ✕
        </button>
      </div>

      {derivedOnly ? (
        <p className="rounded-xl bg-surface-secondary p-3 text-xs text-muted">{L.derivedNote}</p>
      ) : (
        <>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted" htmlFor="panel-price">
              {L.pricePerNight}
            </label>
            <div className="flex gap-2">
              <div className="flex flex-1 items-center rounded-xl border border-border bg-surface px-3 focus-within:ring-2 focus-within:ring-accent">
                <span className="me-1 text-muted">{currency}</span>
                <input
                  id="panel-price"
                  data-testid="panel-price"
                  inputMode="decimal"
                  className="h-10 w-full bg-transparent text-lg font-semibold outline-none"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") savePrice();
                  }}
                />
              </div>
              <Button className="h-10 px-4" onClick={savePrice} data-testid="panel-save-price">
                {L.save}
              </Button>
            </div>
            {priceError ? <p className="text-xs text-danger">{priceError}</p> : null}
          </div>

          <div className="grid grid-cols-2 gap-2" role="group">
            <button
              type="button"
              aria-pressed={blocked === false}
              data-testid="panel-open"
              onClick={() => onRestriction({ stopSell: false })}
              className={`rounded-xl border px-3 py-2 text-sm font-medium ${blocked === false ? "border-foreground bg-foreground text-background" : "border-border hover:bg-surface-secondary"}`}
            >
              {L.open}
            </button>
            <button
              type="button"
              aria-pressed={blocked === true}
              data-testid="panel-block"
              onClick={() => onRestriction({ stopSell: true })}
              className={`rounded-xl border px-3 py-2 text-sm font-medium ${blocked === true ? "border-foreground bg-foreground text-background" : "border-border hover:bg-surface-secondary"}`}
            >
              {L.blocked}
            </button>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted" htmlFor="panel-min-stay">
              {L.minStay}
            </label>
            <div className="flex items-center gap-2">
              <input
                id="panel-min-stay"
                type="number"
                min={1}
                className="h-9 w-20 rounded-xl border border-border bg-surface px-3 outline-none focus:ring-2 focus:ring-accent"
                value={minStay}
                onChange={(e) => setMinStay(e.target.value)}
              />
              <span className="text-xs text-muted">{L.nightsUnit}</span>
              <Button
                variant="secondary"
                className="ms-auto h-9 px-3"
                onClick={() => {
                  const n = Number(minStay);
                  if (Number.isInteger(n) && n >= 1) onRestriction({ minStay: n });
                }}
              >
                {L.save}
              </Button>
            </div>
          </div>

          <details className="group rounded-xl border border-border">
            <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium text-muted">
              {L.advanced}
            </summary>
            <div className="space-y-3 border-t border-border p-3">
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={cta}
                  onChange={(e) => onRestriction({ closedToArrival: e.target.checked })}
                />
                {L.closedToArrival}
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={ctd}
                  onChange={(e) => onRestriction({ closedToDeparture: e.target.checked })}
                />
                {L.closedToDeparture}
              </label>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted" htmlFor="panel-pct">
                  {L.adjustPercent}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="panel-pct"
                    data-testid="panel-pct"
                    type="number"
                    className="h-9 w-20 rounded-xl border border-border bg-surface px-3 outline-none focus:ring-2 focus:ring-accent"
                    value={pct}
                    onChange={(e) => setPct(e.target.value)}
                  />
                  <span className="text-xs text-muted">%</span>
                  <Button
                    variant="secondary"
                    className="ms-auto h-9 px-3"
                    data-testid="panel-preview-pct"
                    onClick={() => {
                      const n = Number(pct);
                      if (Number.isFinite(n) && n !== 0) onPreviewPercent(n);
                    }}
                  >
                    {L.preview}
                  </Button>
                </div>
              </div>
              {bulk.preview ? (
                <div
                  className="space-y-2 rounded-xl bg-surface-secondary p-3 text-xs"
                  data-testid="bulk-preview"
                >
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
                    <Button
                      className="h-8 px-3 text-xs"
                      data-testid="bulk-apply"
                      disabled={bulk.preview.blocked.length > 0 || !bulk.ops}
                      onClick={onApply}
                    >
                      {fmt(L.apply, { n: bulk.preview.cellCount })}
                    </Button>
                    <Button
                      variant="secondary"
                      className="h-8 px-3 text-xs"
                      onClick={onCancelPreview}
                    >
                      {L.cancel}
                    </Button>
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
