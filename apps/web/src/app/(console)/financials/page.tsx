import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Card, DataTable, PageHeader, Stat } from "@/components/ui";
import { guard } from "@/server/guard";
import { loadFinancials } from "./financials.actions";

const money = (minor: number, currency: string): string =>
  `${(minor / 100).toFixed(2)} ${currency}`;

/**
 * Financials (spec 11 §11.5b). Folios live on a stay and statements live with an owner,
 * which is right — but it left a manager with no one place to ask "what does money need
 * from me today". This is that place, and it is an action queue, not a dashboard: every
 * row links to the page that clears it, and every figure is read from the same repository
 * as the page it links to, so the two can never disagree.
 */
export default async function FinancialsPage() {
  const t = await getTranslations("financials");
  const d = await guard(() => loadFinancials());
  /**
   * One currency adds up; several do not (rule 4 bans it), so a mixed portfolio gets the
   * count of stays rather than a number that would be a lie.
   */
  const owed = (rows: Array<{ currency: string; balanceMinor: number }>): string => {
    if (rows.length === 0) return money(0, rows[0]?.currency ?? "");
    const currencies = new Set(rows.map((r) => r.currency));
    const total = rows.reduce((a, r) => a + r.balanceMinor, 0);
    return currencies.size === 1
      ? money(total, rows[0]!.currency)
      : t("across", { n: rows.length });
  };
  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={t("lead")} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="financials-stats">
        <Stat label={t("toApprove")} value={String(d.statementsToApprove.length)} />
        <Stat label={t("toSend")} value={String(d.statementsToSend.length)} />
        <Stat label={t("toPay")} value={String(d.payoutsToRecord.length)} />
        <Stat label={t("owedByGuests")} value={owed(d.unpaidFolios)} />
      </div>

      <Card title={t("statementsToApprove")} description={t("statementsToApproveHint")}>
        <DataTable
          testId="statements-to-approve"
          columns={[t("owner"), t("period"), { label: t("net"), align: "end" }, ""]}
          empty={t("nothingWaiting")}
          rows={d.statementsToApprove.map((s) => [
            s.owner,
            s.period,
            money(s.netMinor, s.currency),
            <Link key={s.id} href={`/owners/statements?id=${s.id}`} className="underline">
              {t("review")}
            </Link>,
          ])}
        />
      </Card>

      <Card title={t("statementsToSend")} description={t("statementsToSendHint")}>
        <DataTable
          testId="statements-to-send"
          columns={[t("owner"), t("period"), { label: t("net"), align: "end" }, ""]}
          empty={t("nothingWaiting")}
          rows={d.statementsToSend.map((s) => [
            s.owner,
            s.period,
            money(s.netMinor, s.currency),
            <Link key={s.id} href={`/owners/statements?id=${s.id}`} className="underline">
              {t("open")}
            </Link>,
          ])}
        />
      </Card>

      <Card title={t("payoutsToRecord")} description={t("payoutsToRecordHint")}>
        <DataTable
          testId="payouts-to-record"
          columns={[t("owner"), t("state"), { label: t("amount"), align: "end" }, ""]}
          empty={t("nothingWaiting")}
          rows={d.payoutsToRecord.map((p) => [
            p.owner,
            t(`payoutState.${p.state}`),
            money(p.amountMinor, p.currency),
            <Link key={p.id} href="/owners/payouts" className="underline">
              {t("open")}
            </Link>,
          ])}
        />
      </Card>

      <Card title={t("expensesToApprove")} description={t("expensesToApproveHint")}>
        <DataTable
          testId="expenses-to-approve"
          columns={[t("property"), t("what"), { label: t("amount"), align: "end" }, ""]}
          empty={t("nothingWaiting")}
          rows={d.expensesToApprove.map((e) => [
            e.property,
            e.description,
            money(e.amountMinor, e.currency),
            <Link key={e.id} href="/owners/expenses" className="underline">
              {t("review")}
            </Link>,
          ])}
        />
      </Card>

      <Card title={t("instalmentsDue")} description={t("instalmentsDueHint")}>
        <DataTable
          testId="instalments-due"
          columns={[
            t("reference"),
            t("due"),
            { label: t("amount"), align: "end" },
            t("attempts"),
            "",
          ]}
          empty={t("nothingWaiting")}
          rows={d.instalmentsDue.map((i) => [
            i.reference,
            i.dueOn,
            money(i.amountMinor, i.currency),
            String(i.attempts),
            <Link key={i.id} href="/booking-engine/payments" className="underline">
              {t("rules")}
            </Link>,
          ])}
        />
      </Card>

      <Card title={t("unpaidFolios")} description={t("unpaidFoliosHint")}>
        <DataTable
          testId="unpaid-folios"
          columns={[t("reference"), { label: t("balance"), align: "end" }, ""]}
          empty={t("nothingWaiting")}
          rows={d.unpaidFolios.map((f) => [
            f.reference,
            money(f.balanceMinor, f.currency),
            <Link key={f.bookingId} href={`/reservations/${f.bookingId}`} className="underline">
              {t("open")}
            </Link>,
          ])}
        />
      </Card>
    </div>
  );
}
