import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { asSystem, rawRows, sql, withoutTenant } from "@pms/db";
import { searchPortfolio, type StorefrontResult } from "@pms/jobs";
import { container } from "@/server/container";
import { money } from "@/server/booking-engine";
import { SearchForm, type SearchParams } from "./search-form";

/**
 * Portfolio storefront (spec 10 §10.3): every organization's enabled properties,
 * dates and guests, attribute filters, a map, the cheapest sellable offer per
 * property. Server-rendered for SEO; nothing loads from a third party.
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
  const q =
    sp.arrival && sp.departure
      ? {
          arrivalDate: sp.arrival,
          departureDate: sp.departure,
          adults: Number(sp.adults ?? 2),
          children: Number(sp.children ?? 0),
          promoCode: sp.promo ?? null,
        }
      : null;
  const attributes = sp.attributes ? sp.attributes.split(",").filter(Boolean) : [];
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
    Object.entries(sp).filter(([k, v]) => k !== "attributes" && v) as [string, string][],
  ).toString();
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-sm text-slate-600">{t("subtitle")}</p>
      </header>
      <SearchForm
        action="/book"
        sp={sp}
        attributes={allAttributes}
        labels={{
          arrival: t("arrival"),
          departure: t("departure"),
          adults: t("adults"),
          children: t("children"),
          promo: t("promo"),
          search: t("search"),
          attributes: t("attributes"),
        }}
      />
      {mapped.length > 0 ? <Map results={mapped} label={t("map")} /> : null}
      <section aria-labelledby="results-title">
        <h2 id="results-title" className="mb-2 font-semibold">
          {t("properties")}
        </h2>
        {results.length === 0 ? (
          <p className="text-sm text-slate-600">{q ? t("noResults") : t("chooseDates")}</p>
        ) : null}
        <ul className="grid gap-3 sm:grid-cols-2" data-testid="storefront-results">
          {results.map((r) => (
            <li
              key={r.property.id}
              className="rounded-lg border border-slate-200 p-3"
              data-testid="storefront-card"
            >
              <h3 className="font-semibold">
                <Link
                  href={`/book/${r.property.id}${query ? `?${query}` : ""}`}
                  className="underline"
                >
                  {r.property.title}
                </Link>
              </h3>
              <p className="text-xs text-slate-600">
                {Object.values(r.property.address).filter(Boolean).join(", ")}
              </p>
              {r.property.settings.attributes.length ? (
                <p className="mt-1 text-xs text-slate-500">
                  {r.property.settings.attributes.join(" · ")}
                </p>
              ) : null}
              <p className="mt-2 text-sm">
                {r.from
                  ? `${t("from")} ${money(r.from.roomMinor, r.from.currency)} ${t("perStay")}`
                  : r.property.minRateMinor !== null
                    ? `${t("from")} ${money(r.property.minRateMinor, r.property.currency)} / ${t("night")}`
                    : t("chooseDates")}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </div>
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
    <figure className="rounded-lg border border-slate-200 bg-slate-50 p-2">
      <svg viewBox="0 0 600 300" role="img" aria-label={label} className="h-48 w-full">
        {results.map((r, i) => (
          <g key={r.property.id}>
            <circle cx={x(lngs[i]!)} cy={y(lats[i]!)} r={6} className="fill-emerald-600" />
            <text x={x(lngs[i]!) + 9} y={y(lats[i]!) + 4} className="fill-slate-700 text-[11px]">
              {r.property.title}
            </text>
          </g>
        ))}
      </svg>
      <figcaption className="text-xs text-slate-500">{label}</figcaption>
    </figure>
  );
}
