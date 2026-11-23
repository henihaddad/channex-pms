import { getTranslations } from "next-intl/server";
import { Card, Field, Label, PageHeader, Select, SubmitButton } from "@/components/ui";
import { guard } from "@/server/guard";
import { EXPENSE_CATEGORIES, money } from "@/server/owners";
import { approveExpenseAction, createExpenseAction, listExpenses } from "../owners.actions";

export async function generateMetadata() {
  const t = await getTranslations("owners");
  return { title: t("expenses") };
}

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
      <PageHeader title={t("expenses")} />
      <div className="grid grid-cols-[2fr_1fr] gap-4">
        <Card>
          <form className="mb-2 flex gap-2 text-xs">
            <Select name="state" defaultValue={sp.state ?? ""} className="w-40" size="sm">
              <option value="">{t("anyState")}</option>
              <option value="submitted">submitted</option>
              <option value="approved">approved</option>
              <option value="rejected">rejected</option>
            </Select>
            <SubmitButton variant="secondary" size="sm">
              {t("filter")}
            </SubmitButton>
          </form>
          {v.rows.map((e) => (
            <div
              key={e.id}
              className="flex items-center justify-between border-t border-border py-2 text-sm"
              data-testid="expense-row"
              data-state={e.state}
            >
              <div>
                <p>
                  {e.date} · {e.propertyTitle} · {e.category} · {e.description}{" "}
                  {e.vendor ? `(${e.vendor})` : ""}
                </p>
                <p className="text-xs text-muted">
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
                    <SubmitButton testId="approve-expense" size="sm">
                      {t("approve")}
                    </SubmitButton>
                  </form>
                  <form action={approveExpenseAction}>
                    <input type="hidden" name="id" value={e.id} />
                    <input type="hidden" name="propertyId" value={e.propertyId} />
                    <input type="hidden" name="decision" value="reject" />
                    <SubmitButton variant="secondary" size="sm">
                      {t("reject")}
                    </SubmitButton>
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
              <Select label={t("property")} name="propertyId">
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
              <Select label={t("category")} name="category" defaultValue="maintenance">
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
            <Label>
              <input type="checkbox" name="rebillable" defaultChecked /> {t("rebillable")}
            </Label>
            <Field label={t("rebillReason")} name="rebillReason" required={false} />
            <div className="text-xs">
              <Label htmlFor="receipt">{t("receipt")}</Label>
              <input
                id="receipt"
                type="file"
                name="receipt"
                accept="image/*,application/pdf"
                className="block"
              />
            </div>
            <SubmitButton testId="create-expense">{t("submitExpense")}</SubmitButton>
            {v.fourEyes ? <p className="text-xs text-muted">{t("fourEyesOn")}</p> : null}
          </form>
        </Card>
      </div>
    </div>
  );
}
