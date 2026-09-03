import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button, Card, Chip, PageTitle, Select, TBody, Table, Td, Tr } from "@/components/ui";
import { guard } from "@/server/guard";
import { money } from "@/server/owners";
import { listStatements } from "../owners.actions";

/** Statement list (STMT-5): drafts to review, approved waiting to send, sent awaiting payout. */
export default async function StatementsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const t = await getTranslations("owners");
  const rows = await guard(() => listStatements({ state: sp.state ?? null }));
  return (
    <div className="space-y-4">
      <PageTitle>{t("statements")}</PageTitle>
      <form className="flex gap-2 text-xs">
        <Select name="state" defaultValue={sp.state ?? ""} className="w-40" size="sm">
          <option value="">{t("anyState")}</option>
          {["draft", "approved", "sent", "paid"].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
        <Button type="submit" variant="secondary" size="sm">
          {t("filter")}
        </Button>
      </form>
      <Card>
        {rows.length === 0 ? <p className="text-sm text-muted">{t("noStatements")}</p> : null}
        <Table>
          <TBody>
            {rows.map((s) => (
              <Tr key={s.id} data-testid="statement-row" data-state={s.state}>
                <Td>
                  <Link className="underline" href={`/owners/statements/${s.id}`}>
                    {s.periodFrom.slice(0, 7)}
                  </Link>
                </Td>
                <Td>{s.ownerName}</Td>
                <Td>{s.propertyTitle}</Td>
                <Td>{money(Number(s.totals.grossRevenue ?? 0), s.currency)}</Td>
                <Td>{money(Number(s.totals.netDue ?? 0), s.currency)}</Td>
                <Td>
                  <span className="rounded bg-background px-1 text-xs">{s.state}</span>
                  {s.disputeState === "open" ? (
                    <Chip color="danger" size="sm" className="ms-1">
                      {t("disputed")}
                    </Chip>
                  ) : null}
                  {s.anomalies.length ? (
                    <Chip color="warning" size="sm" className="ms-1">
                      {s.anomalies.length} ⚠
                    </Chip>
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
