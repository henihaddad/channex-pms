import { getTranslations } from "next-intl/server";
import { Card, PageTitle } from "@/components/ui";
import { guard } from "@/server/guard";
import { money } from "@/server/owners";
import { loadPortalExpenses } from "../portal.actions";

export default async function OwnerExpenses() {
  const t = await getTranslations("owner");
  const rows = await guard(() => loadPortalExpenses());
  return (
    <div className="space-y-4">
      <PageTitle>{t("nav.expenses")}</PageTitle>
      <p className="text-sm text-muted">{t("expensesHint")}</p>
      <Card className="text-sm">
        {rows.length === 0 ? <p className="text-xs text-muted">{t("noExpenses")}</p> : null}
        {rows.map((e) => (
          <p key={e.id} className="border-t border-line py-1 text-xs" data-testid="owner-expense">
            {e.date} · {e.propertyTitle} · {e.category} · {e.description} ·{" "}
            {money(e.amountMinor, e.currency)}
            {e.receiptRef ? " · 🧾" : ""}
          </p>
        ))}
      </Card>
    </div>
  );
}
