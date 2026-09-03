"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Button } from "@/components/ui";

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
    };

const COL_W = 72;
const ROW_H = 30;
const LABEL_W = 240;
const DOT: Record<SyncState, string> = {
  pending: "bg-muted",
  in_flight: "bg-accent",
  synced: "bg-success",
  failed: "bg-danger",
  conflicted: "bg-warning",
};

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const badges = (v: Values): string[] =>
  [
    v.minStay && v.minStay > 1 ? `MIN${v.minStay}` : "",
    v.maxStay ? `MAX${v.maxStay}` : "",
    v.closedToArrival ? "CTA" : "",
    v.closedToDeparture ? "CTD" : "",
    v.stopSell ? "STOP" : "",
  ].filter(Boolean);
const money = (minor: number | undefined, currency: string): string =>
  minor === undefined
    ? "—"
    : new Intl.NumberFormat(undefined, {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
      }).format(minor / 100);

/**
 * Portfolio calendar (spec 06 §6.2): rows are properties → room types → rate
 * plans, columns are dates, both virtualised. Keyboard-first (CAL-1),
 * optimistic with per-cell sync state (CAL-3), server-backed undo (CAL-4),
 * version conflicts surfaced with both values (CAL-5), realtime via SSE.
 */
export function CalendarGrid({
  start,
  days: initialDays,
  propertyId,
  groups,
}: {
  start: string;
  days: number;
  propertyId?: string;
  groups: Array<{ id: string; name: string }>;
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
    open: boolean;
    preview?: { cellCount: number; warnings: string[]; blocked: string[] };
  }>({ open: false });
  const parentRef = useRef<HTMLDivElement>(null);
  const dates = useMemo(
    () => Array.from({ length: days }, (_, i) => addDays(start, i)),
    [start, days],
  );
  const end = dates[dates.length - 1] ?? start;

  const load = useCallback(async () => {
    const t0 = performance.now();
    const q = new URLSearchParams({ from: start, to: end });
    if (propertyId) q.set("propertyId", propertyId);
    if (groupId) q.set("groupId", groupId);
    const res = await fetch(`/api/v1/ari/grid?${q.toString()}`, { cache: "no-store" });
    if (!res.ok) {
      setMessage(`Load failed (${res.status})`);
      return;
    }
    const body = (await res.json()) as { properties: GridProperty[] };
    setData(body.properties);
    setLoadMs(Math.round(performance.now() - t0));
  }, [start, end, propertyId, groupId]);
  useEffect(() => {
    void load();
  }, [load]);

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
      out.push({ kind: "property", key: p.id, property: p });
      if (collapsed.has(p.id)) continue;
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
          });
      }
    }
    return out;
  }, [data, collapsed]);

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_H,
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
  const selectedPlans = useMemo(() => {
    if (!selection) return [];
    const out: Array<{ propertyId: string; ratePlanId: string }> = [];
    for (let r = selection.r1; r <= selection.r2; r++) {
      const row = rows[r];
      if (row?.kind === "rate_plan" && !row.derived)
        out.push({ propertyId: row.property.id, ratePlanId: row.ratePlan.id });
    }
    return out;
  }, [selection, rows]);

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
      setMessage(body.detail ?? `Edit failed (${res.status})`);
      await load();
      return;
    }
    for (const o of body.outcomes ?? [])
      if (o.ok && o.version) patchLocal(o.ratePlanId, o.date, {}, "pending", o.version);
    if (body.undoId) setUndoStack((s) => [...s, { id: body.undoId!, propertyId }]);
  };

  const commitEdit = async () => {
    if (!focus || !isEditing) return;
    const row = rows[focus.r];
    const cell = row ? cellAt(row, focus.c) : undefined;
    setIsEditing(false);
    if (!row || row.kind !== "rate_plan" || !cell) return;
    const n = Math.round(Number(editing) * 100);
    if (!Number.isFinite(n) || n < 0) return;
    const targets =
      selection && (selection.r1 !== selection.r2 || selection.c1 !== selection.c2)
        ? rangeCells(selection)
        : [{ row, cell }];
    const byProperty = new Map<
      string,
      Array<{ ratePlanId: string; date: string; values: Values; expectedVersion?: number }>
    >();
    for (const t of targets) {
      const list = byProperty.get(t.row.property.id) ?? [];
      list.push({
        ratePlanId: t.row.ratePlan.id,
        date: t.cell[0],
        values: { rate: n },
        expectedVersion: t.cell[3],
      });
      byProperty.set(t.row.property.id, list);
    }
    for (const [pid, edits] of byProperty) await submitEdits("rates", pid, edits);
  };
  const rangeCells = (sel: { r1: number; r2: number; c1: number; c2: number }) => {
    const out: Array<{ row: Extract<Row, { kind: "rate_plan" }>; cell: RateCell }> = [];
    for (let r = sel.r1; r <= sel.r2; r++) {
      const row = rows[r];
      if (!row || row.kind !== "rate_plan" || row.derived) continue;
      for (let c = sel.c1; c <= sel.c2; c++) {
        const cell = cellAt(row, c);
        if (cell) out.push({ row, cell });
      }
    }
    return out;
  };
  const applyRestriction = async (values: Values) => {
    if (!selection) return;
    const byProperty = new Map<
      string,
      Array<{ ratePlanId: string; date: string; values: Values; expectedVersion?: number }>
    >();
    for (const t of rangeCells(selection)) {
      const list = byProperty.get(t.row.property.id) ?? [];
      list.push({
        ratePlanId: t.row.ratePlan.id,
        date: t.cell[0],
        values,
        expectedVersion: t.cell[3],
      });
      byProperty.set(t.row.property.id, list);
    }
    for (const [pid, edits] of byProperty) await submitEdits("restrictions", pid, edits);
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
      setMessage("Undone");
      await load();
    } else setMessage(`Undo failed (${res.status})`);
  };
  const runBulk = async (dryRun: boolean, ops: unknown[]) => {
    if (!selection || selectedPlans.length === 0) return;
    const propertyId = selectedPlans[0]!.propertyId;
    const body = {
      propertyId,
      dateFrom: dates[selection.c1],
      dateTo: dates[selection.c2],
      ratePlanIds: selectedPlans
        .filter((p) => p.propertyId === propertyId)
        .map((p) => p.ratePlanId),
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
      setMessage(r.detail ?? `Bulk failed (${res.status})`);
      return;
    }
    if (dryRun || !r.applied) setBulk({ open: true, preview: r });
    else {
      setBulk({ open: false });
      if (r.id) setUndoStack((s) => [...s, { id: r.id!, propertyId }]);
      setMessage(`Applied to ${r.cellCount} cells`);
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

  return (
    <div className="space-y-2" data-testid="calendar">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {[14, 30, 60, 90].map((d) => (
          <Button
            key={d}
            variant={d === days ? "primary" : "secondary"}
            onClick={() => setDays(d)}
            className="h-8 px-3"
          >
            {d}d
          </Button>
        ))}
        <select
          className="h-8 rounded-md border border-border-secondary px-2"
          value={groupId}
          onChange={(e) => setGroupId(e.target.value)}
        >
          <option value="">All groups</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
        <Button
          variant="secondary"
          className="h-8 px-3"
          onClick={() => void undo()}
          disabled={undoStack.length === 0}
        >
          Undo
        </Button>
        {selection && selectedPlans.length > 0 ? (
          <div
            className="flex flex-wrap items-center gap-1 rounded-md border border-border bg-white px-2 py-1"
            data-testid="range-toolbar"
          >
            <span className="text-xs text-muted">{rangeCells(selection).length} cells</span>
            <Button
              variant="secondary"
              className="h-7 px-2 text-xs"
              onClick={() => void applyRestriction({ stopSell: true })}
            >
              Stop sell
            </Button>
            <Button
              variant="secondary"
              className="h-7 px-2 text-xs"
              onClick={() =>
                void applyRestriction({
                  stopSell: false,
                  closedToArrival: false,
                  closedToDeparture: false,
                })
              }
            >
              Open
            </Button>
            <Button
              variant="secondary"
              className="h-7 px-2 text-xs"
              onClick={() => void applyRestriction({ closedToArrival: true })}
            >
              CTA
            </Button>
            <Button
              variant="secondary"
              className="h-7 px-2 text-xs"
              onClick={() => void applyRestriction({ closedToDeparture: true })}
            >
              CTD
            </Button>
            <Button
              variant="secondary"
              className="h-7 px-2 text-xs"
              onClick={() => {
                const v = prompt("Minimum stay (nights)", "2");
                if (v) void applyRestriction({ minStay: Number(v) });
              }}
            >
              Min stay
            </Button>
            <Button
              variant="secondary"
              className="h-7 px-2 text-xs"
              onClick={() => {
                const v = prompt("Adjust rate by % (e.g. 10 or -15)", "10");
                if (v)
                  void runBulk(true, [
                    { op: "adjust_rate_percent", basisPoints: Math.round(Number(v) * 100) },
                  ]);
              }}
            >
              Adjust %
            </Button>
            <Button
              variant="secondary"
              className="h-7 px-2 text-xs"
              onClick={() => {
                const v = prompt("Set rate", "120");
                if (v)
                  void runBulk(true, [{ op: "set_rate", rateMinor: Math.round(Number(v) * 100) }]);
              }}
            >
              Set rate…
            </Button>
          </div>
        ) : null}
        <span className="ms-auto text-xs text-muted" data-testid="grid-stats">
          {rows.length} rows · {dates.length} days
          {loadMs !== null ? ` · loaded in ${loadMs} ms` : ""}
        </span>
      </div>
      {message ? (
        <p className="text-xs text-muted" role="status">
          {message}
        </p>
      ) : null}
      {conflict ? (
        <div
          className="rounded-md border border-warning/50 bg-warning-soft p-3 text-sm"
          role="alertdialog"
          data-testid="conflict"
        >
          <p className="font-medium">Someone changed this cell since you loaded it.</p>
          <p className="text-xs">
            Yours: {JSON.stringify(conflict.mine)} · Theirs: {JSON.stringify(conflict.theirs)}
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
              Keep mine
            </Button>
            <Button
              variant="secondary"
              className="h-7 px-2 text-xs"
              onClick={() => setConflict(null)}
            >
              Take theirs
            </Button>
          </div>
        </div>
      ) : null}
      {bulk.open && bulk.preview ? (
        <div
          className="rounded-md border border-border-secondary bg-white p-3 text-sm"
          data-testid="bulk-preview"
        >
          <p className="font-medium">Dry run: {bulk.preview.cellCount} cells would change.</p>
          {bulk.preview.warnings.map((w) => (
            <p key={w} className="text-xs text-warning-soft-foreground">
              {w}
            </p>
          ))}
          {bulk.preview.blocked.map((w) => (
            <p key={w} className="text-xs text-danger">
              Blocked: {w}
            </p>
          ))}
          <div className="mt-2 flex gap-2">
            <Button
              className="h-7 px-2 text-xs"
              disabled={bulk.preview.blocked.length > 0}
              onClick={() => setBulk({ open: false })}
            >
              Close
            </Button>
            <span className="text-xs text-muted">
              Re-run the operation from the toolbar to apply; the preview is mandatory (BULK-1).
            </span>
          </div>
        </div>
      ) : null}
      <div
        ref={parentRef}
        className="relative h-[70vh] overflow-auto rounded-lg border border-border bg-white outline-none"
        tabIndex={0}
        onKeyDown={(e) => void onKeyDown(e)}
        data-testid="grid-scroller"
      >
        <div
          style={{
            height: rowVirtualizer.getTotalSize() + ROW_H,
            width: colVirtualizer.getTotalSize() + LABEL_W,
            position: "relative",
          }}
        >
          <div className="sticky top-0 z-20 flex bg-background" style={{ height: ROW_H }}>
            <div
              className="sticky start-0 z-30 border-e border-border bg-background"
              style={{ width: LABEL_W }}
            />
            {colVirtualizer.getVirtualItems().map((col) => {
              const d = dates[col.index]!;
              const wd = new Date(`${d}T00:00:00Z`).getUTCDay();
              return (
                <div
                  key={col.key}
                  className={`absolute top-0 border-e border-border px-1 text-center text-[10px] leading-tight ${wd === 0 || wd === 6 ? "bg-background" : ""}`}
                  style={{ left: LABEL_W + col.start, width: COL_W, height: ROW_H }}
                >
                  <div className="text-muted">{["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"][wd]}</div>
                  <div>{d.slice(5)}</div>
                </div>
              );
            })}
          </div>
          {rowVirtualizer.getVirtualItems().map((vr) => {
            const row = rows[vr.index]!;
            return (
              <div
                key={row.key}
                className="absolute left-0 flex"
                style={{ top: vr.start + ROW_H, height: ROW_H, width: "100%" }}
                data-row-kind={row.kind}
              >
                <div
                  className={`sticky start-0 z-10 flex items-center gap-1 truncate border-e border-b border-border bg-white px-2 text-xs ${row.kind === "property" ? "font-semibold" : row.kind === "room_type" ? "ps-4 text-foreground" : "ps-7 text-muted"}`}
                  style={{ width: LABEL_W }}
                >
                  {row.kind !== "rate_plan" ? (
                    <button
                      className="w-4 text-muted"
                      onClick={() =>
                        setCollapsed((s) => {
                          const n = new Set(s);
                          const k = row.kind === "property" ? row.property.id : row.roomType.id;
                          if (n.has(k)) n.delete(k);
                          else n.add(k);
                          return n;
                        })
                      }
                    >
                      {collapsed.has(row.kind === "property" ? row.property.id : row.roomType.id)
                        ? "▸"
                        : "▾"}
                    </button>
                  ) : null}
                  <span className="truncate">
                    {row.kind === "property"
                      ? row.property.title
                      : row.kind === "room_type"
                        ? row.roomType.title
                        : row.ratePlan.title}
                  </span>
                  {row.kind === "rate_plan" && row.derived ? (
                    <span className="rounded bg-background px-1 text-[10px]">derived</span>
                  ) : null}
                  {row.kind === "property" ? (
                    <span className="ms-auto text-[10px] text-muted">{row.property.state}</span>
                  ) : null}
                </div>
                {colVirtualizer.getVirtualItems().map((col) => {
                  const date = dates[col.index]!;
                  const r = vr.index;
                  const c = col.index;
                  const selected =
                    selection &&
                    r >= selection.r1 &&
                    r <= selection.r2 &&
                    c >= selection.c1 &&
                    c <= selection.c2;
                  const focused = focus?.r === r && focus.c === c;
                  const common = `absolute border-e border-b border-border text-[11px] ${selected ? "bg-success-soft" : ""} ${focused ? "ring-2 ring-inset ring-success" : ""}`;
                  const style = { left: LABEL_W + col.start, width: COL_W, height: ROW_H };
                  const click = (e: React.MouseEvent) => {
                    setFocus({ r, c });
                    setAnchor(e.shiftKey ? (anchor ?? focus) : null);
                    setIsEditing(false);
                    parentRef.current?.focus();
                  };
                  if (row.kind === "property") {
                    const single =
                      row.property.kind === "single_unit" ? row.property.roomTypes[0] : undefined;
                    const av = single?.cells.find((x) => x[0] === date);
                    return (
                      <div
                        key={col.key}
                        className={`${common} flex items-center justify-center bg-background/60 ${av && av[1] <= 0 ? "text-danger" : "text-muted"}`}
                        style={style}
                        onClick={click}
                      >
                        {av ? `${av[1]} left` : ""}
                      </div>
                    );
                  }
                  if (row.kind === "room_type") {
                    const av = row.roomType.cells.find((x) => x[0] === date);
                    return (
                      <div
                        key={col.key}
                        className={`${common} flex items-center justify-between px-1 ${av && av[1] < 0 ? "bg-danger-soft text-danger" : ""}`}
                        style={style}
                        onClick={click}
                      >
                        {av ? (
                          <>
                            <span>
                              {av[1]}/{row.roomType.countOfRooms}
                            </span>
                            <span className={`h-1.5 w-1.5 rounded-full ${DOT[av[2]]}`} />
                          </>
                        ) : null}
                      </div>
                    );
                  }
                  const cell = row.ratePlan.cells.find((x) => x[0] === date);
                  const ed = focused && isEditing;
                  return (
                    <div
                      key={col.key}
                      className={`${common} flex flex-col justify-center px-1 ${cell?.[1].stopSell ? "bg-danger-soft" : ""} ${row.derived ? "text-muted" : ""}`}
                      style={style}
                      onClick={click}
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
                          className="w-full border-0 bg-white p-0 text-[11px] outline-none"
                          value={editing}
                          onChange={(e) => setEditing(e.target.value)}
                          onBlur={() => void commitEdit()}
                          data-testid="cell-editor"
                        />
                      ) : (
                        <>
                          <div className="flex items-center justify-between">
                            <span>{money(cell?.[1].rate, row.property.currency)}</span>
                            {cell ? (
                              <span
                                className={`h-1.5 w-1.5 rounded-full ${DOT[cell[2]]}`}
                                title={cell[2]}
                              />
                            ) : null}
                          </div>
                          {cell && badges(cell[1]).length > 0 ? (
                            <div className="truncate text-[9px] text-muted">
                              {badges(cell[1]).join(" ")}
                            </div>
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
      <p className="text-xs text-muted">
        Arrows move · type a number then Enter to set the rate · Shift+arrows select a range ·
        Ctrl/Cmd+Z undo · dot: grey pending, blue in flight, green synced, red failed, amber drift
      </p>
    </div>
  );
}
