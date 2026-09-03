import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Card, PageTitle } from "@/components/ui";
import { guard } from "@/server/guard";
import { money } from "@/server/owners";
import { loadPortalStatements } from "../portal.actions";

export default async function OwnerStatements() {
  const t = await getTranslations("owner");
  const rows = await guard(() => loadPortalStatements());
  return (
    <div className="space-y-4">
      <PageTitle>{t("nav.statements")}</PageTitle>
      <p className="text-sm text-muted">{t("statementsHint")}</p>
      <Card className="text-sm">
        {rows.map((s) => (
          <p
            key={s.id}
            className="flex justify-between border-t border-border py-1"
            data-testid="owner-statement"
          >
            <Link className="underline" href={`/owner/statements/${s.id}`}>
              {s.periodFrom.slice(0, 7)} · {s.propertyTitle}
            </Link>
            <span>
              {money(Number(s.totals.netDue ?? 0), s.currency)} · {s.state}
              {s.disputeState === "open" ? ` · ${t("disputeOpen")}` : ""}
            </span>
          </p>
        ))}
      </Card>
    </div>
  );
}
