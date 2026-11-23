"use client";

import { useState, useTransition } from "react";
import { mappingDiff, type MappingRow } from "@pms/core";
import { saveMappingsAction, type ConnectionView } from "../channels.actions";
import { MappingEditor, type MappingLabels } from "../mapping-editor";
import { fill } from "../fill";
import { Alert, Button } from "@/components/ui";

/** Raw messages from `channels.mapping`, filled here. */
export interface ConnectionMappingLabels {
  liveTitle: string;
  startSelling: string;
  stopSelling: string;
  move: string;
  save: string;
  saveLive: string;
  saving: string;
  saved: string;
  savedLive: string;
  failed: string;
  editor: MappingLabels;
}

/** MAP-4: on a live connection the change is spelled out before saving, and the button says what it does. */
export function ConnectionMapping({
  view,
  channel,
  labels: L,
}: {
  view: ConnectionView;
  channel: string;
  labels: ConnectionMappingLabels;
}) {
  const [rows, setRows] = useState<MappingRow[]>(view.mappings);
  const [saved, setSaved] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const diff = mappingDiff(view.mappings, rows);
  const changed = diff.startsSelling.length + diff.stopsSelling.length + diff.changed.length > 0;
  const live = view.connection.state === "active";
  const plan = (id: string) => view.ours.find((o) => o.id === id)?.title ?? id;
  const room = (r: MappingRow) => {
    const theirs = view.theirs.find((x) => x.code === r.roomCode);
    return {
      room: theirs?.title ?? r.roomCode,
      rate: theirs?.rates.find((x) => x.code === r.rateCode)?.title ?? r.rateCode,
    };
  };
  const save = () =>
    start(async () => {
      setError("");
      try {
        const r = await saveMappingsAction({ connectionId: view.connection.id, mappings: rows });
        if (r.error !== undefined) {
          setError(r.error);
          return;
        }
        const counts = {
          start: r.diff.startsSelling.length,
          stop: r.diff.stopsSelling.length,
          changed: r.diff.changed.length,
          channel,
        };
        setSaved(`${fill(L.saved, counts)}${live ? ` ${fill(L.savedLive, counts)}` : ""}`);
      } catch (e) {
        setError(e instanceof Error && e.message ? e.message : L.failed);
      }
    });
  return (
    <div className="space-y-3">
      <MappingEditor
        ours={view.ours}
        theirs={view.theirs}
        suggestions={view.suggestions}
        rows={rows}
        onChange={setRows}
        labels={L.editor}
      />
      {saved ? <Alert tone="success">{saved}</Alert> : null}
      {error ? <Alert>{error}</Alert> : null}
      {changed && live ? (
        <div
          className="rounded-md border border-warning/50 bg-warning-soft p-3 text-sm"
          data-testid="mapping-diff"
        >
          <p className="font-medium">{fill(L.liveTitle, { channel })}</p>
          <ul className="list-disc ps-5 text-xs">
            {diff.startsSelling.map((r) => (
              <li key={`s${r.ratePlanId}`}>
                {fill(L.startSelling, { plan: plan(r.ratePlanId), ...room(r) })}
              </li>
            ))}
            {diff.stopsSelling.map((r) => (
              <li key={`x${r.ratePlanId}`}>
                {fill(L.stopSelling, { plan: plan(r.ratePlanId), ...room(r) })}
              </li>
            ))}
            {diff.changed.map((r) => {
              const from = room(r.before);
              const to = room(r.after);
              return (
                <li key={`c${r.after.ratePlanId}`}>
                  {fill(L.move, {
                    plan: plan(r.after.ratePlanId),
                    fromRoom: from.room,
                    fromRate: from.rate,
                    toRoom: to.room,
                    toRate: to.rate,
                  })}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
      <Button
        disabled={pending || !changed}
        aria-busy={pending || undefined}
        onClick={save}
        data-testid="save-mappings"
      >
        {pending ? L.saving : live && changed ? fill(L.saveLive, { channel }) : L.save}
      </Button>
    </div>
  );
}
