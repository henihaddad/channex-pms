import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Chip, DataTable } from "@/components/ui";
import { day, money } from "@/lib/format";
import type { TransactionRow } from "./financials.actions";

type Tone = "success" | "warning" | "info" | "default" | "danger";

/** Money in and out as the design lists it: date, what, where, a signed amount and its state. */
export async function TransactionsTable({
  rows,
  testId = "transactions",
}: {
  rows: TransactionRow[];
  testId?: string;
}) {
  const t = await getTranslations("financials");
  const locale = await getLocale();
  const what = (r: TransactionRow): string => {
    const method = t.has(`method.${r.method}`) ? t(`method.${r.method}`) : r.method;
    if (r.kind === "payment") return t("tx.payment", { method });
    if (r.kind === "refund") return t("tx.refund", { method });
    if (r.kind === "owner_payout") return t("tx.payout", { owner: r.party ?? "" });
    const category = t.has(`category.${r.method}`) ? t(`category.${r.method}`) : r.method;
    return r.party ? `${category} · ${r.party}` : category;
  };
  const status = (r: TransactionRow): { label: string; tone: Tone } => {
    if (r.kind === "expense")
      return r.state === "submitted"
        ? { label: t("txState.toApprove"), tone: "warning" }
        : { label: t("txState.expense"), tone: "default" };
    if (r.kind === "owner_payout")
      return r.state === "paid"
        ? { label: t("txState.paid"), tone: "success" }
        : r.state === "failed"
          ? { label: t("txState.failed"), tone: "danger" }
          : { label: t("txState.pending"), tone: "warning" };
    if (r.state === "held") return { label: t("txState.held"), tone: "info" };
    if (r.kind === "refund" || r.state === "refunded")
      return { label: t("txState.refunded"), tone: "default" };
    if (r.state === "released") return { label: t("txState.released"), tone: "default" };
    return { label: t("txState.received"), tone: "success" };
  };
  return (
    <DataTable
      testId={testId}
      rowTestId="transaction-row"
      columns={[
        t("date"),
        t("type"),
        t("reservationProperty"),
        { label: t("amount"), align: "end" },
        t("status"),
      ]}
      empty={t("noTransactions")}
      rows={rows.map((r) => {
        const s = status(r);
        const where = [r.propertyTitle, r.reference].filter(Boolean).join(" · ");
        return [
          <span key="d" className="whitespace-nowrap">
            {day(r.date, locale)}
          </span>,
          what(r),
          r.bookingId ? (
            <Link key="w" href={`/reservations/${r.bookingId}`} className="hover:underline">
              {where}
            </Link>
          ) : (
            where
          ),
          <span key="a" className="whitespace-nowrap">
            {r.amountMinor > 0 ? "+" : ""}
            {money(r.amountMinor, r.currency, locale)}
          </span>,
          <Chip key="s" color={s.tone} size="sm">
            {s.label}
          </Chip>,
        ];
      })}
    />
  );
}
