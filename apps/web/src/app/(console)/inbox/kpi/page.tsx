import { getTranslations } from "next-intl/server";
import { Card, PageTitle } from "@/components/ui";
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
          <table>
            <tbody>
              {kpi.byProperty.map((r) => (
                <tr key={r.propertyId} className="border-t border-line">
                  <td className="py-1">{r.title}</td>
                  <td>{min(r.median)}</td>
                  <td className="text-muted">n={r.n}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <table>
            <tbody>
              {kpi.byChannel.map((r) => (
                <tr key={r.provider} className="border-t border-line">
                  <td className="py-1">{providerLabel(r.provider)}</td>
                  <td>{min(r.median)}</td>
                  <td className="text-muted">n={r.n}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <table>
            <tbody>
              {kpi.byAgent.map((r) => (
                <tr key={r.agentId ?? "none"} className="border-t border-line">
                  <td className="py-1">{r.agentId ?? t("staff")}</td>
                  <td>{min(r.median)}</td>
                  <td className="text-muted">n={r.n}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
