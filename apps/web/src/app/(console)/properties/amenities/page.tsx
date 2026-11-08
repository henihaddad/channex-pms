import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button, Card, Chip, EmptyState, PageHeader, Textarea } from "@/components/ui";
import { guard } from "@/server/guard";
import { loadAmenities, saveAmenitiesAction } from "../properties.actions";

/**
 * What each property offers (spec 03 §3.2a, tab "Amenities"): the list an Airbnb import
 * carries over, editable here one per line. Channels and the booking site read it from the
 * property's content.
 */
export default async function AmenitiesPage() {
  const t = await getTranslations("properties");
  const rows = await guard(() => loadAmenities());
  return (
    <div className="space-y-5">
      <PageHeader title={t("title")} titleOnPhone={false} description={t("tabs.amenitiesLead")} />
      {rows.length === 0 ? (
        <Card>
          <EmptyState title={t("emptyTitle")} description={t("empty")} />
        </Card>
      ) : null}
      {rows.map((p) => (
        <Card
          key={p.id}
          title={
            <Link href={`/properties/${p.id}`} className="hover:underline">
              {p.title}
            </Link>
          }
          actions={
            <span className="text-xs text-muted">
              {t("amenitiesCount", { count: p.amenities.length })}
            </span>
          }
          data-testid="amenities-card"
        >
          {p.amenities.length === 0 ? (
            <p className="text-sm text-muted">{t("noAmenities")}</p>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {p.amenities.map((a) => (
                <li key={a}>
                  <Chip>{a}</Chip>
                </li>
              ))}
            </ul>
          )}
          <details className="mt-3">
            <summary className="cursor-pointer text-sm font-semibold text-accent">
              {t("editAmenities")}
            </summary>
            <form action={saveAmenitiesAction} className="mt-3 space-y-2">
              <input type="hidden" name="propertyId" value={p.id} />
              <Textarea
                name="amenities"
                rows={6}
                defaultValue={p.amenities.join("\n")}
                aria-label={t("amenitiesLabel", { title: p.title })}
              />
              <p className="text-xs text-muted">{t("amenitiesHint")}</p>
              <Button type="submit" size="sm">
                {t("saveAmenities")}
              </Button>
            </form>
          </details>
        </Card>
      ))}
    </div>
  );
}
