"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AdapterDescriptor, CoverageWarning, MappingRow } from "@pms/core";
import {
  activateAction,
  createConnectionAction,
  getDescriptor,
  loadBothSides,
  saveMappingsAction,
  testConnectionAction,
  type BothSides,
} from "../channels.actions";
import { ADAPTERS } from "@/api/adapters";
import { MappingEditor, type MappingLabels } from "../mapping-editor";
import { channelOf } from "../channel-meta";
import { fill } from "../fill";
import { Alert, Button, buttonClasses, cn, Input, Label, Select } from "@/components/ui";

/** The steps as the host sees them: loading both sides happens inside "Test", creating inside "Match rooms". */
export type VisibleStep = "channel" | "settings" | "test" | "match" | "golive" | "done";

/** Raw messages from `channels.wizard`; `{channel}`, `{message}`, `{hint}` and `{issues}` are filled here. */
export interface WizardLabels {
  stepsLabel: string;
  steps: Record<VisibleStep, string>;
  channel: string;
  property: string;
  account: string;
  none: string;
  next: string;
  nextPending: string;
  back: string;
  airbnbBody: string;
  airbnbButton: string;
  unknownType: string;
  test: string;
  testing: string;
  testOk: string;
  testFailed: string;
  testFailedNoMessage: string;
  likelyCause: string;
  load: string;
  loading: string;
  create: string;
  creating: string;
  saveRooms: string;
  saving: string;
  created: string;
  activate: string;
  activating: string;
  live: string;
  notReady: string;
  notReadyNoReason: string;
  goChannels: string;
  fixRooms: string;
  failed: string;
  mapping: MappingLabels;
}

type Step = 1 | 2 | 3 | 5 | 7 | 8;
const VISIBLE: Array<[Step, VisibleStep]> = [
  [1, "channel"],
  [2, "settings"],
  [3, "test"],
  [5, "match"],
  [7, "golive"],
  [8, "done"],
];
const KNOWN_TYPES = ["string", "text", "password", "select", "number"];
type Busy = "next" | "test" | "load" | "create" | "activate";

/** Connection wizard (spec 07 §7.2): one screen per documented step; the settings form is generated from the descriptor (CH-1). */
export function ConnectionWizard({
  properties,
  accounts,
  initialPropertyId,
  labels: L,
}: {
  properties: Array<{ id: string; title: string }>;
  accounts: Array<{ id: string; label: string; adapterCode: string }>;
  initialPropertyId?: string;
  labels: WizardLabels;
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
  const [busy, setBusy] = useState<Busy | null>(null);
  const [pending, start] = useTransition();
  const channelName = channelOf(adapterCode).name;
  const run = (what: Busy, fn: () => Promise<void>) =>
    start(async () => {
      setError("");
      setBusy(what);
      try {
        await fn();
      } catch (e) {
        // production hides a thrown action's message: never leave the alert empty
        setError(e instanceof Error && e.message ? e.message : L.failed);
      } finally {
        setBusy(null);
      }
    });
  const label = (what: Busy, idle: string, working: string) =>
    pending && busy === what ? working : idle;
  const input = {
    propertyId,
    adapterCode,
    settings,
    ...(accountId ? { channelAccountId: accountId } : {}),
  };
  const back = (to: Step) => (
    <Button variant="secondary" disabled={pending} onClick={() => setStep(to)}>
      {L.back}
    </Button>
  );
  const current = VISIBLE.findIndex(([n]) => n === step);
  return (
    <div className="space-y-4" data-testid="connection-wizard" data-step={step}>
      <ol className="flex flex-wrap gap-1 text-xs" aria-label={L.stepsLabel}>
        {VISIBLE.map(([n, key], i) => (
          <li
            key={key}
            data-step={n}
            aria-current={i === current ? "step" : undefined}
            className={cn(
              "rounded px-2 py-0.5",
              i === current
                ? "bg-accent font-semibold text-accent-foreground"
                : i < current
                  ? "bg-success-soft text-success-soft-foreground"
                  : "bg-background text-muted",
            )}
          >
            {i + 1}. {L.steps[key]}
          </li>
        ))}
      </ol>
      {error ? <Alert>{error}</Alert> : null}
      {step === 1 && adapterCode === "AirBNB" ? (
        <Alert tone="info" data-testid="airbnb-oauth">
          {L.airbnbBody}
        </Alert>
      ) : null}
      {step === 1 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <Select
              label={L.channel}
              value={adapterCode}
              onChange={(v) => setAdapterCode(v as (typeof ADAPTERS)[number])}
            >
              {ADAPTERS.map((a) => (
                <option key={a} value={a}>
                  {channelOf(a).name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Select label={L.property} value={propertyId} onChange={(v) => setPropertyId(v)}>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Select label={L.account} value={accountId} onChange={(v) => setAccountId(v)}>
              <option value="">{L.none}</option>
              {accounts
                .filter((a) => a.adapterCode === adapterCode)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
            </Select>
          </div>
          {adapterCode === "AirBNB" ? (
            // Airbnb is authorised with Airbnb's own sign-in (CH-5): no settings to fill in here
            <a
              href={`/api/v1/channels/oauth/airbnb/start?propertyId=${encodeURIComponent(propertyId)}`}
              className={buttonClasses("primary", "md", "w-fit sm:col-span-3")}
              data-testid="wizard-connect-airbnb"
            >
              {L.airbnbButton}
            </a>
          ) : (
            <Button
              className="w-fit sm:col-span-3"
              disabled={pending || !propertyId}
              onClick={() =>
                run("next", async () => {
                  setDescriptor(await getDescriptor({ adapterCode }));
                  setStep(2);
                })
              }
              data-testid="wizard-next"
            >
              {label("next", L.next, L.nextPending)}
            </Button>
          )}
        </div>
      ) : null}
      {step === 2 && descriptor ? (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            run("test", async () => {
              setTest(await testConnectionAction(input));
              setStep(3);
            });
          }}
        >
          {descriptor.fields.map((f) => (
            <div key={f.name}>
              <Label htmlFor={`f-${f.name}`}>
                {f.label}
                {f.required ? " *" : ""}
                {!KNOWN_TYPES.includes(f.type) ? (
                  <span className="ms-2 text-xs text-warning-soft-foreground">{L.unknownType}</span>
                ) : null}
              </Label>
              {f.type === "select" && f.options ? (
                <Select
                  id={`f-${f.name}`}
                  value={settings[f.name] ?? ""}
                  onChange={(v) => setSettings({ ...settings, [f.name]: v })}
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
                  // extranet ids and secrets: never the browser's saved login, never spellchecked
                  autoComplete={f.type === "password" ? "new-password" : "off"}
                  spellCheck={false}
                  value={settings[f.name] ?? ""}
                  onChange={(e) => setSettings({ ...settings, [f.name]: e.target.value })}
                  required={f.required}
                  placeholder={f.help}
                  aria-describedby={f.help ? `f-${f.name}-help` : undefined}
                  data-testid={`field-${f.name}`}
                />
              )}
              {f.help ? (
                <p id={`f-${f.name}-help`} className="text-xs text-muted">
                  {f.help}
                </p>
              ) : null}
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            {back(1)}
            <Button type="submit" disabled={pending} data-testid="wizard-test">
              {label("test", L.test, L.testing)}
            </Button>
          </div>
        </form>
      ) : null}
      {step === 3 && test ? (
        <div className="space-y-3">
          <Alert tone={test.ok ? "success" : "error"}>
            {test.ok
              ? L.testOk
              : test.message
                ? fill(L.testFailed, { channel: channelName, message: test.message })
                : fill(L.testFailedNoMessage, { channel: channelName })}
            {test.hint ? ` ${fill(L.likelyCause, { hint: test.hint })}` : ""}
          </Alert>
          <div className="flex flex-wrap gap-2">
            {back(2)}
            {test.ok ? (
              <Button
                disabled={pending}
                onClick={() =>
                  run("load", async () => {
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
                {label("load", L.load, L.loading)}
              </Button>
            ) : null}
          </div>
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
            labels={L.mapping}
          />
          <div className="flex flex-wrap gap-2">
            {back(3)}
            <Button
              disabled={pending || mappings.length === 0}
              onClick={() =>
                run("create", async () => {
                  if (created) {
                    // back from "Go live": the connection exists, so the rooms are saved onto it
                    const r = await saveMappingsAction({
                      connectionId: created.connectionId,
                      mappings,
                    });
                    setCreated({ ...created, warnings: r.warnings });
                    setStep(7);
                    return;
                  }
                  const r = await createConnectionAction({ ...input, mappings });
                  if (r.error) {
                    setError(r.error);
                    return;
                  }
                  setCreated(r);
                  setStep(7);
                })
              }
              data-testid="wizard-create"
            >
              {created
                ? label("create", L.saveRooms, L.saving)
                : label("create", L.create, L.creating)}
            </Button>
          </div>
        </div>
      ) : null}
      {step === 7 && created ? (
        <div className="space-y-3">
          <Alert tone="success">{fill(L.created, { channel: channelName })}</Alert>
          {created.warnings.map((w) => (
            <p key={w.ref + w.code} className="text-xs text-warning-soft-foreground">
              {w.message}
            </p>
          ))}
          <div className="flex flex-wrap gap-2">
            {back(5)}
            <Button
              disabled={pending}
              onClick={() =>
                run("activate", async () => {
                  setActivation(await activateAction({ connectionId: created.connectionId }));
                  setStep(8);
                })
              }
              data-testid="wizard-activate"
            >
              {label("activate", L.activate, L.activating)}
            </Button>
          </div>
        </div>
      ) : null}
      {step === 8 && activation && created ? (
        <div className="space-y-3">
          {activation.activated ? (
            <Alert tone="success">{fill(L.live, { channel: channelName })}</Alert>
          ) : (
            <Alert>
              {activation.issues.length > 0
                ? fill(L.notReady, { issues: activation.issues.join("; ") })
                : fill(L.notReadyNoReason, { channel: channelName })}
            </Alert>
          )}
          <div className="flex flex-wrap gap-2">
            {activation.activated ? null : back(7)}
            <Button
              variant="secondary"
              onClick={() =>
                router.push(
                  activation.activated ? "/channels" : `/channels/${created.connectionId}`,
                )
              }
              data-testid="wizard-done"
            >
              {activation.activated ? L.goChannels : L.fixRooms}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
