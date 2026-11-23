import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Card, PageTitle } from "@/components/ui";
import { guard } from "@/server/guard";
import { money } from "@/lib/format";
import { loadPortalStatements } from "../portal.actions";
import { periodLabel } from "../period";

export async function generateMetadata() {
  const t = await getTranslations("owner");
  return { title: t("nav.statements") };
}

/** Every statement, newest first (spec 17 §17.5; persona: the owner). */
export default async function OwnerStatements() {
  const [t, locale] = await Promise.all([getTranslations("owner"), getLocale()]);
  const rows = await guard(() => loadPortalStatements());
  return (
    <div className="space-y-4">
      <PageTitle>{t("nav.statements")}</PageTitle>
      <p className="text-sm text-muted">{t("statementsHint")}</p>
      <Card className="text-sm">
        {rows.length === 0 ? <p className="text-xs text-muted">{t("noStatements")}</p> : null}
        {rows.map((s) => (
          <p
            key={s.id}
            className="flex justify-between gap-3 border-t border-border py-1"
            data-testid="owner-statement"
          >
            <Link className="underline" href={`/owner/statements/${s.id}`}>
              {periodLabel(s.periodFrom, locale)} · {s.propertyTitle}
            </Link>
            <span className="text-end">
              {money(Number(s.totals.netDue ?? 0), s.currency, locale)} ·{" "}
              {s.state === "paid" ? t("statePaid") : t("stateReady")}
              {s.disputeState === "open" ? ` · ${t("disputeOpen")}` : ""}
            </span>
          </p>
        ))}
      </Card>
    </div>
  );
}
