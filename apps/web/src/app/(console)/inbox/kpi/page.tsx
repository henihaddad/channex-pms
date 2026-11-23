import { getTranslations } from "next-intl/server";
import { Card, PageHeader, TBody, THead, Table, Td, Th, Tr } from "@/components/ui";
import { guard } from "@/server/guard";
import { providerLabel } from "@/server/inbox";
import { loadKpi } from "../inbox.actions";

const min = (m: number | null) => (m === null ? "—" : `${String(Math.round(m))} min`);

export async function generateMetadata() {
  const t = await getTranslations("inbox");
  return { title: t("kpi") };
}

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
    <div className="flex flex-col gap-5">
      <PageHeader title={t("kpi")} />
      <Card>
        <p className="text-sm" data-testid="kpi-overall">
          {t("medianFirstResponse", { days })}: <strong>{min(kpi.overall)}</strong>
        </p>
        <div className="mt-3 grid grid-cols-1 gap-4 text-xs lg:grid-cols-3">
          <Table>
            <THead>
              <Tr className="hover:bg-transparent">
                <Th>{t("kpiCols.property")}</Th>
                <Th>{t("kpiCols.median")}</Th>
                <Th>{t("kpiCols.count")}</Th>
              </Tr>
            </THead>
            <TBody>
              {kpi.byProperty.map((r) => (
                <Tr key={r.propertyId}>
                  <Td>{r.title}</Td>
                  <Td>{min(r.median)}</Td>
                  <Td className="tabular-nums">{r.n}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
          <Table>
            <THead>
              <Tr className="hover:bg-transparent">
                <Th>{t("kpiCols.channel")}</Th>
                <Th>{t("kpiCols.median")}</Th>
                <Th>{t("kpiCols.count")}</Th>
              </Tr>
            </THead>
            <TBody>
              {kpi.byChannel.map((r) => (
                <Tr key={r.provider}>
                  <Td>{providerLabel(r.provider)}</Td>
                  <Td>{min(r.median)}</Td>
                  <Td className="tabular-nums">{r.n}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
          <Table>
            <THead>
              <Tr className="hover:bg-transparent">
                <Th>{t("kpiCols.agent")}</Th>
                <Th>{t("kpiCols.median")}</Th>
                <Th>{t("kpiCols.count")}</Th>
              </Tr>
            </THead>
            <TBody>
              {kpi.byAgent.map((r) => (
                <Tr key={r.agentId ?? "none"}>
                  <Td>{r.agentId ?? t("staff")}</Td>
                  <Td>{min(r.median)}</Td>
                  <Td className="tabular-nums">{r.n}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
