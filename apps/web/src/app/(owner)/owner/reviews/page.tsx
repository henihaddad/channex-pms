import { getLocale, getTranslations } from "next-intl/server";
import { Card, PageTitle } from "@/components/ui";
import { guard } from "@/server/guard";
import { channelLabel, day } from "@/lib/format";
import { loadPortalReviews } from "../portal.actions";

export async function generateMetadata() {
  const t = await getTranslations("owner");
  return { title: t("nav.reviews") };
}

/** Guest reviews of the owner's units (spec 17 §17.5; persona: the owner). */
export default async function OwnerReviews() {
  const [t, locale] = await Promise.all([getTranslations("owner"), getLocale()]);
  const rows = await guard(() => loadPortalReviews());
  return (
    <div className="space-y-4">
      <PageTitle>{t("nav.reviews")}</PageTitle>
      <p className="text-sm text-muted">{t("reviewsHint")}</p>
      <Card className="text-sm">
        {rows.length === 0 ? <p className="text-xs text-muted">{t("noReviews")}</p> : null}
        {rows.map((r) => (
          <p key={r.id} className="border-t border-border py-1 text-xs">
            <strong>{t("ratingOutOf10", { rating: r.rating })}</strong> · {r.propertyTitle} ·{" "}
            {channelLabel(r.ota, t("direct"))} · {day(r.insertedAt.slice(0, 10), locale)}: {r.body}
          </p>
        ))}
      </Card>
    </div>
  );
}
