"use client";

import { Fragment, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import type { PaymentRule } from "@pms/core";
import {
  Button,
  Card,
  Chip,
  Input,
  Label,
  Select,
  TBody,
  THead,
  Table,
  Td,
  Th,
  Tr,
} from "@/components/ui";
import { channelLabel, money } from "@/lib/format";
import { deletePaymentRule, savePaymentRule, type PaymentRulesView } from "./payments.actions";

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
  onDone,
}: {
  rule: PaymentRule;
  properties: PaymentRulesView["properties"];
  onDone: () => void;
}) {
  const t = useTranslations("payments");
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
      onDone();
    });
  return (
    <div
      className="grid items-end gap-3 rounded-xl border border-border bg-surface p-4 sm:grid-cols-[2fr_1.4fr_1fr_1.4fr_1fr]"
      data-testid="payment-rule"
    >
      <div>
        <Label>{t("name")}</Label>
        <Input
          value={r.name}
          onChange={(e) => setR({ ...r, name: e.target.value })}
          placeholder={t("namePlaceholder")}
        />
      </div>
      <Select
        label={t("when")}
        value={r.trigger}
        onChange={(v) => setR({ ...r, trigger: v as PaymentRule["trigger"] })}
      >
        <option value="confirmation">{t("confirmation")}</option>
        <option value="before_arrival">{t("beforeArrival")}</option>
        <option value="after_arrival">{t("afterArrival")}</option>
      </Select>
      {r.trigger === "confirmation" ? (
        <span />
      ) : (
        <div>
          <Label>{t("days")}</Label>
          <Input
            type="number"
            min={0}
            value={String(r.offsetDays)}
            onChange={(e) => setR({ ...r, offsetDays: Number(e.target.value) })}
          />
        </div>
      )}
      <Select
        label={t("take")}
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
        <option value="percent">{t("percent")}</option>
        <option value="fixed">{t("fixed")}</option>
        <option value="remainder">{t("remainder")}</option>
      </Select>
      {r.amount.kind === "remainder" ? (
        <span />
      ) : (
        <div>
          <Label>{t("value")}</Label>
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
      <div className="sm:col-span-5">
        <Label>{t("properties")}</Label>
        <div className="flex flex-wrap gap-3 text-sm">
          <Label>
            <input
              type="checkbox"
              className="me-1"
              checked={r.propertyIds.length === 0}
              onChange={() => setR({ ...r, propertyIds: [] })}
            />
            {t("allProperties")}
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
          <Label>
            <input
              type="checkbox"
              className="me-1"
              checked={r.enabled}
              onChange={(e) => setR({ ...r, enabled: e.target.checked })}
            />
            {t("enabled")}
          </Label>
        </div>
      </div>
      <div className="flex gap-2 sm:col-span-5">
        <Button onClick={submit} disabled={pending || r.name.trim() === ""} size="sm">
          {t("save")}
        </Button>
        <Button variant="ghost" size="sm" disabled={pending} onClick={onDone}>
          {t("cancel")}
        </Button>
        {r.id ? (
          <Button
            variant="danger"
            size="sm"
            className="ms-auto"
            disabled={pending}
            onClick={() => start(async () => (await deletePaymentRule({ id: r.id }), onDone()))}
          >
            {t("remove")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The organisation's payment rules as the design lists them (board "Payment rules"): one row
 * per rule in the order they run, with when, which channels and properties, how much and
 * whether it is on. Editing opens the rule's form under its row.
 */
export function RulesTable({ view }: { view: PaymentRulesView }) {
  const t = useTranslations("payments");
  const locale = useLocale();
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const done = () => {
    setEditing(null);
    router.refresh();
  };
  const when = (r: PaymentRule) =>
    r.trigger === "confirmation"
      ? t("whenConfirmed")
      : r.offsetDays === 0
        ? t("whenArrival")
        : t(r.trigger === "before_arrival" ? "whenBefore" : "whenAfter", { n: r.offsetDays });
  const channels = (r: PaymentRule) =>
    r.channels.length === 0
      ? t("all")
      : r.channels.map((c) => channelLabel(c, t("directShort"))).join(", ");
  const properties = (r: PaymentRule) =>
    r.propertyIds.length === 0
      ? t("all")
      : r.propertyIds
          .map((id) => view.properties.find((p) => p.id === id)?.title ?? "—")
          .join(", ");
  const amount = (r: PaymentRule) =>
    r.amount.kind === "percent"
      ? t("amountPercent", { pct: r.amount.percentBps / 100 })
      : r.amount.kind === "fixed"
        ? money(r.amount.amountMinor, view.currency, locale)
        : t("amountRemainder");
  return (
    <Card
      title={t("title")}
      description={t("order")}
      actions={
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setEditing("new")}
          data-testid="add-payment-rule"
        >
          + {t("add")}
        </Button>
      }
    >
      <Table data-testid="payment-rules">
        <THead>
          <Tr className="hover:bg-transparent">
            <Th>{t("rule")}</Th>
            <Th>{t("when")}</Th>
            <Th>{t("channels")}</Th>
            <Th>{t("properties")}</Th>
            <Th>{t("amount")}</Th>
            <Th />
          </Tr>
        </THead>
        <TBody>
          {view.rules.length === 0 && editing !== "new" ? (
            <Tr>
              <Td colSpan={6} className="text-muted">
                {t("noRules")}
              </Td>
            </Tr>
          ) : null}
          {view.rules.map((r) => (
            <Fragment key={r.id}>
              <Tr data-testid="payment-rule-row" data-enabled={r.enabled ? "1" : "0"}>
                <Td className="font-semibold">{r.name}</Td>
                <Td>{when(r)}</Td>
                <Td>{channels(r)}</Td>
                <Td>{properties(r)}</Td>
                <Td>{amount(r)}</Td>
                <Td className="text-end whitespace-nowrap">
                  <Chip color={r.enabled ? "success" : "default"} size="sm">
                    {r.enabled ? t("on") : t("off")}
                  </Chip>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ms-2"
                    onClick={() => setEditing(editing === r.id ? null : r.id)}
                  >
                    {t("edit")}
                  </Button>
                </Td>
              </Tr>
              {editing === r.id ? (
                <Tr className="hover:bg-transparent">
                  <Td colSpan={6} className="bg-surface-secondary">
                    <RuleForm rule={r} properties={view.properties} onDone={done} />
                  </Td>
                </Tr>
              ) : null}
            </Fragment>
          ))}
          {editing === "new" ? (
            <Tr className="hover:bg-transparent">
              <Td colSpan={6} className="bg-surface-secondary">
                <RuleForm rule={empty()} properties={view.properties} onDone={done} />
              </Td>
            </Tr>
          ) : null}
        </TBody>
      </Table>
    </Card>
  );
}
