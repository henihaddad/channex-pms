import { getTranslations } from "next-intl/server";
import { Button, Card, Chip, Input, PageTitle, Select } from "@/components/ui";
import { guard } from "@/server/guard";
import { providerLabel } from "@/server/inbox";
import { listReviews, respondReviewAction } from "../inbox/inbox.actions";

/** Reviews next to messaging (spec 09 §9.7): filter by property, channel, rating and response state; respond where the OTA allows. */
export default async function ReviewsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const t = await getTranslations("inbox");
  const { rows, properties } = await guard(() =>
    listReviews({
      propertyId: sp.property ?? null,
      provider: sp.provider ?? null,
      minRating: sp.minRating ? Number(sp.minRating) : null,
      responseState: sp.state ?? null,
    }),
  );
  return (
    <div className="space-y-4">
      <PageTitle>{t("reviews")}</PageTitle>
      <form className="flex flex-wrap gap-2 text-xs">
        <Select
          name="property"
          defaultValue={sp.property ?? ""}

          size="sm"
        >
          <option value="">{t("allProperties")}</option>
          {properties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </Select>
        <Select
          name="state"
          defaultValue={sp.state ?? ""}

          size="sm"
        >
          <option value="">{t("anyState")}</option>
          {["pending", "queued", "responded", "failed", "not_supported"].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
        <Input
          name="minRating"
          type="number"
          min={0}
          max={10}
          defaultValue={sp.minRating ?? ""}
          placeholder={t("minRating")}
          className="w-24"
        />
        <Button type="submit" variant="secondary" size="sm">
          {t("filter")}
        </Button>
      </form>
      <Card>
        {rows.length === 0 ? <p className="text-sm text-muted">{t("noReviews")}</p> : null}
        {rows.map((r) => (
          <div
            key={r.id}
            className="border-t border-border py-2 text-sm"
            data-testid="review-row"
            data-state={r.responseState}
          >
            <p>
              <strong data-testid="rating">{r.rating}/10</strong> · {r.guestName} ·{" "}
              {providerLabel(r.provider)} · {r.propertyTitle} ·{" "}
              <span className="text-xs text-muted">{r.insertedAt.slice(0, 10)}</span>
              {r.responseDueAt && r.responseState === "pending" ? (
                <Chip color="warning" size="sm" className="ms-2">
                  {t("respondBy")} {r.responseDueAt.slice(0, 16).replace("T", " ")}
                </Chip>
              ) : null}
            </p>
            <p className="whitespace-pre-wrap text-foreground">{r.body}</p>
            {r.response ? (
              <p className="mt-1 rounded bg-accent-soft p-2 text-xs" data-testid="review-response">
                <strong>
                  {t("ourResponse")} ({r.response.deliveryState}):
                </strong>{" "}
                {r.response.body}
              </p>
            ) : r.canRespond ? (
              <form action={respondReviewAction} className="mt-1 flex gap-1">
                <input type="hidden" name="reviewId" value={r.id} />
                <input type="hidden" name="propertyId" value={r.propertyId} />
                <Input name="body" required placeholder={t("respondPlaceholder")} />
                <Button type="submit" data-testid="respond-review" size="sm">
                  {t("respond")}
                </Button>
              </form>
            ) : (
              <p className="text-xs text-muted">{t("noResponseSupport")}</p>
            )}
          </div>
        ))}
      </Card>
    </div>
  );
}
