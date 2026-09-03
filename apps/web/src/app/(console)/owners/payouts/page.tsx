import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button, Card, PageTitle } from "@/components/ui";
import { guard } from "@/server/guard";
import { money } from "@/server/owners";
import { approvePayoutAction, listPayouts } from "../owners.actions";

/** Payouts (PAY-1..3): state per statement, four-eyes queue, provider reasons on failure. */
export default async function PayoutsPage() {
  const t = await getTranslations("owners");
  const rows = await guard(() => listPayouts());
  return (
    <div className="space-y-4">
      <PageTitle>{t("payouts")}</PageTitle>
      <Card>
        {rows.length === 0 ? <p className="text-sm text-muted">{t("noPayouts")}</p> : null}
        {rows.map((p) => (
          <div
            key={p.id}
            className="flex items-center justify-between border-t border-line py-2 text-sm"
            data-testid="payout-row"
            data-state={p.state}
          >
            <span>
              <Link className="underline" href={`/owners/statements/${p.statementId}`}>
                {p.ownerName}
              </Link>{" "}
              · {money(p.amountMinor, p.currency)} · {p.method} ·{" "}
              <span className="rounded bg-canvas px-1 text-xs">{p.state}</span>
              {p.failureReason ? (
                <span className="ms-1 text-xs text-rose">{p.failureReason}</span>
              ) : null}
              {p.reference ? <span className="ms-1 text-xs text-muted">{p.reference}</span> : null}
            </span>
            {p.state === "awaiting_approval" ? (
              <form action={approvePayoutAction}>
                <input type="hidden" name="id" value={p.id} />
                <Button type="submit" variant="secondary" className="h-7 text-xs">
                  {t("approvePayout")}
                </Button>
              </form>
            ) : null}
          </div>
        ))}
      </Card>
    </div>
  );
}
