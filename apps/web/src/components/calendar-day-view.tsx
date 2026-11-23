"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "next-intl";
import { Alert, announce, Button, buttonClasses, Card, Chip, Select } from "@/components/ui";
import type { CalendarLabels } from "@/components/calendar-labels";
import {
  addDays,
  fmt,
  plural,
  SyncMark,
  syncWord,
  type GridProperty,
  type SyncState,
} from "@/components/calendar-shared";
import { day, money as moneyText } from "@/lib/format";

type DayProperty = Pick<GridProperty, "id" | "title" | "kind" | "currency" | "state" | "roomTypes">;

/** A night's sync state as a mark and, for a screen reader, in words. */
function SyncLabel({ state, L }: { state: SyncState; L: CalendarLabels }) {
  return (
    <span className="inline-flex items-center" title={syncWord(state, L)}>
      <SyncMark state={state} />
      <span className="sr-only">{syncWord(state, L)}</span>
    </span>
  );
}

/**
 * CAL-9: one day, read first. A 400-cell grid does not work on a phone and we do not
 * pretend otherwise — this is the night a manager is standing in, every listing's price,
 * availability and minimum stay in a list, and the one action that matters away from a
 * desk: block a night, or open it again.
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
  const locale = useLocale();
  const [groupId, setGroupId] = useState("");
  const [data, setData] = useState<DayProperty[] | null>(null);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [busy, setBusy] = useState("");
  const [undo, setUndo] = useState<{ id: string; propertyId: string } | null>(null);
  const [confirming, setConfirming] = useState<DayProperty | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const say = useCallback((text: string, error = false) => {
    setMessage({ text, error });
    // the visible note is not a live region; errors are, through role="alert"
    if (!error) announce(text);
  }, []);

  // The state lands in the fetch's own callback, never synchronously in the effect body.
  const load = useCallback(() => {
    const q = new URLSearchParams({ from: date, to: date });
    if (propertyId) q.set("propertyId", propertyId);
    if (groupId) q.set("groupId", groupId);
    return fetch(`/api/v1/ari/grid?${q.toString()}`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) {
          say(L.loadFailed, true);
          return;
        }
        setData(((await res.json()) as { properties: DayProperty[] }).properties);
      })
      .catch(() => say(L.loadFailed, true));
  }, [date, propertyId, groupId, L.loadFailed, say]);
  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (confirming) dialog.current?.showModal();
  }, [confirming]);

  /** Stop-sell every plan of one property for this night, through the ordinary bulk path. */
  const setStopSell = async (p: DayProperty, stop: boolean) => {
    const ratePlanIds = p.roomTypes.flatMap((rt) => rt.ratePlans.map((rp) => rp.id));
    if (ratePlanIds.length === 0) return;
    setBusy(p.id);
    setMessage(null);
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
      say(L.editFailed, true);
      return;
    }
    const body = (await res.json()) as { id: string | null };
    if (body.id) setUndo({ id: body.id, propertyId: p.id });
    say(stop ? L.closedOut : L.reopened);
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
    say(L.undone);
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
          className="h-9 rounded-xl border border-border-control bg-surface px-3 text-sm"
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
        <Alert
          tone={message.error ? "error" : "info"}
          live={message.error}
          data-testid="day-message"
        >
          {message.text}
          {undo && !message.error ? (
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
                    aria-haspopup={allStopped ? undefined : "dialog"}
                    onClick={() => {
                      if (allStopped) void setStopSell(p, false);
                      else setConfirming(p);
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
                        {avail ? <SyncLabel state={avail[2]} L={L} /> : null}
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
                                {moneyText(v.rate, p.currency, locale)}
                              </span>
                              {v.minStay ? (
                                <span className="text-xs text-muted">
                                  {L.minStay}: {plural(L.nights, { n: v.minStay }, locale)}
                                </span>
                              ) : null}
                              {v.closedToArrival ? (
                                <Chip color="default">{L.closedToArrival}</Chip>
                              ) : null}
                              {v.closedToDeparture ? (
                                <Chip color="default">{L.closedToDeparture}</Chip>
                              ) : null}
                              {v.stopSell ? <Chip color="warning">{L.stopSold}</Chip> : null}
                              {cell ? <SyncLabel state={cell[2]} L={L} /> : null}
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

      {/* blocking a night reaches every channel: say so and ask, with specific answers */}
      <dialog
        ref={dialog}
        aria-labelledby="close-out-title"
        onClose={() => setConfirming(null)}
        className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-card border border-border bg-surface p-5 text-foreground shadow-float backdrop:bg-foreground/40"
        data-testid="day-close-out-dialog"
      >
        <p id="close-out-title" className="font-display text-lg font-bold">
          {confirming
            ? `${confirming.title} · ${fmt(L.closeOutConfirm, { date: day(date, locale) })}`
            : ""}
        </p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            autoFocus
            onClick={() => dialog.current?.close()}
            className={buttonClasses("secondary", "md")}
          >
            {L.closeOutConfirmNo}
          </button>
          <button
            type="button"
            data-testid="day-close-out-confirm"
            className={buttonClasses("primary", "md")}
            onClick={() => {
              const p = confirming;
              dialog.current?.close();
              if (p) void setStopSell(p, true);
            }}
          >
            {L.closeOutConfirmYes}
          </button>
        </div>
      </dialog>
    </div>
  );
}
