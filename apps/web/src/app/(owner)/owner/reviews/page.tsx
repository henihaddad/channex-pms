import { getTranslations } from "next-intl/server";
import { Card, PageTitle } from "@/components/ui";
import { guard } from "@/server/guard";
import { loadPortalReviews } from "../portal.actions";

export default async function OwnerReviews() {
  const t = await getTranslations("owner");
  const rows = await guard(() => loadPortalReviews());
  return (
    <div className="space-y-4">
      <PageTitle>{t("nav.reviews")}</PageTitle>
      <p className="text-sm text-muted">{t("reviewsHint")}</p>
      <Card className="text-sm">
        {rows.length === 0 ? <p className="text-xs text-muted">{t("noReviews")}</p> : null}
        {rows.map((r) => (
          <p key={r.id} className="border-t border-line py-1 text-xs">
            <strong>{r.rating}/10</strong> · {r.propertyTitle} · {r.ota} ·{" "}
            {r.insertedAt.slice(0, 10)}: {r.body}
          </p>
        ))}
      </Card>
    </div>
  );
}
