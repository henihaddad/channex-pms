"use client";

import { useState, useTransition } from "react";
import { mappingDiff, type MappingRow } from "@pms/core";
import { saveMappingsAction, type ConnectionView } from "../channels.actions";
import { MappingEditor } from "../mapping-editor";
import { Alert, Button } from "@/components/ui";

/** MAP-4: on a live connection the diff is shown and confirmed before saving. */
export function ConnectionMapping({ view }: { view: ConnectionView }) {
  const [rows, setRows] = useState<MappingRow[]>(view.mappings);
  const [confirm, setConfirm] = useState(false);
  const [saved, setSaved] = useState("");
  const [pending, start] = useTransition();
  const diff = mappingDiff(view.mappings, rows);
  const changed = diff.startsSelling.length + diff.stopsSelling.length + diff.changed.length > 0;
  const save = () =>
    start(async () => {
      const r = await saveMappingsAction({ connectionId: view.connection.id, mappings: rows });
      setSaved(
        `Saved: ${r.diff.startsSelling.length} start selling, ${r.diff.stopsSelling.length} stop, ${r.diff.changed.length} changed${view.connection.state === "active" ? "; affected plans re-pushed" : ""}`,
      );
      setConfirm(false);
    });
  return (
    <div className="space-y-3">
      <MappingEditor
        ours={view.ours}
        theirs={view.theirs}
        suggestions={view.suggestions}
        rows={rows}
        onChange={setRows}
      />
      {saved ? <Alert tone="success">{saved}</Alert> : null}
      {changed && view.connection.state === "active" && !confirm ? (
        <div
          className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm"
          data-testid="mapping-diff"
        >
          <p className="font-medium">This connection is live. Saving will:</p>
          <ul className="list-disc ps-5 text-xs">
            {diff.startsSelling.map((r) => (
              <li key={`s${r.ratePlanId}`}>
                start selling {view.ours.find((o) => o.id === r.ratePlanId)?.title} as {r.roomCode}/
                {r.rateCode}
              </li>
            ))}
            {diff.stopsSelling.map((r) => (
              <li key={`x${r.ratePlanId}`}>
                stop selling {view.ours.find((o) => o.id === r.ratePlanId)?.title} ({r.roomCode}/
                {r.rateCode})
              </li>
            ))}
            {diff.changed.map((r) => (
              <li key={`c${r.after.ratePlanId}`}>
                move {view.ours.find((o) => o.id === r.after.ratePlanId)?.title} from{" "}
                {r.before.roomCode}/{r.before.rateCode} to {r.after.roomCode}/{r.after.rateCode}
              </li>
            ))}
          </ul>
          <Button className="mt-2 h-8" onClick={() => setConfirm(true)}>
            I understand, continue
          </Button>
        </div>
      ) : null}
      <Button
        disabled={pending || !changed || (view.connection.state === "active" && !confirm)}
        onClick={save}
        data-testid="save-mappings"
      >
        Save mappings
      </Button>
    </div>
  );
}
