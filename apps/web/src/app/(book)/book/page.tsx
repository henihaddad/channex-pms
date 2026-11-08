import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { channelComparison, Money } from "@pms/core";
import { asSystem, rawRows, sql, withoutTenant } from "@pms/db";
import { searchPortfolio, type StorefrontResult } from "@pms/jobs";
import { container } from "@/server/container";
import { money, nightsBetween } from "@/lib/format";
import { Eyebrow, Photo, tint } from "@/components/site";
import { BookFooter, BookHeader } from "./chrome";
import { searchLabels, stayRange } from "./labels";
import { SearchForm, type SearchParams } from "./search-form";

/**
 * Portfolio storefront (spec 10 §10.3; persona: the guest who found the place on an OTA
 * and came to book direct). The manager's brand, the hero, the search pill, one card per
 * enabled property with its nightly price for the dates (and what it costs on the OTA it
 * is listed on), then why booking direct pays. Server-rendered for SEO; nothing loads
 * from a third party.
 */
export default async function StorefrontPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams & { org?: string }>;
}) {
  const sp = await searchParams;
  const t = await getTranslations("book");
  const c = await container();
  const orgs = await withoutTenant(c.db.db, (tx) =>
    rawRows<{ org_id: string; name: string }>(
      tx,
      sql`select distinct s.org_id, o.name from booking_engine_settings s join organization o on o.id = s.org_id where s.enabled ${sp.org ? sql`and s.org_id = ${sp.org}` : sql``} order by o.name`,
    ),
  );
  const adults = Number(sp.adults ?? 2);
  const children = Number(sp.children ?? 0);
  const q =
    sp.arrival && sp.departure
      ? {
          arrivalDate: sp.arrival,
          departureDate: sp.departure,
          adults,
          children,
          promoCode: sp.promo ?? null,
        }
      : null;
  const attributes = ([] as string[])
    .concat(sp.attributes ?? [])
    .flatMap((a) => a.split(","))
    .filter(Boolean);
  const results: StorefrontResult[] = [];
  for (const o of orgs)
    results.push(
      ...(await asSystem(c.db.db, o.org_id, (tx) =>
        searchPortfolio(c, tx, o.org_id, q, { attributes }),
      )),
    );
  const allAttributes = [...new Set(results.flatMap((r) => r.property.settings.attributes))].sort();
  const mapped = results.filter((r) => r.property.settings.lat && r.property.settings.lng);
  const query = new URLSearchParams(
    Object.entries(sp).filter(([k, v]) => k !== "attributes" && typeof v === "string" && v) as [
      string,
      string,
    ][],
  ).toString();
  const org = orgs.length === 1 ? { id: orgs[0]!.org_id, name: orgs[0]!.name } : null;
  const embed = Boolean(sp.embed);
  const nights = q ? nightsBetween(q.arrivalDate, q.departureDate) : 0;
  const party = [
    t("adultCount", { count: adults }),
    ...(children ? [t("childCount", { count: children })] : []),
  ].join(", ");
  return (
    <>
      <BookHeader org={org} embed={embed} />
      <main id="main" className="flex flex-col">
        <div className="px-4 sm:px-6">
          <div className="mx-auto flex max-w-[1200px] flex-col gap-7 pt-10 pb-8 sm:pt-14">
            <div className="flex max-w-[760px] flex-col gap-2.5" id="top">
              <Eyebrow>{t("eyebrow")}</Eyebrow>
              <h1 className="font-display text-[34px] leading-[1.04] font-extrabold tracking-[-0.025em] text-foreground sm:text-[52px] sm:leading-[1.02]">
                <span className="sm:hidden">{t("heroShort")}</span>
                <span className="max-sm:hidden">{t("hero")}</span>
              </h1>
              <p className="max-w-[600px] text-[17px] leading-normal text-muted max-sm:hidden">
                {t("lead")}
              </p>
            </div>
            <SearchForm
              action="/book"
              sp={sp}
              attributes={allAttributes}
              labels={searchLabels(t)}
            />
          </div>
        </div>
        <section id="stays" aria-labelledby="results-title" className="px-4 pb-14 sm:px-6">
          <div className="mx-auto flex max-w-[1200px] flex-col gap-5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h2
                id="results-title"
                className="font-display text-[22px] font-bold tracking-[-0.02em] text-foreground sm:text-[26px]"
              >
                {q
                  ? t("placesFor", {
                      count: results.length,
                      range: stayRange(q.arrivalDate, q.departureDate),
                    })
                  : t("places", { count: results.length })}
              </h2>
              {results.length > 0 ? (
                <p className="text-sm text-muted">
                  {q ? t("perNightFor", { nights, party }) : t("perNightFrom")}
                </p>
              ) : null}
            </div>
            {results.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-border bg-surface px-5 py-8 text-center text-sm text-muted">
                {q ? t("noResults") : t("noPlaces")}
              </p>
            ) : null}
            <ul
              className="grid grid-cols-[repeat(auto-fill,minmax(270px,1fr))] gap-5"
              data-testid="storefront-results"
            >
              {results.map((r, i) => (
                <li key={r.property.id} data-testid="storefront-card">
                  <PlaceCard
                    r={r}
                    tone={tint(String(i))}
                    href={`/book/${r.property.id}${query ? `?${query}` : ""}`}
                    t={t}
                  />
                </li>
              ))}
            </ul>
            {mapped.length > 0 ? <Map results={mapped} label={t("map")} /> : null}
          </div>
        </section>
      </main>
      {embed ? null : (
        <section id="why" className="bg-foreground px-4 py-14 text-white sm:px-6">
          <div className="mx-auto grid max-w-[1200px] grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-7">
            <div className="col-span-full max-w-[560px]">
              <h2 className="mb-2 font-display text-[30px] font-bold tracking-[-0.02em]">
                {t("whyDirect")}
              </h2>
              <p className="text-[15px] leading-normal text-[#b6c0bd]">{t("whyLead")}</p>
            </div>
            {(["why1", "why2", "why3"] as const).map((k) => (
              <div key={k} className="flex flex-col gap-2">
                <span className="bridge-rail block h-[3px] w-9 rounded-sm" aria-hidden="true" />
                <h3 className="text-base font-bold">{t(`${k}Title`)}</h3>
                <p className="text-sm leading-normal text-[#b6c0bd]">{t(`${k}Body`)}</p>
              </div>
            ))}
          </div>
        </section>
      )}
      <BookFooter org={org} embed={embed} />
    </>
  );
}

type T = Awaited<ReturnType<typeof getTranslations<"book">>>;

/** One place: photo with its badge, title and rating, where and who it sleeps, the nightly price. */
function PlaceCard({
  r,
  href,
  tone,
  t,
}: {
  r: StorefrontResult;
  href: string;
  tone: string;
  t: T;
}) {
  const p = r.property;
  const perNight = r.from ? Math.round(r.from.roomMinor / r.from.nights) : p.minRateMinor;
  const compare =
    perNight !== null
      ? channelComparison(Money.of(perNight, p.currency), p.pricing, p.listedOn)
      : null;
  const badge = r.from?.directOnly
    ? { text: t("directOnly"), cls: "bg-accent text-white" }
    : r.from && p.kind === "multi_unit" && r.from.available <= 2
      ? { text: t("roomsLeft", { count: r.from.available }), cls: "bg-surface text-foreground" }
      : p.settings.attributes[0]
        ? { text: p.settings.attributes[0], cls: "bg-foreground text-white" }
        : null;
  const where = [p.address.city, p.address.country].filter(Boolean).join(", ");
  const facts = [where, p.sleeps ? t("sleeps", { count: p.sleeps }) : null].filter(Boolean);
  return (
    <Link
      href={href}
      className="group flex h-full flex-col overflow-hidden rounded-[18px] border border-border bg-surface transition-shadow hover:shadow-[0_12px_32px_rgba(20,23,22,0.08)]"
    >
      <Photo
        src={p.photos[0]?.storageKey}
        seed={p.id}
        tone={tone}
        alt=""
        className="aspect-[4/3] max-sm:aspect-[16/9]"
      >
        {badge ? (
          <span
            className={`absolute start-3 top-3 rounded-full px-2.5 py-1 text-xs font-semibold ${badge.cls}`}
          >
            {badge.text}
          </span>
        ) : null}
      </Photo>
      <div className="flex flex-col gap-2 px-[18px] pt-4 pb-[18px]">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-[17px] font-bold tracking-[-0.01em] text-foreground">{p.title}</h3>
          {p.reviews.count > 0 ? (
            <span className="text-[13px] whitespace-nowrap text-muted">
              ★ {(p.reviews.ratingSum / p.reviews.count / 2).toFixed(1)} · {p.reviews.count}
            </span>
          ) : null}
        </div>
        {facts.length ? <p className="text-[13px] text-muted">{facts.join(" · ")}</p> : null}
        <p className="mt-1.5 text-[15px]">
          {perNight === null ? (
            <span className="text-muted">{t("chooseDates")}</span>
          ) : (
            <>
              {r.from ? null : <span className="text-muted">{t("from")} </span>}
              <strong className="text-[19px] font-extrabold tracking-[-0.01em]">
                {money(perNight, p.currency)}
              </strong>{" "}
              <span className="text-muted">/ {t("night")}</span>
              {compare ? (
                <span
                  className="ms-1.5 text-[13px] text-muted line-through"
                  title={t("onChannel", {
                    price: money(compare.price.minor, p.currency),
                    channel: t(`channel.${compare.channel}`),
                  })}
                >
                  {money(compare.price.minor, p.currency)}
                </span>
              ) : null}
            </>
          )}
        </p>
      </div>
    </Link>
  );
}

/** A dependency-free map: positions normalised into an SVG, so no tile server is ever contacted (BE-11). */
function Map({ results, label }: { results: StorefrontResult[]; label: string }) {
  const lats = results.map((r) => Number(r.property.settings.lat));
  const lngs = results.map((r) => Number(r.property.settings.lng));
  const span = (xs: number[]) => Math.max(0.01, Math.max(...xs) - Math.min(...xs));
  const x = (lng: number) => 20 + ((lng - Math.min(...lngs)) / span(lngs)) * 560;
  const y = (lat: number) => 280 - ((lat - Math.min(...lats)) / span(lats)) * 240;
  return (
    <figure className="rounded-[18px] border border-border bg-surface p-3">
      <svg viewBox="0 0 600 300" role="img" aria-label={label} className="h-48 w-full">
        {results.map((r, i) => (
          <g key={r.property.id}>
            <circle cx={x(lngs[i]!)} cy={y(lats[i]!)} r={6} className="fill-accent" />
            <text x={x(lngs[i]!) + 9} y={y(lats[i]!) + 4} className="fill-foreground text-xs">
              {r.property.title}
            </text>
          </g>
        ))}
      </svg>
      <figcaption className="text-xs text-muted">{label}</figcaption>
    </figure>
  );
}
