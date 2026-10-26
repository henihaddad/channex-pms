"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, Chip, Select } from "@/components/ui";
import type { CalendarLabels } from "@/components/calendar-labels";

type Values = {
  rate?: number;
  minStay?: number;
  maxStay?: number;
  closedToArrival?: boolean;
  closedToDeparture?: boolean;
  stopSell?: boolean;
};
type SyncState = "pending" | "in_flight" | "synced" | "failed" | "conflicted";
interface GridRatePlan {
  id: string;
  title: string;
  parentRatePlanId: string | null;
  cells: Array<[string, Values, SyncState, number]>;
}
interface GridRoomType {
  id: string;
  title: string;
  countOfRooms: number;
  isSystemManaged: boolean;
  cells: Array<[string, number, SyncState, number]>;
  ratePlans: GridRatePlan[];
}
interface GridProperty {
  id: string;
  title: string;
  kind: string;
  currency: string;
  state: string;
  roomTypes: GridRoomType[];
}

const DOT: Record<SyncState, string> = {
  pending: "bg-muted",
  in_flight: "bg-accent",
  synced: "bg-success",
  failed: "bg-danger",
  conflicted: "bg-warning",
};
const addDays = (iso: string, n: number): string => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const money = (minor: number | undefined, currency: string): string =>
  minor === undefined ? "—" : `${(minor / 100).toFixed(2)} ${currency}`;
const fmt = (s: string, vars: Record<string, string | number>): string =>
  s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));

/**
 * CAL-9: one day, read first. A 400-cell grid does not work on a phone and we do not
 * pretend otherwise — this is the night a manager is standing in, every listing's price,
 * availability and minimum stay in a list, and the one action that matters away from a
 * desk: close a night out, or open it again.
 */
export function CalendarDayView({
  date,
  propertyId,
  groups,
  labels: L,
  onDateChange,
}: {
  date: string;
  propertyId?: string;
  groups: Array<{ id: string; name: string }>;
  labels: CalendarLabels;
  onDateChange: (date: string) => void;
}) {
  const [groupId, setGroupId] = useState("");
  const [data, setData] = useState<GridProperty[] | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
  const [undo, setUndo] = useState<{ id: string; propertyId: string } | null>(null);
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  // The state lands in the fetch's own callback, never synchronously in the effect body.
  const load = useCallback(() => {
    const q = new URLSearchParams({ from: date, to: date });
    if (propertyId) q.set("propertyId", propertyId);
    if (groupId) q.set("groupId", groupId);
    return fetch(`/api/v1/ari/grid?${q.toString()}`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) {
          setMessage(fmt(L.loadFailed, { status: res.status }));
          return;
        }
        setData(((await res.json()) as { properties: GridProperty[] }).properties);
      })
      .catch(() => {
        setMessage(fmt(L.loadFailed, { status: 0 }));
      });
  }, [date, propertyId, groupId, L.loadFailed]);
  useEffect(() => {
    void load();
  }, [load]);

  /** Stop-sell every plan of one property for this night, through the ordinary bulk path. */
  const setStopSell = async (p: GridProperty, stop: boolean) => {
    const ratePlanIds = p.roomTypes.flatMap((rt) => rt.ratePlans.map((rp) => rp.id));
    if (ratePlanIds.length === 0) return;
    setBusy(p.id);
    setMessage("");
    const res = await fetch("/api/v1/ari/bulk", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        propertyId: p.id,
        dateFrom: date,
        dateTo: date,
        ratePlanIds,
        ops: [{ op: "stop_sell", stop }],
        dryRun: false,
      }),
    });
    setBusy("");
    if (!res.ok) {
      setMessage(fmt(L.editFailed, { status: res.status }));
      return;
    }
    const body = (await res.json()) as { id: string | null };
    if (body.id) setUndo({ id: body.id, propertyId: p.id });
    setMessage(stop ? L.closedOut : L.reopened);
    await load();
  };

  const undoLast = async () => {
    if (!undo) return;
    await fetch(`/api/v1/ari/bulk/${undo.id}/undo`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ propertyId: undo.propertyId }),
    });
    setUndo(null);
    setMessage(L.undone);
    await load();
  };

  return (
    <div className="space-y-3" data-testid="calendar-day-view" data-date={date}>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => onDateChange(addDays(date, -1))}
          aria-label={L.prevDay}
          data-testid="day-prev"
        >
          ←
        </Button>
        <input
          type="date"
          value={date}
          onChange={(e) => onDateChange(e.target.value)}
          className="h-9 rounded-xl border border-border bg-surface px-3 text-sm"
          data-testid="day-date"
          aria-label={L.dayView}
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => onDateChange(addDays(date, 1))}
          aria-label={L.nextDay}
          data-testid="day-next"
        >
          →
        </Button>
        {date !== today ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => onDateChange(today)}>
            {L.today}
          </Button>
        ) : null}
        {groups.length > 0 ? (
          <Select
            value={groupId}
            onChange={setGroupId}
            size="sm"
            label={L.allGroups}
            testId="day-group"
          >
            <option value="">{L.allGroups}</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </Select>
        ) : null}
      </div>

      {message ? (
        <Alert tone="info" data-testid="day-message">
          {message}
          {undo ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void undoLast()}
              className="ms-2"
              data-testid="day-undo"
            >
              {L.undo}
            </Button>
          ) : null}
        </Alert>
      ) : null}

      {data === null ? (
        <p className="text-sm text-muted">{L.loading}</p>
      ) : data.length === 0 ? (
        <p className="text-sm text-muted" data-testid="day-empty">
          {L.noProperties}
        </p>
      ) : (
        data.map((p) => {
          const plans = p.roomTypes.flatMap((rt) => rt.ratePlans);
          const allStopped =
            plans.length > 0 && plans.every((rp) => rp.cells[0]?.[1].stopSell === true);
          return (
            <Card
              key={p.id}
              data-testid="day-property"
              title={
                <span className="flex flex-wrap items-center gap-2">
                  {p.title}
                  {allStopped ? (
                    <Chip color="warning" data-testid="day-stopped">
                      {L.stopSold}
                    </Chip>
                  ) : null}
                </span>
              }
              actions={
                plans.length > 0 ? (
                  <Button
                    type="button"
                    variant={allStopped ? "secondary" : "primary"}
                    size="sm"
                    disabled={busy === p.id}
                    onClick={() => {
                      if (allStopped || window.confirm(L.closeOutConfirm))
                        void setStopSell(p, !allStopped);
                    }}
                    data-testid="day-close-out"
                  >
                    {allStopped ? L.reopen : L.closeOut}
                  </Button>
                ) : null
              }
            >
              <div className="space-y-3">
                {p.roomTypes.map((rt) => {
                  const avail = rt.cells[0];
                  return (
                    <div key={rt.id} data-testid="day-room-type">
                      <p className="flex items-baseline gap-2 text-sm">
                        {rt.isSystemManaged && p.kind === "single_unit" ? null : (
                          <span className="font-medium">{rt.title}</span>
                        )}
                        <span className="text-muted" data-testid="day-availability">
                          {fmt(L.roomsLeft, {
                            left: avail?.[1] ?? 0,
                            of: rt.countOfRooms,
                          })}
                        </span>
                        {avail ? (
                          <span
                            className={`inline-block h-1.5 w-1.5 rounded-full ${DOT[avail[2]]}`}
                            title={avail[2]}
                            aria-label={avail[2]}
                          />
                        ) : null}
                      </p>
                      <ul className="mt-1 space-y-1">
                        {rt.ratePlans.map((rp) => {
                          const cell = rp.cells[0];
                          const v = cell?.[1] ?? {};
                          return (
                            <li
                              key={rp.id}
                              className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-border py-1.5 text-sm"
                              data-testid="day-rate-plan"
                            >
                              <span className="min-w-0 flex-1 truncate">
                                {rp.title}
                                {rp.parentRatePlanId ? (
                                  <span className="ms-1 text-xs text-muted">({L.derived})</span>
                                ) : null}
                              </span>
                              <span className="tabular-nums font-medium" data-testid="day-rate">
                                {money(v.rate, p.currency)}
                              </span>
                              {v.minStay ? (
                                <span className="text-xs text-muted">
                                  {L.minStay} {v.minStay}
                                </span>
                              ) : null}
                              {v.closedToArrival ? (
                                <Chip color="default">{L.closedToArrival}</Chip>
                              ) : null}
                              {v.closedToDeparture ? (
                                <Chip color="default">{L.closedToDeparture}</Chip>
                              ) : null}
                              {v.stopSell ? <Chip color="warning">{L.stopSold}</Chip> : null}
                              {cell ? (
                                <span
                                  className={`inline-block h-1.5 w-1.5 rounded-full ${DOT[cell[2]]}`}
                                  title={cell[2]}
                                  aria-label={cell[2]}
                                />
                              ) : null}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </Card>
          );
        })
      )}
    </div>
  );
}
