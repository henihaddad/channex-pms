import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { channelComparison, LocalDate, Money, nightlyPrices } from "@pms/core";
import { asSystem, DrizzleBookingEngineRepository } from "@pms/db";
import { parsePolicy, searchProperty, type PropertySearch } from "@pms/jobs";
import { container } from "@/server/container";
import { orgBrand, orgForProperty } from "@/server/booking-engine";
import { dayMonth, money } from "@/lib/format";
import { Eyebrow, Photo, SiteMain } from "@/components/site";
import { cn } from "@/components/ui";
import { BookFooter, BookHeader } from "../chrome";
import type { SearchParams } from "../search-form";
import { BookingPanel, type PanelOffer } from "./booking-panel";
import { EmbedResizer } from "./embed-resizer";

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/**
 * A property on the booking site (spec 10 §10.2 steps 1–3; persona: the guest deciding
 * where to stay): photos, what it is and who it sleeps, the description and what is
 * there, a month of nightly prices read from our own ARI, the house terms, and the
 * booking card that holds the room.
 */
export default async function PropertyBookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ propertyId: string }>;
  searchParams: Promise<SearchParams & { month?: string }>;
}) {
  const { propertyId } = await params;
  const sp = await searchParams;
  const orgId = await orgForProperty(propertyId);
  if (!orgId) notFound();
  const t = await getTranslations("book");
  const c = await container();
  const adults = Number(sp.adults ?? 2);
  const children = Number(sp.children ?? 0);
  const data = await asSystem(c.db.db, orgId, async (tx) => {
    const repo = new DrizzleBookingEngineRepository(tx, orgId, c.crypto);
    const [property] = await repo.storefront({ propertyId });
    if (!property) return null;
    const extras = (await repo.extras(propertyId)).filter((e) => e.active);
    let search: PropertySearch | null = null;
    if (sp.arrival && sp.departure)
      search = await searchProperty(c, tx, orgId, propertyId, {
        arrivalDate: sp.arrival,
        departureDate: sp.departure,
        adults,
        children,
        promoCode: sp.promo ?? null,
      });
    const today = c.clock.today(property.timezone);
    const month = monthOf(sp.month, sp.arrival, today);
    const next = addMonths(month, 1);
    const dates: string[] = [];
    for (let d = month; d.isBefore(next); d = d.plusDays(1)) dates.push(d.toString());
    const nightly = nightlyPrices(
      await repo.searchable(propertyId, month.toString(), next.toString()),
      dates,
      adults + children,
    );
    return { property, extras, search, today: today.toString(), month, dates, nightly };
  });
  if (!data) notFound();
  const { property: p, extras, search, today, month, dates, nightly } = data;
  const org = await orgBrand(orgId);
  const embed = Boolean(sp.embed);
  const cur = p.currency;
  const policy = parsePolicy(p.policy?.cancellation ?? null);
  const compareLabel = (perNight: number) => {
    const cmp = channelComparison(Money.of(perNight, cur), p.pricing, p.listedOn);
    return cmp
      ? {
          minor: cmp.price.minor,
          label: t("onChannel", {
            price: money(cmp.price.minor, cur),
            channel: t(`channel.${cmp.channel}`),
          }),
        }
      : null;
  };
  const terms =
    policy.type === "non_refundable"
      ? t("termsNonRefundable")
      : policy.type === "first_night"
        ? t("termsFirstNight")
        : sp.arrival
          ? t("termsFreeUntil", {
              date: dayMonth(
                LocalDate.parse(sp.arrival).plusDays(-policy.freeUntilDaysBefore).toString(),
              ),
            })
          : t("termsFreeDays", { days: policy.freeUntilDaysBefore });
  const offers: PanelOffer[] | null = search
    ? search.offers.map((offer) => ({
        offer,
        compare: compareLabel(Math.round(offer.roomMinor / offer.nights)),
        terms,
      }))
    : null;
  const where = [p.address.city, p.address.country].filter(Boolean).join(", ");
  const rating =
    p.reviews.count > 0 ? (p.reviews.ratingSum / p.reviews.count / 2).toFixed(2) : null;
  const facts = [
    p.sleeps ? t("sleepsCap", { count: p.sleeps }) : null,
    rating ? t("ratingLine", { rating, count: p.reviews.count }) : null,
  ].filter(Boolean);
  const query = (extra: Record<string, string>) =>
    new URLSearchParams(
      Object.entries({ ...sp, ...extra }).filter(([, v]) => typeof v === "string" && v) as [
        string,
        string,
      ][],
    ).toString();
  const stayNights =
    sp.arrival && sp.departure
      ? Math.max(1, LocalDate.parse(sp.arrival).daysUntil(LocalDate.parse(sp.departure)))
      : 1;
  const inStay = (d: string) =>
    Boolean(sp.arrival && sp.departure && d >= sp.arrival && d < sp.departure);
  const lead = LocalDate.parse(dates[0]!).dayOfWeek - 1;
  const monthName = new Intl.DateTimeFormat("en-GB", { month: "long", timeZone: "UTC" }).format(
    new Date(`${dates[0]}T00:00:00Z`),
  );
  const photos = p.photos.slice(0, 5);
  const guestOptions = (
    [
      [1, 0],
      [2, 0],
      [2, 1],
      [2, 2],
      [3, 0],
      [4, 0],
      [5, 0],
      [6, 0],
    ] as Array<[number, number]>
  ).filter(([a, ch]) => !(a === adults && ch === children));
  guestOptions.unshift([adults, children]);
  const goodToKnow = [
    p.policy
      ? t("goodCheckTimes", {
          in: p.policy.checkInTime.slice(0, 5),
          out: p.policy.checkOutTime.slice(0, 5),
        })
      : null,
    policy.type === "flexible"
      ? t("goodCancelFlexible", { days: policy.freeUntilDaysBefore })
      : policy.type === "first_night"
        ? t("termsFirstNight")
        : t("termsNonRefundable"),
    p.settings.taxes.cityTaxPerPersonNightMinor > 0
      ? t("goodCityTax", { amount: money(p.settings.taxes.cityTaxPerPersonNightMinor, cur) })
      : null,
    p.settings.taxes.vatBps > 0 ? t("goodVat", { percent: p.settings.taxes.vatBps / 100 }) : null,
  ].filter(Boolean);
  return (
    <>
      {embed ? <EmbedResizer /> : null}
      <BookHeader org={org} embed={embed} />
      <SiteMain id="main" className="flex flex-col gap-6 pt-7 pb-12">
        {embed ? null : (
          <p className="text-[13px] text-muted">
            <Link
              href={`/book?org=${orgId}`}
              className="text-accent hover:text-accent-soft-foreground"
            >
              {t("ourPlaces")}
            </Link>{" "}
            / {p.title}
          </p>
        )}
        <div className="grid h-[260px] grid-cols-[2fr_1fr_1fr] grid-rows-2 gap-2.5 max-sm:grid-cols-1 sm:h-[410px]">
          <Photo
            src={photos[0]?.storageKey}
            seed={p.id}
            alt={p.title}
            className="row-span-2 rounded-[18px]"
          />
          {[1, 2, 3, 4].map((i) => (
            <Photo
              key={i}
              src={photos[i]?.storageKey}
              seed={`${p.id}${i}`}
              alt=""
              className="rounded-[14px] max-sm:hidden"
            >
              {i === 4 && p.photos.length > 5 ? (
                <span className="absolute inset-0 flex items-center justify-center bg-accent-soft/70 text-[13px] font-semibold text-accent-soft-foreground">
                  {t("allPhotos", { count: p.photos.length })}
                </span>
              ) : null}
            </Photo>
          ))}
        </div>
        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,3fr)_380px]">
          <div className="flex flex-col gap-7">
            <div>
              {where ? <Eyebrow>{where}</Eyebrow> : null}
              <h1 className="mt-1.5 font-display text-[32px] leading-[1.05] font-extrabold tracking-[-0.025em] text-foreground sm:text-[40px]">
                {p.title}
              </h1>
              {facts.length ? (
                <p className="mt-2 text-[15px] text-muted">{facts.join(" · ")}</p>
              ) : null}
            </div>
            {p.settings.description ? (
              <p className="max-w-[640px] text-base leading-relaxed whitespace-pre-line">
                {p.settings.description}
              </p>
            ) : null}
            {p.settings.attributes.length > 0 ? (
              <section>
                <h2 className="text-lg font-bold">{t("whatsHere")}</h2>
                <ul className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2">
                  {p.settings.attributes.map((a) => (
                    <li key={a} className="flex items-center gap-2 text-sm">
                      <span className="size-1.5 rounded-full bg-accent" aria-hidden="true" />
                      {a}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            <section aria-labelledby="nightly-title">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 id="nightly-title" className="text-lg font-bold">
                  {t("pricesByNight", { month: monthName })}
                </h2>
                <span className="flex gap-3 text-[13px]">
                  {month.toString() > today.slice(0, 7) + "-01" ? (
                    <Link
                      href={`?${query({ month: addMonths(month, -1).toString().slice(0, 7) })}`}
                      className="text-accent"
                      scroll={false}
                    >
                      ← {t("earlier")}
                    </Link>
                  ) : null}
                  <Link
                    href={`?${query({ month: addMonths(month, 1).toString().slice(0, 7) })}`}
                    className="text-accent"
                    scroll={false}
                  >
                    {t("later")} →
                  </Link>
                </span>
              </div>
              <p className="mt-1 text-[13px] text-muted">
                {p.listedOn.length > 0 ? t("nightlyHintListed") : t("nightlyHint")}
              </p>
              <div
                className="mt-3 grid grid-cols-7 gap-1 rounded-2xl border border-border bg-surface p-3.5"
                data-testid="nightly-prices"
              >
                {DOW.map((d) => (
                  <span key={d} className="pb-1 text-center text-[11px] text-muted">
                    {t(`dow.${d}`)}
                  </span>
                ))}
                {Array.from({ length: lead }, (_, i) => (
                  <span key={`b${i}`} />
                ))}
                {dates.map((d) => {
                  const price = d < today ? null : (nightly.get(d) ?? null);
                  const picked = inStay(d);
                  const n = Number(d.slice(8));
                  const body = (
                    <>
                      <span className="text-[13px] font-semibold">{n}</span>
                      <span className="text-[10px]">
                        {price === null ? "—" : money(price, cur)}
                      </span>
                    </>
                  );
                  const cls = cn(
                    "flex flex-col items-center justify-center gap-0.5 rounded-[10px] py-1.5",
                    picked
                      ? "bg-accent text-white"
                      : price === null
                        ? "text-muted/50"
                        : "text-foreground hover:bg-default",
                  );
                  return price === null ? (
                    <span key={d} className={cls} aria-label={`${n} ${t("taken")}`}>
                      {body}
                    </span>
                  ) : (
                    <Link
                      key={d}
                      href={`?${query({
                        arrival: d,
                        departure: LocalDate.parse(d).plusDays(stayNights).toString(),
                        month: d.slice(0, 7),
                      })}`}
                      className={cls}
                      scroll={false}
                    >
                      {body}
                    </Link>
                  );
                })}
              </div>
            </section>
            {goodToKnow.length > 0 ? (
              <section>
                <h2 className="text-lg font-bold">{t("goodToKnow")}</h2>
                <ul className="mt-2.5 list-disc ps-[18px] text-sm leading-[1.7] text-muted">
                  {goodToKnow.map((g) => (
                    <li key={g}>{g}</li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
          <BookingPanel
            propertyId={propertyId}
            currency={cur}
            sp={{
              arrival: sp.arrival,
              departure: sp.departure,
              adults,
              children,
              promo: sp.promo,
              embed: sp.embed,
            }}
            offers={offers}
            extras={extras}
            taxes={p.settings.taxes}
            guarantee={p.settings.guarantee}
            promo={search?.promo ?? null}
            nowIso={`${today}T00:00:00Z`}
            fromMinor={p.minRateMinor}
            fromCompare={p.minRateMinor !== null ? compareLabel(p.minRateMinor) : null}
            scarce={p.kind === "multi_unit"}
            error={
              search?.promoProblem ??
              (sp.error
                ? t.has(`errors.${sp.error}`)
                  ? t(`errors.${sp.error}`)
                  : t("errors.generic")
                : null)
            }
            guestOptions={guestOptions.map(([a, ch]) => ({
              value: `${a}-${ch}`,
              label: [
                t("adultCount", { count: a }),
                ...(ch ? [t("childCount", { count: ch })] : []),
              ].join(", "),
            }))}
            labels={{
              bookTitle: t("bookTitle"),
              chooseDates: t("chooseDates"),
              from: t("from"),
              night: t("night"),
              checkIn: t("checkIn"),
              checkOut: t("checkOut"),
              guests: t("guests"),
              checkPrices: t("checkPrices"),
              update: t("update"),
              noResults: t("noResults"),
              rate: t("rate"),
              directOnly: t("directOnly"),
              left1: t("roomsLeft", { count: 1 }),
              left2: t("roomsLeft", { count: 2 }),
              extras: t("extras"),
              per_stay: t("perStayShort"),
              per_night: t("night"),
              per_person: t("perPerson"),
              nightsTimes: t("nightsTimes", { nights: stayNights, price: "{price}" }),
              discount: t("discount"),
              vat: t("vat"),
              cityTax: t("cityTax"),
              total: t("total"),
              book: t("bookTotal", { total: "{total}" }),
              instant: t("instant"),
              noFee: t("noFee"),
              payPercent: t("payPercent", { percent: "{percent}" }),
              payNow: t("payNow", { amount: "{amount}" }),
              cardHeld: t("cardHeld"),
              payAtProperty: t("payAtProperty"),
            }}
          />
        </div>
      </SiteMain>
      <BookFooter org={org} embed={embed} />
    </>
  );
}

/** The first of the month `n` months away from the first of `month`. */
function addMonths(month: LocalDate, n: number): LocalDate {
  const index = month.year * 12 + (month.month - 1) + n;
  return LocalDate.of(Math.floor(index / 12), (index % 12) + 1, 1);
}

/** The month the nightly prices show: the one asked for, the arrival's, or this one. */
function monthOf(
  month: string | undefined,
  arrival: string | undefined,
  today: LocalDate,
): LocalDate {
  const pick = /^\d{4}-\d{2}$/.test(month ?? "")
    ? `${month}-01`
    : /^\d{4}-\d{2}-\d{2}$/.test(arrival ?? "")
      ? `${arrival!.slice(0, 7)}-01`
      : `${today.toString().slice(0, 7)}-01`;
  return LocalDate.parse(pick);
}
