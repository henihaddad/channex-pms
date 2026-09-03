import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button, Card, PageTitle, Select } from "@/components/ui";
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
        <Select name="state" defaultValue={sp.state ?? ""} className="h-8 w-40">
          <option value="">{t("anyState")}</option>
          {["draft", "approved", "sent", "paid"].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
        <Button type="submit" variant="secondary" className="h-8 text-xs">
          {t("filter")}
        </Button>
      </form>
      <Card>
        {rows.length === 0 ? <p className="text-sm text-muted">{t("noStatements")}</p> : null}
        <table className="w-full text-sm">
          <tbody>
            {rows.map((s) => (
              <tr
                key={s.id}
                className="border-t border-line"
                data-testid="statement-row"
                data-state={s.state}
              >
                <td className="py-1">
                  <Link className="underline" href={`/owners/statements/${s.id}`}>
                    {s.periodFrom.slice(0, 7)}
                  </Link>
                </td>
                <td>{s.ownerName}</td>
                <td>{s.propertyTitle}</td>
                <td>{money(Number(s.totals.grossRevenue ?? 0), s.currency)}</td>
                <td className="font-medium">{money(Number(s.totals.netDue ?? 0), s.currency)}</td>
                <td>
                  <span className="rounded bg-canvas px-1 text-xs">{s.state}</span>
                  {s.disputeState === "open" ? (
                    <span className="ms-1 rounded bg-rose-soft px-1 text-xs text-rose">
                      {t("disputed")}
                    </span>
                  ) : null}
                  {s.anomalies.length ? (
                    <span className="ms-1 rounded bg-amber-soft px-1 text-xs text-amber-deep">
                      {s.anomalies.length} ⚠
                    </span>
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
