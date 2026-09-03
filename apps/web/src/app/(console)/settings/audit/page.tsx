import { getTranslations } from "next-intl/server";
import { Card, PageTitle } from "@/components/ui";
import { guard } from "@/server/guard";
import { listAudit, verifyAudit } from "./audit.actions";

export default async function AuditPage() {
  const t = await getTranslations("audit");
  const [rows, verification] = await guard(() =>
    Promise.all([listAudit({ limit: 100 }), verifyAudit()]),
  );
  return (
    <div className="space-y-6">
      <PageTitle>{t("title")}</PageTitle>
      <Card>
        <h2 className="mb-1 font-semibold">{t("verify")}</h2>
        <p className={verification.ok ? "text-mint-deep" : "text-rose"}>
          {verification.ok
            ? t("ok", { checked: verification.checked })
            : t("broken", { seq: verification.brokenAtSeq ?? 0 })}
        </p>
      </Card>
      <Card>
        <table className="w-full text-sm">
          <thead className="text-start text-xs uppercase text-muted">
            <tr>
              <th className="py-1 text-start">{t("seq")}</th>
              <th className="text-start">{t("action")}</th>
              <th className="text-start">{t("actor")}</th>
              <th className="text-start">{t("subject")}</th>
              <th className="text-start">{t("when")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.seq} className="border-t border-line">
                <td className="py-1 font-mono text-xs">{r.seq}</td>
                <td>
                  <code className="text-xs">{r.action}</code>
                </td>
                <td className="text-xs text-muted">
                  {r.actor.type}:{r.actor.id.slice(0, 8)}
                </td>
                <td className="text-xs text-muted">
                  {r.subject.kind}:{String(r.subject.id).slice(0, 8)}
                </td>
                <td className="text-xs text-muted">{new Date(r.occurredAt).toISOString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
