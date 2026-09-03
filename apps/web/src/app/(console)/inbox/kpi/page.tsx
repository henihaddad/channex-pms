import { getTranslations } from "next-intl/server";
import { Card, PageTitle, TBody, Table, Td, Tr } from "@/components/ui";
import { guard } from "@/server/guard";
import { providerLabel } from "@/server/inbox";
import { loadKpi } from "../inbox.actions";

const min = (m: number | null) => (m === null ? "—" : `${String(Math.round(m))} min`);

/** Median first response per property, channel and agent (spec 09 §9.9; M4 exit). */
export default async function KpiPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const t = await getTranslations("inbox");
  const days = Number(sp.days ?? 30) || 30;
  const kpi = await guard(() => loadKpi({ days }));
  return (
    <div className="space-y-4">
      <PageTitle>{t("kpi")}</PageTitle>
      <Card>
        <p className="text-sm" data-testid="kpi-overall">
          {t("medianFirstResponse", { days })}: <strong>{min(kpi.overall)}</strong>
        </p>
        <div className="mt-3 grid grid-cols-3 gap-4 text-xs">
          <Table>
            <TBody>
              {kpi.byProperty.map((r) => (
                <Tr key={r.propertyId}>
                  <Td>{r.title}</Td>
                  <Td>{min(r.median)}</Td>
                  <Td>n={r.n}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
          <Table>
            <TBody>
              {kpi.byChannel.map((r) => (
                <Tr key={r.provider}>
                  <Td>{providerLabel(r.provider)}</Td>
                  <Td>{min(r.median)}</Td>
                  <Td>n={r.n}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
          <Table>
            <TBody>
              {kpi.byAgent.map((r) => (
                <Tr key={r.agentId ?? "none"}>
                  <Td>{r.agentId ?? t("staff")}</Td>
                  <Td>{min(r.median)}</Td>
                  <Td>n={r.n}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
