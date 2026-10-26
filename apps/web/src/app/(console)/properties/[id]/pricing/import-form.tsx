"use client";

import { useState, useTransition } from "react";
import { Alert, Button, Card, Label, Select, Textarea } from "@/components/ui";
import {
  importRatesAction,
  saveRateImportAction,
  undoImportAction,
  type ImportPreview,
} from "./pricing.actions";

interface Props {
  propertyId: string;
  ratePlans: Array<{ id: string; title: string }>;
  labels: {
    heading: string;
    intro: string;
    paste: string;
    dryRun: string;
    running: string;
    apply: string;
    override: string;
    nothingRead: string;
    cells: string;
    noChange: string;
    applied: string;
    undo: string;
    refused: string;
    unmapped: string;
    held: string;
    outside: string;
    parseErrors: string;
    readColumns: string;
    before: string;
    after: string;
    mapTitle: string;
    mapBody: string;
    allRows: string;
    saveMapping: string;
  };
}

/**
 * Dry run first, always (BULK-1). Apply is a second, separate press, and the operation id
 * it returns is the undo. Nothing here decides anything: the plan comes from core.
 */
export function ImportForm({ propertyId, ratePlans, labels }: Props) {
  const [csv, setCsv] = useState("");
  const [override, setOverride] = useState(false);
  const [result, setResult] = useState<ImportPreview | null>(null);
  const [pending, start] = useTransition();

  const run = (apply: boolean) => {
    const fd = new FormData();
    fd.set("propertyId", propertyId);
    fd.set("csv", csv);
    if (override) fd.set("override", "on");
    if (apply) fd.set("apply", "1");
    start(async () => {
      setResult(await importRatesAction(fd));
    });
  };

  const plan = result?.plan;
  return (
    <Card title={labels.heading} description={labels.intro}>
      <Textarea
        value={csv}
        onChange={(e) => setCsv(e.target.value)}
        rows={6}
        placeholder={"date,listing_id,price,min_stay\n2026-10-04,L1,120.00,2"}
        className="w-full rounded border border-border-secondary p-2 font-mono text-xs"
        data-testid="import-csv"
        aria-label={labels.paste}
      />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button
          type="button"
          onClick={() => run(false)}
          disabled={pending || csv.trim() === ""}
          data-testid="dry-run-import"
        >
          {pending ? labels.running : labels.dryRun}
        </Button>
        {plan && plan.cellCount > 0 && !result.applied ? (
          <Button
            type="button"
            variant="primary"
            onClick={() => run(true)}
            disabled={pending}
            data-testid="apply-import"
          >
            {labels.apply} ({plan.cellCount})
          </Button>
        ) : null}
        <Label className="flex items-center gap-2 text-xs font-normal">
          <input
            type="checkbox"
            checked={override}
            onChange={(e) => setOverride(e.target.checked)}
            data-testid="import-override"
          />
          {labels.override}
        </Label>
      </div>

      {result ? (
        <div className="mt-4 space-y-3 text-sm" data-testid="import-result">
          {result.parseErrors.length > 0 ? (
            <Alert tone="warning" title={labels.parseErrors}>
              <ul className="list-inside list-disc" data-testid="parse-errors">
                {result.parseErrors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </Alert>
          ) : null}
          {Object.keys(result.columns).length > 0 ? (
            <p className="text-xs text-muted">
              {labels.readColumns}:{" "}
              {Object.entries(result.columns)
                .map(([field, column]) => `${field} ← ${String(column)}`)
                .join(", ")}
            </p>
          ) : null}
          {!plan ? (
            <p data-testid="nothing-read">{labels.nothingRead}</p>
          ) : (
            <>
              {result.applied ? (
                <Alert tone="success" title={labels.applied}>
                  <form action={undoImportAction} className="mt-1">
                    <input type="hidden" name="propertyId" value={propertyId} />
                    <input type="hidden" name="operationId" value={result.undoId ?? ""} />
                    <Button type="submit" variant="secondary" size="sm" data-testid="undo-import">
                      {labels.undo}
                    </Button>
                  </form>
                </Alert>
              ) : (
                <p data-testid="import-cells">
                  {plan.cellCount > 0
                    ? `${String(plan.cellCount)} ${labels.cells}`
                    : labels.noChange}
                </p>
              )}
              {plan.warnings.map((w) => (
                <p key={w} className="text-warning-soft-foreground">
                  {w}
                </p>
              ))}
              {plan.samples.length > 0 ? (
                <ul className="text-xs text-muted" data-testid="import-samples">
                  {plan.samples.map((s) => (
                    <li key={`${s.ratePlanId}|${s.date}`}>
                      {s.date}: {labels.before} {String(s.before.rate ?? "—")} → {labels.after}{" "}
                      {String(s.after.rate ?? "—")}
                    </li>
                  ))}
                </ul>
              ) : null}
              {plan.refused.length > 0 ? (
                <div data-testid="import-refused">
                  <p className="font-medium text-danger">
                    {labels.refused} ({plan.refused.length})
                  </p>
                  <ul className="text-xs">
                    {plan.refused.slice(0, 10).map((r) => (
                      <li key={`${r.row.listingRef}|${r.row.date}`}>
                        {r.row.date}: {r.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {plan.unmapped.length > 0 ? (
                <Alert tone="info" title={labels.mapTitle} data-testid="import-unmapped">
                  <p>{labels.mapBody}</p>
                  <form
                    action={saveRateImportAction}
                    className="mt-2 flex flex-wrap items-end gap-3"
                  >
                    <input type="hidden" name="propertyId" value={propertyId} />
                    {[...new Set(plan.unmapped.map((r) => r.listingRef))].map((ref) => (
                      <div key={ref}>
                        <Label htmlFor={`map.${ref}`}>{ref || labels.allRows}</Label>
                        <Select id={`map.${ref}`} name={`map.${ref}`} defaultValue="">
                          <option value="">—</option>
                          {ratePlans.map((rp) => (
                            <option key={rp.id} value={rp.id}>
                              {rp.title}
                            </option>
                          ))}
                        </Select>
                      </div>
                    ))}
                    <Button type="submit" size="sm" data-testid="save-mapping">
                      {labels.saveMapping}
                    </Button>
                  </form>
                </Alert>
              ) : null}
              {plan.held.length > 0 ? (
                <p className="text-xs" data-testid="import-held">
                  {labels.held}: {plan.held.length}
                </p>
              ) : null}
              {plan.outsideHorizon.length > 0 ? (
                <p className="text-xs" data-testid="import-outside">
                  {labels.outside}: {plan.outsideHorizon.length}
                </p>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </Card>
  );
}
