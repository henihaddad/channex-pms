import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { asSystem, DrizzleBookingEngineRepository } from "@pms/db";
import { searchProperty, type PropertySearch } from "@pms/jobs";
import { container } from "@/server/container";
import { money, orgForProperty } from "@/server/booking-engine";
import { Button } from "@/components/ui";
import { holdAction } from "../book.actions";
import { SearchForm, type SearchParams } from "../search-form";
import { EmbedResizer } from "./embed-resizer";

/** Per-property page (spec 10 §10.2 steps 1–3): dates, results per room type × rate plan, extras, hold. */
export default async function PropertyBookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ propertyId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { propertyId } = await params;
  const sp = await searchParams;
  const orgId = await orgForProperty(propertyId);
  if (!orgId) notFound();
  const t = await getTranslations("book");
  const c = await container();
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
        adults: Number(sp.adults ?? 2),
        children: Number(sp.children ?? 0),
        promoCode: sp.promo ?? null,
      });
    return { property, extras, search };
  });
  if (!data) notFound();
  const { property, extras, search } = data;
  const theme = property.settings.theme;
  return (
    <div className="space-y-6" style={theme.colour ? { ["--brand" as string]: theme.colour } : {}}>
      {sp.embed ? <EmbedResizer /> : null}
      <header>
        <h1 className="text-2xl font-bold" style={theme.colour ? { color: theme.colour } : {}}>
          {property.title}
        </h1>
        <p className="text-sm text-muted">
          {Object.values(property.address).filter(Boolean).join(", ")}
        </p>
        {property.settings.description ? (
          <p className="mt-2 text-sm">{property.settings.description}</p>
        ) : null}
        {property.policy ? (
          <p className="mt-1 text-xs text-muted">
            {t("checkIn")} {property.policy.checkInTime} · {t("checkOut")}{" "}
            {property.policy.checkOutTime} · {t("policy")}:{" "}
            {String(property.policy.cancellation.type ?? "flexible")}
          </p>
        ) : null}
      </header>
      <SearchForm
        action={`/book/${propertyId}`}
        sp={sp}
        labels={{
          arrival: t("arrival"),
          departure: t("departure"),
          adults: t("adults"),
          children: t("children"),
          promo: t("promo"),
          search: t("search"),
        }}
      />
      {search?.promoProblem ? (
        <p className="text-sm text-rose" role="alert">
          {search.promoProblem}
        </p>
      ) : null}
      {!search ? <p className="text-sm text-muted">{t("chooseDates")}</p> : null}
      {search && search.offers.length === 0 ? (
        <p className="text-sm text-muted" data-testid="no-offers">
          {t("noResults")}
        </p>
      ) : null}
      <ul className="space-y-3" data-testid="offers">
        {search?.offers.map((o) => (
          <li
            key={`${o.roomTypeId}:${o.ratePlanId}`}
            className="rounded-lg border border-line p-3"
            data-testid="offer"
          >
            <form action={holdAction} className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <input type="hidden" name="propertyId" value={propertyId} />
              <input type="hidden" name="roomTypeId" value={o.roomTypeId} />
              <input type="hidden" name="ratePlanId" value={o.ratePlanId} />
              <input type="hidden" name="arrival" value={sp.arrival} />
              <input type="hidden" name="departure" value={sp.departure} />
              <input type="hidden" name="adults" value={sp.adults ?? "2"} />
              <input type="hidden" name="children" value={sp.children ?? "0"} />
              <input type="hidden" name="promo" value={sp.promo ?? ""} />
              {sp.embed ? <input type="hidden" name="embed" value="1" /> : null}
              <div>
                <h2 className="font-semibold">
                  {o.roomTypeTitle} · {o.ratePlanTitle}
                  {o.directOnly ? (
                    <span className="ms-2 rounded bg-mint-soft px-1.5 text-[10px] text-mint-deep">
                      {t("directOnly")}
                    </span>
                  ) : null}
                </h2>
                <p className="text-sm">
                  <strong data-testid="offer-total">{money(o.roomMinor, o.currency)}</strong>{" "}
                  {t("perStay")} · {o.nights} {o.nights === 1 ? t("night") : t("nights")}
                  {o.mealPlan ? ` · ${o.mealPlan}` : ""}
                  <span className="ms-2 text-xs text-muted">
                    {t("roomsLeft", { count: o.available })}
                  </span>
                </p>
                {extras.length ? (
                  <fieldset className="mt-2">
                    <legend className="text-xs text-muted">{t("extras")}</legend>
                    <div className="flex flex-wrap gap-3 text-sm">
                      {extras.map((e) => (
                        <label key={e.id} className="flex items-center gap-1">
                          <input type="checkbox" name="extra" value={e.id} />
                          {e.name} ({money(e.priceMinor, o.currency)}/{e.per})
                        </label>
                      ))}
                    </div>
                  </fieldset>
                ) : null}
              </div>
              <div className="flex items-end">
                <Button type="submit" data-testid="book-offer">
                  {t("book")}
                </Button>
              </div>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
