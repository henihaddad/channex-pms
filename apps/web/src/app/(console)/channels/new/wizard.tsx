"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AdapterDescriptor, CoverageWarning, MappingRow } from "@pms/core";
import {
  activateAction,
  createConnectionAction,
  getDescriptor,
  loadBothSides,
  testConnectionAction,
  type BothSides,
} from "../channels.actions";
import { ADAPTERS } from "@/api/schemas";
import { MappingEditor } from "../mapping-editor";
import { Alert, Button, Input, Label, Select } from "@/components/ui";

type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

/** Connection wizard (spec 07 §7.2): one screen per documented step; the settings form is generated from the descriptor (CH-1). */
export function ConnectionWizard({
  properties,
  accounts,
  initialPropertyId,
}: {
  properties: Array<{ id: string; title: string }>;
  accounts: Array<{ id: string; label: string; adapterCode: string }>;
  initialPropertyId?: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [adapterCode, setAdapterCode] = useState<(typeof ADAPTERS)[number]>("BookingCom");
  const [propertyId, setPropertyId] = useState(initialPropertyId ?? properties[0]?.id ?? "");
  const [accountId, setAccountId] = useState<string>("");
  const [descriptor, setDescriptor] = useState<AdapterDescriptor | null>(null);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [test, setTest] = useState<{ ok: boolean; message?: string; hint?: string } | null>(null);
  const [sides, setSides] = useState<BothSides | null>(null);
  const [mappings, setMappings] = useState<MappingRow[]>([]);
  const [created, setCreated] = useState<{
    connectionId: string;
    warnings: CoverageWarning[];
  } | null>(null);
  const [activation, setActivation] = useState<{ activated: boolean; issues: string[] } | null>(
    null,
  );
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<void>) =>
    start(async () => {
      setError("");
      try {
        await fn();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  const input = {
    propertyId,
    adapterCode,
    settings,
    ...(accountId ? { channelAccountId: accountId } : {}),
  };
  return (
    <div className="space-y-4" data-testid="connection-wizard" data-step={step}>
      <ol className="flex flex-wrap gap-1 text-[11px]">
        {[
          "Pick channel",
          "Settings",
          "Test",
          "Load both sides",
          "Mapping",
          "Create",
          "Readiness",
          "Activate",
        ].map((s, i) => (
          <li
            key={s}
            className={`rounded px-2 py-0.5 ${i + 1 === step ? "bg-emerald-600 text-white" : i + 1 < step ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"}`}
          >
            {i + 1}. {s}
          </li>
        ))}
      </ol>
      {error ? <Alert>{error}</Alert> : null}
      {step === 1 ? (
        <div className="grid grid-cols-3 gap-4">
          <div>
            <Label htmlFor="adapter">Channel</Label>
            <Select
              id="adapter"
              value={adapterCode}
              onChange={(e) => setAdapterCode(e.target.value as (typeof ADAPTERS)[number])}
            >
              {ADAPTERS.map((a) => (
                <option key={a} value={a}>
                  {a === "BookingCom" ? "Booking.com" : a}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="property">Property</Label>
            <Select
              id="property"
              value={propertyId}
              onChange={(e) => setPropertyId(e.target.value)}
            >
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="account">Shared account (optional)</Label>
            <Select id="account" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">None</option>
              {accounts
                .filter((a) => a.adapterCode === adapterCode)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
            </Select>
          </div>
          <Button
            className="col-span-3 w-fit"
            disabled={pending || !propertyId}
            onClick={() =>
              run(async () => {
                setDescriptor(await getDescriptor({ adapterCode }));
                setStep(2);
              })
            }
            data-testid="wizard-next"
          >
            Next
          </Button>
        </div>
      ) : null}
      {step === 2 && descriptor ? (
        <div className="space-y-3">
          {descriptor.fields.map((f) => (
            <div key={f.name}>
              <Label htmlFor={`f-${f.name}`}>
                {f.label}
                {f.required ? " *" : ""}
                {!["string", "text", "password", "select", "number"].includes(f.type) ? (
                  <span className="ms-2 text-xs text-amber-700">
                    unknown field type &quot;{f.type}&quot;, shown as text
                  </span>
                ) : null}
              </Label>
              {f.type === "select" && f.options ? (
                <Select
                  id={`f-${f.name}`}
                  value={settings[f.name] ?? ""}
                  onChange={(e) => setSettings({ ...settings, [f.name]: e.target.value })}
                >
                  <option value="">—</option>
                  {f.options.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </Select>
              ) : (
                <Input
                  id={`f-${f.name}`}
                  type={
                    f.type === "password" ? "password" : f.type === "number" ? "number" : "text"
                  }
                  value={settings[f.name] ?? ""}
                  onChange={(e) => setSettings({ ...settings, [f.name]: e.target.value })}
                  required={f.required}
                  placeholder={f.help}
                  data-testid={`field-${f.name}`}
                />
              )}
              {f.help ? <p className="text-xs text-slate-500">{f.help}</p> : null}
            </div>
          ))}
          <Button
            disabled={pending}
            onClick={() =>
              run(async () => {
                const r = await testConnectionAction(input);
                setTest(r);
                setStep(3);
              })
            }
            data-testid="wizard-test"
          >
            Test connection
          </Button>
        </div>
      ) : null}
      {step === 3 && test ? (
        <div className="space-y-3">
          <Alert tone={test.ok ? "success" : "error"}>
            {test.ok ? "Connection OK" : `Provider says: ${test.message ?? "failed"}`}
            {test.hint ? ` · Likely cause: ${test.hint}` : ""}
          </Alert>
          {test.ok ? (
            <Button
              disabled={pending}
              onClick={() =>
                run(async () => {
                  const s = await loadBothSides(input);
                  setSides(s);
                  setMappings(
                    s.suggestions.map((x) => ({
                      ratePlanId: x.ratePlanId,
                      roomCode: x.roomCode,
                      rateCode: x.rateCode,
                      ...(x.occupancy !== undefined ? { occupancy: x.occupancy } : {}),
                    })),
                  );
                  setStep(5);
                })
              }
              data-testid="wizard-load"
            >
              Load both sides
            </Button>
          ) : (
            <Button variant="secondary" onClick={() => setStep(2)}>
              Back to settings
            </Button>
          )}
        </div>
      ) : null}
      {step === 5 && sides ? (
        <div className="space-y-3">
          <MappingEditor
            ours={sides.ours}
            theirs={sides.theirs}
            suggestions={sides.suggestions}
            rows={mappings}
            onChange={setMappings}
          />
          <Button
            disabled={pending || mappings.length === 0}
            onClick={() =>
              run(async () => {
                const r = await createConnectionAction({ ...input, mappings });
                setCreated(r);
                setStep(7);
              })
            }
            data-testid="wizard-create"
          >
            Create connection (inactive)
          </Button>
        </div>
      ) : null}
      {step === 7 && created ? (
        <div className="space-y-3">
          <Alert tone="success">Connection created inactive (CH-4).</Alert>
          {created.warnings.map((w) => (
            <p key={w.ref + w.code} className="text-xs text-amber-700">
              {w.message}
            </p>
          ))}
          <Button
            disabled={pending}
            onClick={() =>
              run(async () => {
                const r = await activateAction({ connectionId: created.connectionId });
                setActivation(r);
                setStep(8);
              })
            }
            data-testid="wizard-activate"
          >
            Check readiness and activate
          </Button>
        </div>
      ) : null}
      {step === 8 && activation && created ? (
        <div className="space-y-3">
          {activation.activated ? (
            <Alert tone="success">
              Active. A full ARI push for the horizon is queued (CH-6); watch the calendar dots turn
              green.
            </Alert>
          ) : (
            <Alert>Not ready: {activation.issues.join("; ")}</Alert>
          )}
          <Button
            variant="secondary"
            onClick={() =>
              router.push(activation.activated ? "/channels" : `/channels/${created.connectionId}`)
            }
            data-testid="wizard-done"
          >
            {activation.activated ? "Go to health board" : "Fix mapping"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
