import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button, Card, Input, PageTitle } from "@/components/ui";
import { withOperator } from "@/server/operator";
import { guard } from "@/server/guard";
import { tenantEventAction } from "../ops.actions";

const loadTenants = withOperator<
  [string],
  Awaited<ReturnType<import("@pms/db").DrizzleOperatorRepository["tenants"]>>
>("tenants.read", { audit: false }, async (ctx, q) => ctx.repo.tenants(q));

/** Tenants (spec 12 §12.1): search, plan, state, units, activity, incidents; lifecycle actions. */
export default async function TenantsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const sp = await searchParams;
  const t = await getTranslations("ops");
  const rows = await guard(() => loadTenants(sp.q ?? ""));
  return (
    <div className="space-y-4">
      <PageTitle>{t("tenants")}</PageTitle>
      <form className="flex gap-2">
        <Input
          name="q"
          defaultValue={sp.q ?? ""}
          placeholder={t("search")}
          aria-label={t("search")}
        />
        <Button type="submit" variant="secondary">
          {t("search")}
        </Button>
      </form>
      <Card>
        <table className="w-full text-sm" data-testid="tenants">
          <thead className="text-xs text-muted">
            <tr>
              <th className="text-start">{t("tenants")}</th>
              <th className="text-start">{t("state")}</th>
              <th className="text-start">{t("plan")}</th>
              <th className="text-end">{t("units")}</th>
              <th className="text-end">{t("pendingCells")}</th>
              <th className="text-end">{t("unacked")}</th>
              <th className="text-end">{t("incidents")}</th>
              <th className="text-start">{t("lastActivity")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} data-testid="tenant-row" data-state={r.state}>
                <td>
                  {r.name}{" "}
                  <span className="text-xs text-muted">
                    /{r.slug} · {r.country}
                  </span>
                </td>
                <td>{r.state}</td>
                <td>{r.planKey ?? "—"}</td>
                <td className="text-end">{r.activeUnits}</td>
                <td className="text-end">{r.pendingCells}</td>
                <td className="text-end">{r.unackedBookings}</td>
                <td className="text-end">{r.openIncidents}</td>
                <td>{r.lastActivityAt?.slice(0, 16) ?? "—"}</td>
                <td className="text-end">
                  <Link href={`/ops/impersonation?orgId=${r.id}`} className="text-xs underline">
                    {t("impersonation")}
                  </Link>
                  {r.state === "suspended" ? (
                    <form action={tenantEventAction} className="inline">
                      <input type="hidden" name="orgId" value={r.id} />
                      <input type="hidden" name="event" value="reactivated" />
                      <Button type="submit" variant="secondary" className="ms-2 h-6 text-xs">
                        reactivate
                      </Button>
                    </form>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
