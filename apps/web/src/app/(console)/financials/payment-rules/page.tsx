import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Card, Chip, DataTable, Facts, PageHeader, Stat } from "@/components/ui";
import { amounts } from "@/components/finance";
import { dayMonth, money } from "@/lib/format";
import { guard } from "@/server/guard";
import { loadPaymentRules } from "../../booking-engine/payments/payments.actions";
import { RulesTable } from "../../booking-engine/payments/rules-editor";

/**
 * Payment rules (spec 10 §10.4, design board "Payment rules"), under Financials where the
 * design puts them: what the rules collected, failed, hold and refunded; the rules in the
 * order they run; and what a change in a stay's total does to each instalment, worked on
 * the organisation's own rules.
 */
export default async function PaymentRulesPage() {
  const t = await getTranslations("payments");
  const locale = await getLocale();
  const v = await guard(() => loadPaymentRules());
  const s = v.stats;
  const cur = v.currency;
  const fmt = (minor: number) => money(minor, cur, locale);
  const names = [...new Set([...v.example, ...v.exampleAfter].map((i) => i.name))];
  const before = (name: string) => v.example.find((i) => i.name === name);
  const after = (name: string) => v.exampleAfter.find((i) => i.name === name);
  const at = (i: { amountMinor: number; dueOn: string } | undefined) =>
    i ? t("onDay", { amount: fmt(i.amountMinor), day: dayMonth(i.dueOn, locale) }) : "—";
  const covered = (list: typeof v.example) => list.reduce((a, i) => a + i.amountMinor, 0);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="payment-stats">
        <Stat
          label={t("collected")}
          value={amounts(s.collected30d, cur, locale)}
          hint={t("charges", { n: s.collectedCount })}
        />
        <Stat
          label={t("failed")}
          value={<span className={s.failed > 0 ? "text-warning" : undefined}>{s.failed}</span>}
          hint={t("retrying", { n: s.retrying })}
        />
        <Stat
          label={t("depositsHeld")}
          value={String(s.depositsHeldCount)}
          hint={amounts(s.depositsHeld, cur, locale)}
        />
        <Stat
          label={t("refunds")}
          value={amounts(s.refunds30d, cur, locale)}
          hint={t("refundsCount", { n: s.refundsCount })}
        />
      </div>

      <RulesTable view={v} />

      <Card
        title={t("changeTitle")}
        description={t("changeLead", {
          before: fmt(v.exampleTotals.before),
          after: fmt(v.exampleTotals.after),
        })}
      >
        <DataTable
          testId="change-impact"
          columns={[
            "",
            { label: t("before"), align: "end" },
            { label: t("after"), align: "end" },
            t("status"),
          ]}
          rows={[
            [
              t("total"),
              fmt(v.exampleTotals.before),
              fmt(v.exampleTotals.after),
              <Chip key="s" color="info" size="sm">
                {t("totalChanged")}
              </Chip>,
            ],
            ...names.map((n) => {
              const b = before(n);
              const a = after(n);
              const same = b && a && b.amountMinor === a.amountMinor && b.dueOn === a.dueOn;
              return [
                n,
                at(b),
                at(a),
                <Chip key="s" color={same ? "default" : "success"} size="sm">
                  {same ? t("unchanged") : !b ? t("added") : !a ? t("dropped") : t("rescheduled")}
                </Chip>,
              ];
            }),
            ...(covered(v.exampleAfter) < v.exampleTotals.after
              ? [
                  [
                    t("uncovered"),
                    fmt(Math.max(0, v.exampleTotals.before - covered(v.example))),
                    fmt(v.exampleTotals.after - covered(v.exampleAfter)),
                    <Chip key="s" color="warning" size="sm">
                      {t("notCollected")}
                    </Chip>,
                  ],
                ]
              : []),
          ]}
        />
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title={t("whenFails")}>
          <Facts
            items={[
              [t("retry"), t("retryValue")],
              [t("declined"), t("declinedValue")],
              [t("cancelledStay"), t("cancelledStayValue")],
            ]}
          />
        </Card>
        <Card title={t("processor")}>
          <Facts
            items={[
              [
                v.processor.name,
                <Chip key="p" color={v.processor.configured ? "success" : "warning"} size="sm">
                  {v.processor.configured ? t("connected") : t("testMode")}
                </Chip>,
              ],
              [t("channelCollected"), t("channelCollectedValue")],
            ]}
          />
          <Link
            href="/settings/integrations"
            className="mt-2.5 inline-block text-[13px] font-semibold text-accent hover:underline"
          >
            {t("manageInSettings")}
          </Link>
        </Card>
      </div>
    </div>
  );
}
