import { getTranslations } from "next-intl/server";
import { Card, PageTitle, TBody, THead, Table, Td, Th, Tr } from "@/components/ui";
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
      <Card title={t("verify")}>
        <p className={verification.ok ? "text-success-soft-foreground" : "text-danger"}>
          {verification.ok
            ? t("ok", { checked: verification.checked })
            : t("broken", { seq: verification.brokenAtSeq ?? 0 })}
        </p>
      </Card>
      <Card>
        <Table>
          <THead className="uppercase">
            <Tr>
              <Th>{t("seq")}</Th>
              <Th>{t("action")}</Th>
              <Th>{t("actor")}</Th>
              <Th>{t("subject")}</Th>
              <Th>{t("when")}</Th>
            </Tr>
          </THead>
          <TBody>
            {rows.map((r) => (
              <Tr key={r.seq}>
                <Td className="font-mono">{r.seq}</Td>
                <Td>
                  <code className="text-xs">{r.action}</code>
                </Td>
                <Td>
                  {r.actor.type}:{r.actor.id.slice(0, 8)}
                </Td>
                <Td>
                  {r.subject.kind}:{String(r.subject.id).slice(0, 8)}
                </Td>
                <Td>{new Date(r.occurredAt).toISOString()}</Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
