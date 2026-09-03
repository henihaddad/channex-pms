import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { asSystem, DrizzleBookingEngineRepository } from "@pms/db";
import { container } from "@/server/container";
import { money, orgForHold } from "@/server/booking-engine";
import { CheckoutForm } from "./checkout-form";
import { EmbedResizer } from "../../embed-resizer";

/** Steps 4–5 (spec 10 §10.2): the itemised quote (BE-1), guest details, payment per policy. */
export default async function CheckoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ propertyId: string; holdId: string }>;
  searchParams: Promise<{ embed?: string }>;
}) {
  const { propertyId, holdId } = await params;
  const sp = await searchParams;
  const orgId = await orgForHold(holdId);
  if (!orgId) notFound();
  const t = await getTranslations("book");
  const c = await container();
  const hold = await asSystem(c.db.db, orgId, (tx) =>
    new DrizzleBookingEngineRepository(tx, orgId, c.crypto).hold(holdId),
  );
  if (!hold || hold.propertyId !== propertyId) notFound();
  const expired = hold.state !== "held" || hold.expiresAt <= c.clock.now().toString();
  const q = hold.quote;
  const cur = q.currency;
  const rows: Array<[string, number]> = [
    [t("room"), q.roomMinor],
    ...q.extras.map((e): [string, number] => [`${e.name} × ${String(e.quantity)}`, e.amountMinor]),
    ...(q.discountMinor > 0 ? [[t("discount"), -q.discountMinor] as [string, number]] : []),
    ...(q.vatMinor > 0 ? [[t("vat"), q.vatMinor] as [string, number]] : []),
    ...(q.cityTaxMinor > 0 ? [[t("cityTax"), q.cityTaxMinor] as [string, number]] : []),
  ];
  return (
    <div className="space-y-6">
      {sp.embed ? <EmbedResizer /> : null}
      <h1 className="text-2xl font-bold">{t("checkoutTitle")}</h1>
      <p className="text-sm text-muted" data-testid="hold-until">
        {expired
          ? t("holdExpired")
          : t("holdUntil", { time: new Date(hold.expiresAt).toUTCString().slice(17, 22) + " UTC" })}
        {" · "}
        {hold.arrivalDate} → {hold.departureDate} · {q.nights}{" "}
        {q.nights === 1 ? t("night") : t("nights")}
      </p>
      <section aria-labelledby="quote-title" className="rounded-lg border border-line p-3">
        <h2 id="quote-title" className="mb-2 font-semibold">
          {t("quote")}
        </h2>
        <table className="w-full text-sm" data-testid="quote">
          <tbody>
            {rows.map(([label, minor]) => (
              <tr key={label}>
                <td>{label}</td>
                <td className="text-end">{money(minor, cur)}</td>
              </tr>
            ))}
            <tr className="border-t border-line font-semibold">
              <td>{t("total")}</td>
              <td className="text-end" data-testid="quote-total">
                {money(q.totalMinor, cur)}
              </td>
            </tr>
            <tr>
              <td>
                {t("dueNow")} ({q.dueNowLabel})
              </td>
              <td className="text-end" data-testid="quote-due">
                {money(q.dueNowMinor, cur)}
              </td>
            </tr>
          </tbody>
        </table>
        <p className="mt-1 text-xs text-muted">{t("chargeCurrency", { currency: cur })}</p>
      </section>
      {!expired ? (
        <CheckoutForm
          holdId={holdId}
          idempotencyKey={c.crypto.randomToken(8)}
          needsPayment={q.dueNowMinor > 0}
          guest={hold.guest}
          labels={{
            guestDetails: t("guestDetails"),
            firstName: t("firstName"),
            lastName: t("lastName"),
            email: t("email"),
            phone: t("phone"),
            requests: t("requests"),
            consent: t("consent"),
            payment: t("payment"),
            cardToken: t("cardToken"),
            paymentHint: t("paymentHint"),
            confirm: t("confirm"),
            confirming: t("confirming"),
            requiresAction: t("requiresAction"),
            completeVerification: t("completeVerification"),
            declined: t("declined", { reason: "{reason}" }),
            holdExpired: t("holdExpired"),
          }}
        />
      ) : null}
    </div>
  );
}
