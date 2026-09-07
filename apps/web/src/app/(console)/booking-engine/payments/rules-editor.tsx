"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PaymentRule } from "@pms/core";
import { Button, Card, Input, Label, Select } from "@/components/ui";
import { deletePaymentRule, savePaymentRule, type PaymentRulesView } from "./payments.actions";

export interface RuleLabels {
  add: string;
  name: string;
  when: string;
  confirmation: string;
  beforeArrival: string;
  afterArrival: string;
  days: string;
  take: string;
  percent: string;
  fixed: string;
  remainder: string;
  value: string;
  properties: string;
  allProperties: string;
  channels: string;
  allChannels: string;
  direct: string;
  enabled: string;
  save: string;
  remove: string;
  saved: string;
  example: string;
  exampleHint: string;
  uncovered: string;
}

const money = (minor: number, currency: string) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency }).format(minor / 100);

const empty = (): PaymentRule => ({
  id: "",
  name: "",
  trigger: "before_arrival",
  offsetDays: 14,
  amount: { kind: "remainder" },
  propertyIds: [],
  channels: ["direct"],
  enabled: true,
  position: 10,
});

/** One rule's form; the same shape edits an existing rule and creates a new one. */
function RuleForm({
  rule,
  properties,
  labels: L,
  onSaved,
}: {
  rule: PaymentRule;
  properties: PaymentRulesView["properties"];
  labels: RuleLabels;
  onSaved: () => void;
}) {
  const [r, setR] = useState(rule);
  const [pending, start] = useTransition();
  const value =
    r.amount.kind === "percent"
      ? r.amount.percentBps / 100
      : r.amount.kind === "fixed"
        ? r.amount.amountMinor / 100
        : 0;
  const submit = () =>
    start(async () => {
      await savePaymentRule({
        id: r.id || undefined,
        name: r.name,
        trigger: r.trigger,
        offsetDays: r.offsetDays,
        amountKind: r.amount.kind,
        amountValue: value,
        propertyIds: r.propertyIds,
        channels: r.channels,
        enabled: r.enabled,
        position: r.position,
      });
      onSaved();
    });
  return (
    <div
      className="grid items-end gap-3 rounded-xl border border-border p-4 sm:grid-cols-[2fr_1.4fr_1fr_1.4fr_1fr_auto]"
      data-testid="payment-rule"
    >
      <div>
        <Label>{L.name}</Label>
        <Input
          value={r.name}
          onChange={(e) => setR({ ...r, name: e.target.value })}
          placeholder="Balance before arrival"
        />
      </div>
      <Select
        label={L.when}
        value={r.trigger}
        onChange={(v) => setR({ ...r, trigger: v as PaymentRule["trigger"] })}
      >
        <option value="confirmation">{L.confirmation}</option>
        <option value="before_arrival">{L.beforeArrival}</option>
        <option value="after_arrival">{L.afterArrival}</option>
      </Select>
      {r.trigger === "confirmation" ? (
        <span />
      ) : (
        <div>
          <Label>{L.days}</Label>
          <Input
            type="number"
            min={0}
            value={String(r.offsetDays)}
            onChange={(e) => setR({ ...r, offsetDays: Number(e.target.value) })}
          />
        </div>
      )}
      <Select
        label={L.take}
        value={r.amount.kind}
        onChange={(v) =>
          setR({
            ...r,
            amount:
              v === "percent"
                ? { kind: "percent", percentBps: 3000 }
                : v === "fixed"
                  ? { kind: "fixed", amountMinor: 10_000 }
                  : { kind: "remainder" },
          })
        }
      >
        <option value="percent">{L.percent}</option>
        <option value="fixed">{L.fixed}</option>
        <option value="remainder">{L.remainder}</option>
      </Select>
      {r.amount.kind === "remainder" ? (
        <span />
      ) : (
        <div>
          <Label>{L.value}</Label>
          <Input
            type="number"
            min={0}
            step="0.01"
            value={String(value)}
            onChange={(e) =>
              setR({
                ...r,
                amount:
                  r.amount.kind === "percent"
                    ? { kind: "percent", percentBps: Math.round(Number(e.target.value) * 100) }
                    : { kind: "fixed", amountMinor: Math.round(Number(e.target.value) * 100) },
              })
            }
          />
        </div>
      )}
      <div className="flex gap-2">
        <Button onClick={submit} disabled={pending || r.name.trim() === ""} size="sm">
          {L.save}
        </Button>
        {r.id ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => start(async () => (await deletePaymentRule({ id: r.id }), onSaved()))}
          >
            {L.remove}
          </Button>
        ) : null}
      </div>
      <div className="sm:col-span-6">
        <Label>{L.properties}</Label>
        <div className="flex flex-wrap gap-3 text-sm">
          <Label>
            <input
              type="checkbox"
              className="me-1"
              checked={r.propertyIds.length === 0}
              onChange={() => setR({ ...r, propertyIds: [] })}
            />
            {L.allProperties}
          </Label>
          {properties.map((p) => (
            <Label key={p.id}>
              <input
                type="checkbox"
                className="me-1"
                checked={r.propertyIds.includes(p.id)}
                onChange={(e) =>
                  setR({
                    ...r,
                    propertyIds: e.target.checked
                      ? [...r.propertyIds, p.id]
                      : r.propertyIds.filter((x) => x !== p.id),
                  })
                }
              />
              {p.title}
            </Label>
          ))}
        </div>
      </div>
    </div>
  );
}

/** The organisation's payment rules, with a worked example of what they collect. */
export function RulesEditor({ view, labels: L }: { view: PaymentRulesView; labels: RuleLabels }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const collected = view.example.reduce((n, i) => n + i.amountMinor, 0);
  const refresh = () => {
    setAdding(false);
    router.refresh();
  };
  return (
    <div className="space-y-5">
      <Card title={L.example} description={L.exampleHint}>
        {view.example.length === 0 ? (
          <p className="text-sm text-muted">{L.uncovered}</p>
        ) : (
          <ul className="text-sm">
            {view.example.map((i, n) => (
              <li key={n} className="flex justify-between border-t border-border py-1.5">
                <span>
                  {i.name} <span className="text-muted">· {i.dueOn}</span>
                </span>
                <span className="tabular-nums">{money(i.amountMinor, view.currency)}</span>
              </li>
            ))}
            {collected < 100_000 ? (
              <li className="flex justify-between border-t border-border py-1.5 text-warning">
                <span>{L.uncovered}</span>
                <span className="tabular-nums">{money(100_000 - collected, view.currency)}</span>
              </li>
            ) : null}
          </ul>
        )}
      </Card>
      <div className="space-y-3">
        {view.rules.map((r) => (
          <RuleForm key={r.id} rule={r} properties={view.properties} labels={L} onSaved={refresh} />
        ))}
        {adding ? (
          <RuleForm rule={empty()} properties={view.properties} labels={L} onSaved={refresh} />
        ) : (
          <Button
            variant="secondary"
            onClick={() => setAdding(true)}
            data-testid="add-payment-rule"
          >
            + {L.add}
          </Button>
        )}
      </div>
    </div>
  );
}
