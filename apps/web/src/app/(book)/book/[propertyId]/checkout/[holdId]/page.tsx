import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { channelComparison, LocalDate, Money } from "@pms/core";
import { asSystem, DrizzleBookingEngineRepository } from "@pms/db";
import { parsePolicy } from "@pms/jobs";
import { container } from "@/server/container";
import { orgBrand, orgForHold } from "@/server/booking-engine";
import { day, dayMonth, money } from "@/lib/format";
import { Photo, SiteMain } from "@/components/site";
import { BookFooter, BookHeader } from "../../../chrome";
import { money2 } from "../../../labels";
import { CheckoutForm } from "./checkout-form";
import { EmbedResizer } from "../../embed-resizer";

/**
 * Steps 4–5 (spec 10 §10.2; persona: the guest paying): who is staying, the payment
 * per the guarantee policy, the terms accepted, and beside it the stay and the itemised
 * quote (BE-1) with what is due now and what booking direct saved.
 */
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
  const data = await asSystem(c.db.db, orgId, async (tx) => {
    const repo = new DrizzleBookingEngineRepository(tx, orgId, c.crypto);
    const hold = await repo.hold(holdId);
    if (!hold || hold.propertyId !== propertyId) return null;
    const [property] = await repo.storefront({ propertyId });
    const labels = await repo.labels(hold.roomTypeId, hold.ratePlanId);
    return { hold, property, labels };
  });
  if (!data) notFound();
  const { hold, property: p, labels } = data;
  const org = await orgBrand(orgId);
  const embed = Boolean(sp.embed);
  const expired = hold.state !== "held" || hold.expiresAt <= c.clock.now().toString();
  const q = hold.quote;
  const cur = q.currency;
  const policy = parsePolicy(p?.policy?.cancellation ?? null);
  const freeUntil = LocalDate.parse(hold.arrivalDate)
    .plusDays(-(policy.type === "flexible" ? policy.freeUntilDaysBefore : 0))
    .toString();
  const policyText =
    policy.type === "non_refundable"
      ? t("termsNonRefundable")
      : policy.type === "first_night"
        ? t("termsFirstNight")
        : t("policyFlexible", {
            date: dayMonth(freeUntil),
            fee:
              policy.lateFeePercent >= 100
                ? t("feeAll")
                : t("feePercent", { percent: policy.lateFeePercent }),
          });
  const rows: Array<[string, number]> = [
    [
      t("nightsTimes", { nights: q.nights, price: money(Math.round(q.roomMinor / q.nights), cur) }),
      q.roomMinor,
    ],
    ...q.extras.map((e): [string, number] => [
      e.quantity > 1 ? `${e.name} × ${String(e.quantity)}` : e.name,
      e.amountMinor,
    ]),
    ...(q.discountMinor > 0 ? [[t("discount"), -q.discountMinor] as [string, number]] : []),
    ...(q.vatMinor > 0 ? [[t("vat"), q.vatMinor] as [string, number]] : []),
    ...(q.cityTaxMinor > 0 ? [[t("cityTax"), q.cityTaxMinor] as [string, number]] : []),
  ];
  const restMinor = q.totalMinor - q.dueNowMinor;
  const paymentLine =
    q.dueNowMinor === 0
      ? t("payLineNothing", { label: q.dueNowLabel })
      : restMinor > 0
        ? t("payLinePart", {
            due: money2(q.dueNowMinor, cur),
            label: q.dueNowLabel,
            rest: money2(restMinor, cur),
          })
        : t("payLineFull", { due: money2(q.dueNowMinor, cur) });
  const savings =
    p && q.roomMinor > 0
      ? channelComparison(Money.of(q.roomMinor, cur), p.pricing, p.listedOn)
      : null;
  const where = p ? [p.address.city, p.address.country].filter(Boolean).join(", ") : "";
  const guests = [
    t("adultCount", { count: hold.adults }),
    ...(hold.children ? [t("childCount", { count: hold.children })] : []),
  ].join(", ");
  return (
    <>
      {embed ? <EmbedResizer /> : null}
      <BookHeader org={org} embed={embed} secure />
      <SiteMain id="main" className="max-w-[1040px] pt-8 pb-12">
        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="flex flex-col gap-5">
            <h1 className="font-display text-[34px] leading-tight font-extrabold tracking-[-0.025em] text-foreground">
              {t("checkoutTitle")}
            </h1>
            <p className="-mt-3 text-sm text-muted" data-testid="hold-until">
              {expired
                ? t("holdExpired")
                : t("holdUntil", { time: `${hold.expiresAt.slice(11, 16)} UTC` })}
            </p>
            {!expired ? (
              <CheckoutForm
                holdId={holdId}
                idempotencyKey={c.crypto.randomToken(8)}
                needsPayment={q.dueNowMinor > 0}
                guest={hold.guest}
                publishableKey={process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? null}
                paymentLine={paymentLine}
                acceptLine={t("acceptTerms", {
                  rate: labels.ratePlan ?? t("rate"),
                  policy: policyText,
                })}
                labels={{
                  whoIsStaying: t("whoIsStaying"),
                  firstName: t("firstName"),
                  lastName: t("lastName"),
                  email: t("email"),
                  emailHint: t("emailHint"),
                  phone: t("phone"),
                  requests: t("requests"),
                  requestsPlaceholder: t("requestsPlaceholder"),
                  consent: t("consent"),
                  payment: t("paymentTitle"),
                  cardToken: t("cardToken"),
                  cardError: t("cardError"),
                  confirm:
                    q.dueNowMinor > 0
                      ? t("payAndConfirm", { amount: money2(q.dueNowMinor, cur) })
                      : t("confirm"),
                  confirming: t("confirming"),
                  afterConfirm: t("afterConfirm"),
                  requiresAction: t("requiresAction"),
                  completeVerification: t("completeVerification"),
                  declined: t("declined", { reason: "{reason}" }),
                  holdExpired: t("holdExpired"),
                }}
              />
            ) : null}
          </div>
          <aside className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5 lg:sticky lg:top-5">
            <div className="flex items-center gap-3 border-b border-border pb-3.5">
              <Photo
                src={p?.photos[0]?.storageKey}
                seed={propertyId}
                alt=""
                className="h-14 w-[72px] shrink-0 rounded-xl"
              />
              <div className="min-w-0">
                <strong className="block text-[15px] text-foreground">{p?.title}</strong>
                <span className="text-xs text-muted">
                  {[p?.kind === "multi_unit" ? labels.roomType : null, where]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </div>
            </div>
            <dl className="flex flex-col gap-2 border-b border-border pb-3.5 text-sm">
              <Fact
                label={t("checkIn")}
                value={`${day(hold.arrivalDate)}${p?.policy ? ` · ${t("fromTime", { time: p.policy.checkInTime.slice(0, 5) })}` : ""}`}
              />
              <Fact
                label={t("checkOut")}
                value={`${day(hold.departureDate)}${p?.policy ? ` · ${t("byTime", { time: p.policy.checkOutTime.slice(0, 5) })}` : ""}`}
              />
              <Fact label={t("guests")} value={guests} />
              {labels.ratePlan ? <Fact label={t("rate")} value={labels.ratePlan} /> : null}
            </dl>
            <table className="w-full text-sm" data-testid="quote">
              <tbody>
                {rows.map(([label, minor]) => (
                  <tr key={label}>
                    <td className="py-1">{label}</td>
                    <td className="py-1 text-end tabular-nums">{money2(minor, cur)}</td>
                  </tr>
                ))}
                <tr className="border-t border-border font-bold">
                  <td className="pt-2.5 pb-1">{t("total")}</td>
                  <td className="pt-2.5 pb-1 text-end tabular-nums" data-testid="quote-total">
                    {money2(q.totalMinor, cur)}
                  </td>
                </tr>
                <tr className="font-semibold text-accent">
                  <td className="py-1">{t("dueNow")}</td>
                  <td className="py-1 text-end tabular-nums" data-testid="quote-due">
                    {money2(q.dueNowMinor, cur)}
                  </td>
                </tr>
              </tbody>
            </table>
            <p className="text-xs text-muted">{t("chargeCurrency", { currency: cur })}</p>
            {savings && savings.price.minor > q.roomMinor ? (
              <p>
                <span className="inline-flex rounded-full bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent-soft-foreground">
                  {t("youSave", {
                    amount: money(savings.price.minor - q.roomMinor, cur),
                    channel: t(`channel.${savings.channel}`),
                  })}
                </span>
              </p>
            ) : null}
          </aside>
        </div>
      </SiteMain>
      <BookFooter org={org} embed={embed} />
    </>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="text-end font-semibold text-foreground">{value}</dd>
    </div>
  );
}
