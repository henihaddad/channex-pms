import { getLocale, getTranslations } from "next-intl/server";
import { Card, PageTitle } from "@/components/ui";
import { guard } from "@/server/guard";
import { day, money } from "@/lib/format";
import { loadPortalExpenses } from "../portal.actions";

export async function generateMetadata() {
  const t = await getTranslations("owner");
  return { title: t("nav.expenses") };
}

/** Everything billed to the owner, with the receipt where one was captured (spec 17 §17.5). */
export default async function OwnerExpenses() {
  const [t, locale] = await Promise.all([getTranslations("owner"), getLocale()]);
  const rows = await guard(() => loadPortalExpenses());
  return (
    <div className="space-y-4">
      <PageTitle>{t("nav.expenses")}</PageTitle>
      <p className="text-sm text-muted">{t("expensesHint")}</p>
      <Card className="text-sm">
        {rows.length === 0 ? <p className="text-xs text-muted">{t("noExpenses")}</p> : null}
        {rows.map((e) => (
          <p key={e.id} className="border-t border-border py-1 text-xs" data-testid="owner-expense">
            {day(e.date, locale)} · {e.propertyTitle} · {e.category} · {e.description} ·{" "}
            {money(e.amountMinor, e.currency, locale)}
            {e.receiptRef ? ` · ${t("receipt")}` : ""}
          </p>
        ))}
      </Card>
    </div>
  );
}
