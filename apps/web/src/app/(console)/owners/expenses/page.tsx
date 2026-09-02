import { getTranslations } from "next-intl/server";
import { Button, Card, Field, PageTitle, Select } from "@/components/ui";
import { guard } from "@/server/guard";
import { EXPENSE_CATEGORIES, money } from "@/server/owners";
import { approveExpenseAction, createExpenseAction, listExpenses } from "../owners.actions";

/** Expenses (spec 17 §17.3): capture, rebillable suggestion with override reason, approval before a statement (EXP-1). */
export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const t = await getTranslations("owners");
  const v = await guard(() => listExpenses({ state: sp.state ?? null }));
  return (
    <div className="space-y-4">
      <PageTitle>{t("expenses")}</PageTitle>
      <div className="grid grid-cols-[2fr_1fr] gap-4">
        <Card>
          <form className="mb-2 flex gap-2 text-xs">
            <Select name="state" defaultValue={sp.state ?? ""} className="h-8 w-40">
              <option value="">{t("anyState")}</option>
              <option value="submitted">submitted</option>
              <option value="approved">approved</option>
              <option value="rejected">rejected</option>
            </Select>
            <Button type="submit" variant="secondary" className="h-8 text-xs">
              {t("filter")}
            </Button>
          </form>
          {v.rows.map((e) => (
            <div
              key={e.id}
              className="flex items-center justify-between border-t border-slate-100 py-2 text-sm"
              data-testid="expense-row"
              data-state={e.state}
            >
              <div>
                <p>
                  {e.date} · {e.propertyTitle} · {e.category} · {e.description}{" "}
                  {e.vendor ? `(${e.vendor})` : ""}
                </p>
                <p className="text-xs text-slate-500">
                  {money(e.amountMinor, e.currency)} ·{" "}
                  {e.rebillable ? t("rebillable") : t("absorbed")}
                  {e.rebillReason ? ` · ${e.rebillReason}` : ""} ·{" "}
                  {e.receiptRef ? t("receiptAttached") : t("noReceipt")} · {e.state}
                  {e.statementId ? ` · ${t("onStatement")}` : ""}
                </p>
              </div>
              {e.state === "submitted" ? (
                <div className="flex gap-1">
                  <form action={approveExpenseAction}>
                    <input type="hidden" name="id" value={e.id} />
                    <input type="hidden" name="propertyId" value={e.propertyId} />
                    <Button type="submit" className="h-7 text-xs" data-testid="approve-expense">
                      {t("approve")}
                    </Button>
                  </form>
                  <form action={approveExpenseAction}>
                    <input type="hidden" name="id" value={e.id} />
                    <input type="hidden" name="propertyId" value={e.propertyId} />
                    <input type="hidden" name="decision" value="reject" />
                    <Button type="submit" variant="secondary" className="h-7 text-xs">
                      {t("reject")}
                    </Button>
                  </form>
                </div>
              ) : null}
            </div>
          ))}
        </Card>
        <Card>
          <form action={createExpenseAction} className="space-y-2" data-testid="expense-form">
            <p className="font-medium">{t("newExpense")}</p>
            <div>
              <label htmlFor="propertyId" className="text-sm font-medium">
                {t("property")}
              </label>
              <Select id="propertyId" name="propertyId">
                {v.properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </Select>
            </div>
            <Field
              label={t("date")}
              name="date"
              type="date"
              defaultValue={new Date().toISOString().slice(0, 10)}
            />
            <div>
              <label htmlFor="category" className="text-sm font-medium">
                {t("category")}
              </label>
              <Select id="category" name="category" defaultValue="maintenance">
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </div>
            <Field label={t("vendor")} name="vendor" required={false} />
            <Field label={t("description")} name="description" />
            <Field label={t("amount")} name="amount" type="number" />
            <label className="block text-xs">
              <input type="checkbox" name="rebillable" defaultChecked /> {t("rebillable")}
            </label>
            <Field label={t("rebillReason")} name="rebillReason" required={false} />
            <div className="text-xs">
              <label htmlFor="receipt">{t("receipt")}</label>
              <input
                id="receipt"
                type="file"
                name="receipt"
                accept="image/*,application/pdf"
                className="block"
              />
            </div>
            <Button type="submit" data-testid="create-expense">
              {t("submitExpense")}
            </Button>
            {v.fourEyes ? <p className="text-xs text-slate-500">{t("fourEyesOn")}</p> : null}
          </form>
        </Card>
      </div>
    </div>
  );
}
