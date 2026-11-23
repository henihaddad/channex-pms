import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Card, EmptyState, LinkButton, PageHeader, SubmitButton } from "@/components/ui";
import { guard } from "@/server/guard";
import { money } from "@/lib/format";
import { approvePayoutAction, listPayouts } from "../owners.actions";

export async function generateMetadata() {
  const t = await getTranslations("owners");
  return { title: t("payouts") };
}

/** Payouts (PAY-1..3): state per statement, four-eyes queue, provider reasons on failure. */
export default async function PayoutsPage() {
  const t = await getTranslations("owners");
  const tf = await getTranslations("financials");
  const locale = await getLocale();
  const rows = await guard(() => listPayouts());
  const state = (k: string) => (t.has(`payoutStates.${k}`) ? t(`payoutStates.${k}`) : k);
  const method = (k: string) => (tf.has(`method.${k}`) ? tf(`method.${k}`) : k);
  return (
    <div className="space-y-4">
      <PageHeader title={t("payouts")} />
      <Card>
        {rows.length === 0 ? (
          <EmptyState
            title={t("noPayouts")}
            description={t("noPayoutsHint")}
            action={
              <LinkButton href="/owners/statements" size="sm">
                {t("openStatements")}
              </LinkButton>
            }
          />
        ) : null}
        {rows.map((p) => (
          <div
            key={p.id}
            className="flex flex-wrap items-center justify-between gap-2 border-t border-border py-2 text-sm first:border-t-0"
            data-testid="payout-row"
            data-state={p.state}
          >
            <span>
              <Link className="underline" href={`/owners/statements/${p.statementId}`}>
                {p.ownerName}
              </Link>{" "}
              · {money(p.amountMinor, p.currency, locale)} · {method(p.method)} ·{" "}
              <span className="rounded bg-background px-1 text-xs">{state(p.state)}</span>
              {p.failureReason ? (
                <span className="ms-1 text-xs text-danger">{p.failureReason}</span>
              ) : null}
              {p.reference ? <span className="ms-1 text-xs text-muted">{p.reference}</span> : null}
            </span>
            {p.state === "awaiting_approval" ? (
              <form action={approvePayoutAction}>
                <input type="hidden" name="id" value={p.id} />
                <SubmitButton variant="secondary" size="sm">
                  {t("approvePayout")}
                </SubmitButton>
              </form>
            ) : null}
          </div>
        ))}
      </Card>
    </div>
  );
}
