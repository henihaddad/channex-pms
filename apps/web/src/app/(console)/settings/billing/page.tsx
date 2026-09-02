import { getTranslations } from "next-intl/server";
import { Alert, Button, Card, Field, Label, PageTitle, Select } from "@/components/ui";
import { guard } from "@/server/guard";
import { money } from "@/server/booking-engine";
import {
  attachCardAction,
  cancelSubscriptionAction,
  choosePlanAction,
  leavePlatformAction,
  loadBilling,
  requestExportAction,
} from "./billing.actions";

/** Plan, usage, invoices, export and leaving (spec 12 §12.3, §12.5). Self-hosted sees export only. */
export default async function BillingPage() {
  const t = await getTranslations("billing");
  const v = await guard(() => loadBilling());
  const sub = v.subscription;
  return (
    <div className="space-y-6">
      <PageTitle>{t("title")}</PageTitle>
      {!v.hosted ? <Alert tone="success">{t("selfHosted")}</Alert> : null}
      {v.state === "suspended" ? <Alert>{t("suspended")}</Alert> : null}
      {v.state === "expired" ? <Alert>{t("expired")}</Alert> : null}
      {sub?.paymentFailedOn ? (
        <Alert>
          <span data-testid="dunning-notice">{t("dunning", { date: sub.paymentFailedOn })}</span>
        </Alert>
      ) : null}
      {v.quota.exceeded ? (
        <Alert>
          <span data-testid="quota-exceeded">{t("quotaExceeded", { what: v.quota.exceeded })}</span>
        </Alert>
      ) : null}
      {v.quota.warnings.map((w) => (
        <p key={w} className="text-xs text-amber-700">
          {t("quotaWarning", { what: w })}
        </p>
      ))}
      {v.hosted ? (
        <Card data-testid="billing-plan" data-state={v.state}>
          <h2 className="font-semibold">
            {t("currentPlan")}: {sub ? sub.plan.name : t("noPlan")}{" "}
            <span
              className="ms-2 rounded bg-slate-100 px-2 py-0.5 text-xs"
              data-testid="tenant-state"
            >
              {v.state}
            </span>
          </h2>
          {sub?.trialEndsOn && v.state === "trial" ? (
            <p className="text-xs text-slate-500">{t("trialEnds", { date: sub.trialEndsOn })}</p>
          ) : null}
          {sub?.cancelAtPeriodEnd ? (
            <p className="text-xs text-rose-700">{t("cancelled", { date: sub.periodTo })}</p>
          ) : null}
          <form action={choosePlanAction} className="mt-3 space-y-3" data-testid="plan-form">
            <div className="grid gap-3 sm:grid-cols-3">
              {v.plans.map((p) => (
                <label
                  key={p.key}
                  className="block cursor-pointer rounded border border-slate-200 p-3 text-sm has-[:checked]:border-emerald-500"
                  data-testid="plan-card"
                  data-plan={p.key}
                >
                  <input
                    type="radio"
                    name="planKey"
                    value={p.key}
                    defaultChecked={sub ? sub.plan.key === p.key : p.key === "growth"}
                    data-testid={`plan-radio-${p.key}`}
                  />{" "}
                  <strong>{p.name}</strong>
                  <p className="text-xs text-slate-600">
                    {money(p.tiers[0]!.unitMinor, p.currency)} {t("perUnit")}
                  </p>
                  <ul className="mt-1 text-xs text-slate-500">
                    {p.tiers.map((tier) => (
                      <li key={tier.fromUnits}>
                        {t("from", { n: tier.fromUnits })}: {money(tier.unitMinor, p.currency)}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1 text-xs text-slate-500">
                    {t("annual", { pct: p.annualDiscountBps / 100 })} ·{" "}
                    {p.addOns
                      .map((a) => `${a.name} ${money(a.monthlyMinor, p.currency)}`)
                      .join(", ")}
                  </p>
                </label>
              ))}
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <Field
                label={t("billingName")}
                name="billingName"
                defaultValue={sub?.billingName ?? ""}
              />
              <Field
                label={t("billingEmail")}
                name="billingEmail"
                type="email"
                defaultValue={sub?.billingEmail ?? ""}
              />
              <Field
                label={t("vatId")}
                name="vatId"
                required={false}
                defaultValue={sub?.vatId ?? ""}
              />
            </div>
            <div className="flex flex-wrap gap-4 text-xs">
              <label className="flex items-center gap-1">
                <input type="checkbox" name="annual" defaultChecked={sub?.annual} />{" "}
                {t("annual", { pct: 15 })}
              </label>
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  name="addOn"
                  value="priority_support"
                  defaultChecked={sub?.addOns.includes("priority_support")}
                />{" "}
                {t("prioritySupport")}
              </label>
            </div>
            <Button type="submit" data-testid="choose-plan">
              {sub ? t("changePlan") : t("subscribe")}
            </Button>
          </form>
        </Card>
      ) : null}
      {v.hosted && sub ? (
        <Card>
          <h2 className="font-semibold">{t("paymentMethod")}</h2>
          <p className="text-sm" data-testid="payment-method">
            {sub.paymentMethod
              ? `${sub.paymentMethod.brand} •••• ${sub.paymentMethod.last4}`
              : t("noMethod")}
          </p>
          <form action={attachCardAction} className="mt-2 flex items-end gap-2">
            <div data-payment-mount>
              <Label htmlFor="cardToken">{t("cardToken")}</Label>
              <input
                id="cardToken"
                name="cardToken"
                className="h-9 rounded border border-slate-300 px-2 text-sm"
                placeholder="tok_visa_4242"
                required
              />
            </div>
            <Button type="submit" data-testid="attach-card">
              {t("attachCard")}
            </Button>
          </form>
          <p className="mt-1 text-xs text-slate-500">{t("cardHint")}</p>
        </Card>
      ) : null}
      {v.hosted ? (
        <Card>
          <h2 className="font-semibold">{t("usage")}</h2>
          <dl className="mt-1 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <dt>{t("today")}</dt>
            <dd data-testid="usage-units">{v.usage.activeUnits}</dd>
            <dt>{t("peak")}</dt>
            <dd data-testid="usage-peak">{v.peak}</dd>
            <dt>{t("properties")}</dt>
            <dd>{v.usage.properties}</dd>
            <dt>{t("users")}</dt>
            <dd>{v.usage.users}</dd>
          </dl>
        </Card>
      ) : null}
      {v.hosted ? (
        <Card>
          <h2 className="font-semibold">{t("invoices")}</h2>
          <table className="mt-1 w-full text-sm" data-testid="invoices">
            <thead className="text-xs text-slate-500">
              <tr>
                <th className="text-start">{t("period")}</th>
                <th className="text-end">{t("total")}</th>
                <th className="text-start">{t("status")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {v.invoices.map((i) => (
                <tr key={i.id} data-testid="invoice-row" data-state={i.state}>
                  <td>
                    {i.periodFrom} → {i.periodTo}
                  </td>
                  <td className="text-end">{money(i.totalMinor, i.currency)}</td>
                  <td>{i.state}</td>
                  <td className="text-end">
                    <details>
                      <summary className="cursor-pointer text-xs underline">{t("explain")}</summary>
                      <p className="text-xs">
                        {t("peakBilled", {
                          n: String((i.draft as { peakUnits?: number }).peakUnits ?? 0),
                        })}
                      </p>
                      <ul className="text-xs">
                        {(
                          (
                            i.draft as {
                              lines?: Array<{
                                key: string;
                                description: string;
                                amountMinor: number;
                              }>;
                            }
                          ).lines ?? []
                        ).map((l) => (
                          <li key={l.key}>
                            {l.description}: {money(l.amountMinor, i.currency)}
                          </li>
                        ))}
                        <li>
                          {(i.draft as { vat?: { note: string } }).vat?.note}:{" "}
                          {money(i.vatMinor, i.currency)}
                        </li>
                      </ul>
                      {i.pdfUrl ? (
                        <a className="text-xs underline" href={i.pdfUrl}>
                          {t("pdf")}
                        </a>
                      ) : null}
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : null}
      <Card>
        <h2 className="font-semibold">{t("export")}</h2>
        <p className="text-xs text-slate-600">
          {v.hosted ? t("exportHint") : t("selfHostedExport")}
        </p>
        <form action={requestExportAction} className="mt-2">
          <Button type="submit" variant="secondary" data-testid="request-export">
            {t("requestExport")}
          </Button>
        </form>
        <ul className="mt-2 text-sm" data-testid="exports">
          {v.exports.map((e) => (
            <li key={e.id} data-testid="export-row" data-state={e.state}>
              {e.createdAt.slice(0, 16)} ·{" "}
              {e.state === "ready" ? t("exportReady") : t("exportRequested")}
              {e.state === "ready" ? (
                <a
                  className="ms-2 underline"
                  href={`/api/v1/exports/${e.id}`}
                  data-testid="download-export"
                >
                  {t("download")} ({Math.round((e.bytes ?? 0) / 1024)} kB)
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      </Card>
      {v.hosted && sub && !sub.cancelAtPeriodEnd ? (
        <Card>
          <h2 className="font-semibold">{t("cancel")}</h2>
          <p className="text-xs text-slate-600">{t("cancelHint")}</p>
          <form action={cancelSubscriptionAction} className="mt-2">
            <Button type="submit" variant="secondary" data-testid="cancel-subscription">
              {t("cancel")}
            </Button>
          </form>
        </Card>
      ) : null}
      {v.state !== "offboarding" ? (
        <Card>
          <h2 className="font-semibold">{t("leave")}</h2>
          <p className="text-xs text-slate-600">{t("leaveHint")}</p>
          <form action={leavePlatformAction} className="mt-2">
            <Button type="submit" variant="secondary" data-testid="leave-platform">
              {t("leaveConfirm")}
            </Button>
          </form>
        </Card>
      ) : null}
    </div>
  );
}
