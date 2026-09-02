import { getTranslations } from "next-intl/server";
import { Card, PageTitle } from "@/components/ui";
import { withOperator } from "@/server/operator";
import { guard } from "@/server/guard";

const loadAudit = withOperator("audit.read", { audit: false }, async (ctx) =>
  ctx.repo.operatorAudit(),
);

/** The operator log (spec 12 §12.1): every console action, with the tenant it touched. */
export default async function OperatorAuditPage() {
  const t = await getTranslations("ops");
  const rows = await guard(() => loadAudit());
  return (
    <div className="space-y-4">
      <PageTitle>{t("audit")}</PageTitle>
      <Card>
        <ul className="text-xs" data-testid="operator-audit">
          {rows.map((r) => (
            <li key={r.id} data-testid="operator-audit-row">
              {r.occurredAt.slice(0, 19)} · {r.operatorId.slice(0, 8)} · <code>{r.action}</code> ·{" "}
              {r.subject.kind}/{r.subject.id.slice(0, 8)} · {r.orgId?.slice(0, 8) ?? "platform"}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
