import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button, Card, Input, PageTitle, TBody, THead, Table, Td, Th, Tr } from "@/components/ui";
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
        <Table data-testid="tenants">
          <THead>
            <Tr>
              <Th>{t("tenants")}</Th>
              <Th>{t("state")}</Th>
              <Th>{t("plan")}</Th>
              <Th className="text-end">{t("units")}</Th>
              <Th className="text-end">{t("pendingCells")}</Th>
              <Th className="text-end">{t("unacked")}</Th>
              <Th className="text-end">{t("incidents")}</Th>
              <Th>{t("lastActivity")}</Th>
              <Th />
            </Tr>
          </THead>
          <TBody>
            {rows.map((r) => (
              <Tr key={r.id} data-testid="tenant-row" data-state={r.state}>
                <Td>
                  {r.name}{" "}
                  <span className="text-xs text-muted">
                    /{r.slug} · {r.country}
                  </span>
                </Td>
                <Td>{r.state}</Td>
                <Td>{r.planKey ?? "—"}</Td>
                <Td className="text-end">{r.activeUnits}</Td>
                <Td className="text-end">{r.pendingCells}</Td>
                <Td className="text-end">{r.unackedBookings}</Td>
                <Td className="text-end">{r.openIncidents}</Td>
                <Td>{r.lastActivityAt?.slice(0, 16) ?? "—"}</Td>
                <Td className="text-end">
                  <Link href={`/ops/impersonation?orgId=${r.id}`} className="text-xs underline">
                    {t("impersonation")}
                  </Link>
                  {r.state === "suspended" ? (
                    <form action={tenantEventAction} className="inline">
                      <input type="hidden" name="orgId" value={r.id} />
                      <input type="hidden" name="event" value="reactivated" />
                      <Button type="submit" variant="secondary" className="ms-2" size="sm">
                        reactivate
                      </Button>
                    </form>
                  ) : null}
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
