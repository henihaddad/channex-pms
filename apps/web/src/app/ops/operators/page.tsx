import { getTranslations } from "next-intl/server";
import { Button, Card, Field, PageTitle } from "@/components/ui";
import { withOperator } from "@/server/operator";
import { guard } from "@/server/guard";
import { grantOperatorAction } from "../ops.actions";

const loadOperators = withOperator("operators.read", { audit: false }, async (ctx) =>
  ctx.repo.operators(),
);

export default async function OperatorsPage() {
  const t = await getTranslations("ops");
  const rows = await guard(() => loadOperators());
  return (
    <div className="space-y-4">
      <PageTitle>{t("operators")}</PageTitle>
      <Card>
        <ul className="text-sm" data-testid="operators">
          {rows.map((o) => (
            <li key={o.userId}>
              {o.name} · {o.email} · {o.createdAt.slice(0, 10)}
            </li>
          ))}
        </ul>
      </Card>
      <Card>
        <form action={grantOperatorAction} className="flex items-end gap-2">
          <Field label={t("userEmail")} name="email" type="email" />
          <Button type="submit">{t("grantOperator")}</Button>
        </form>
      </Card>
    </div>
  );
}
