import { getTranslations } from "next-intl/server";
import { Card, LinkButton, PageHeader } from "@/components/ui";
import { guard } from "@/server/guard";
import { loadTransactions } from "../financials.actions";
import { TransactionsTable } from "../transactions-table";

/** Every payment, refund, expense and owner payout, newest first (design board "Financials", Transactions tab). */
export default async function TransactionsPage() {
  const t = await getTranslations("financials");
  const rows = await guard(() => loadTransactions());
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("transactions")}
        description={t("transactionsLead")}
        actions={
          <LinkButton href="/owners/expenses" variant="secondary">
            + {t("expense")}
          </LinkButton>
        }
      />
      <Card>
        <TransactionsTable rows={rows} />
      </Card>
    </div>
  );
}
