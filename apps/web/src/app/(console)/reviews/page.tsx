import Link from "next/link";
import { getTranslations } from "next-intl/server";
import {
  Button,
  Card,
  Chip,
  Input,
  LinkButton,
  PageHeader,
  Select,
  Stat,
  Textarea,
  cn,
} from "@/components/ui";
import { guard } from "@/server/guard";
import { providerLabel } from "@/server/inbox";
import { channelLabel, dayMonth, percent } from "@/lib/format";
import {
  listReviews,
  loadAutomation,
  respondReviewAction,
  reviewGuestAction,
} from "../inbox/inbox.actions";

const isoDaysAgo = (n: number): string => new Date(Date.now() - n * 86_400_000).toISOString();

/** Five stars from a rating out of ten (channels send 0–10; Airbnb's 1–5 arrive doubled). */
function Stars({ rating }: { rating: number }) {
  const n = Math.round(rating / 2);
  return (
    <span className="text-[#f59e0b]" aria-hidden="true">
      {"★".repeat(n)}
      <span className="text-border">{"★".repeat(5 - n)}</span>
    </span>
  );
}

/**
 * Reviews (spec 09 §9.7, design canvas board): the rating and reply rate on top, reviews that
 * need a reply first with a reply already started, and beside them the review requests the
 * after-check-out rule sends, the guests Airbnb wants you to review, and the rating by property.
 */
export default async function ReviewsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const t = await getTranslations("inbox");
  const tr = await getTranslations("inbox.rev");
  const ta = await getTranslations("inbox.auto");
  const { rows: all, properties } = await guard(() => listReviews({}));
  const automation = await loadAutomation().catch(() => null);
  const today = isoDaysAgo(0).slice(0, 10);
  const yearAgo = isoDaysAgo(365);

  // the numbers on top read every review, whatever the filter
  const year = all.filter((r) => r.receivedAt >= yearAgo);
  const avg = year.length ? year.reduce((n, r) => n + r.rating, 0) / year.length / 2 : null;
  const answerable = all.filter((r) => r.responseState !== "not_supported");
  const replied = answerable.filter((r) => r.response !== null).length;
  const pending = all.filter((r) => r.responseState === "pending");
  const requests = automation?.stats.reviewRequests ?? 0;
  const afterRule = automation?.rules.find((r) => r.trigger === "after_departure") ?? null;
  const toReviewGuests = all.filter(
    (r) => r.provider.toLowerCase().includes("airbnb") && !r.guestReview,
  );

  const rows = all.filter(
    (r) =>
      (!sp.property || r.propertyId === sp.property) &&
      (!sp.state || r.responseState === sp.state) &&
      (!sp.low || r.rating <= 6) &&
      (!sp.guest || (r.provider.toLowerCase().includes("airbnb") && !r.guestReview)),
  );
  const chip = (active: boolean) =>
    cn(
      "inline-flex h-8 items-center rounded-full px-3 text-[13px] font-semibold whitespace-nowrap",
      active
        ? "bg-foreground text-background"
        : "border border-[#d5d9d7] text-muted hover:text-foreground",
    );
  const keep = sp.property ? `&property=${sp.property}` : "";
  const ago = (iso: string) => {
    const d = iso.slice(0, 10);
    const days = Math.round(
      (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${d}T00:00:00Z`)) / 86_400_000,
    );
    return days <= 0
      ? dayMonth(iso)
      : days === 1
        ? tr("yesterday")
        : days < 7
          ? tr("daysAgo", { n: days })
          : dayMonth(iso);
  };
  const byProperty = properties
    .map((p) => {
      const mine = year.filter((r) => r.propertyId === p.id);
      return {
        ...p,
        n: mine.length,
        avg: mine.length ? mine.reduce((s, r) => s + r.rating, 0) / mine.length / 2 : null,
      };
    })
    .filter((p) => p.n > 0);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t("reviews")} />
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label={tr("rating12")}
          value={avg === null ? "—" : avg.toFixed(2)}
          hint={tr("acrossChannels", { n: year.length })}
        />
        <Stat
          label={tr("replyRate")}
          value={answerable.length ? percent(replied / answerable.length) : "—"}
          hint={tr("replied", { n: replied })}
        />
        <Stat label={tr("awaiting")} value={String(pending.length)} />
        <Stat
          label={tr("requests30")}
          value={String(requests)}
          hint={
            requests > 0
              ? tr("leftReview", {
                  pct: Math.min(
                    100,
                    Math.round(((automation?.stats.reviewsReceived ?? 0) / requests) * 100),
                  ),
                })
              : undefined
          }
        />
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex flex-col gap-4">
          <form className="flex flex-wrap items-center gap-2">
            <Link href={`/reviews?state=pending${keep}`} className={chip(sp.state === "pending")}>
              {tr("needsReply")}
              {pending.length ? ` · ${pending.length}` : ""}
            </Link>
            <Link
              href={`/reviews?${keep.slice(1)}`}
              className={chip(!sp.state && !sp.low && !sp.guest)}
            >
              {tr("all")}
            </Link>
            <Link href={`/reviews?low=1${keep}`} className={chip(Boolean(sp.low))}>
              {tr("low")}
            </Link>
            <span className="flex-1" />
            {sp.state ? <input type="hidden" name="state" value={sp.state} /> : null}
            {sp.low ? <input type="hidden" name="low" value="1" /> : null}
            <Select
              name="property"
              defaultValue={sp.property ?? ""}
              aria-label={t("allProperties")}
              size="sm"
              className="w-48"
            >
              <option value="">{t("allProperties")}</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </Select>
            <Button type="submit" variant="secondary" size="sm">
              {t("filter")}
            </Button>
          </form>

          {rows.length === 0 ? (
            <Card>
              <p className="text-sm text-muted">{t("noReviews")}</p>
            </Card>
          ) : null}
          {rows.map((r) => {
            const channel = channelLabel(providerLabel(r.provider));
            const first = r.guestName.split(" ")[0] ?? r.guestName;
            return (
              <Card key={r.id} data-testid="review-row" data-state={r.responseState}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <p className="text-sm">
                    <strong className="font-semibold">{r.guestName}</strong> ·{" "}
                    <Stars rating={r.rating} />
                    <span className="sr-only" data-testid="rating">
                      {r.rating}/10
                    </span>
                    <span className="block text-xs text-muted">
                      {r.propertyTitle} · {channel} · {ago(r.receivedAt)}
                    </span>
                  </p>
                  <span className="flex flex-wrap gap-1.5">
                    {r.hidden ? (
                      <Chip size="sm" color="info" data-testid="review-hidden">
                        {t("reviewHidden")}
                      </Chip>
                    ) : null}
                    {r.responseState === "expired" ? (
                      <Chip size="sm" data-testid="review-expired">
                        {t("replyExpired")}
                      </Chip>
                    ) : r.response ? (
                      <Chip size="sm" color="success">
                        {tr("statusReplied")}
                      </Chip>
                    ) : r.responseState === "pending" ? (
                      <Chip size="sm" color="warning">
                        {tr("statusNeeds")}
                      </Chip>
                    ) : null}
                  </span>
                </div>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{r.body}</p>
                {r.response ? (
                  <p className="rounded-xl bg-[#f0faf8] p-3 text-sm" data-testid="review-response">
                    <strong className="block text-xs text-accent">
                      {t("ourResponse")} ({r.response.deliveryState})
                    </strong>
                    {r.response.body}
                  </p>
                ) : r.canRespond && r.responseState !== "expired" ? (
                  <form
                    action={respondReviewAction}
                    className="flex flex-col gap-2 rounded-xl border border-[#c6e8e3] bg-[#f0faf8] p-3"
                  >
                    <input type="hidden" name="reviewId" value={r.id} />
                    <input type="hidden" name="propertyId" value={r.propertyId} />
                    <span className="text-xs font-semibold text-accent">{tr("draftTitle")}</span>
                    <Textarea
                      name="body"
                      required
                      rows={3}
                      defaultValue={tr(r.rating >= 8 ? "draftGood" : "draftBad", {
                        name: first,
                        property: r.propertyTitle,
                      })}
                    />
                    <div>
                      <Button
                        type="submit"
                        size="sm"
                        variant="primary"
                        data-testid="respond-review"
                      >
                        {tr("post", { channel })}
                      </Button>
                    </div>
                  </form>
                ) : r.responseState !== "expired" ? (
                  <p className="text-xs text-muted">{t("noResponseSupport")}</p>
                ) : null}
                {r.provider.toLowerCase().includes("airbnb") ? (
                  r.guestReview ? (
                    <p
                      className="rounded-xl bg-surface-secondary p-3 text-xs"
                      data-testid="guest-review"
                      data-state={r.guestReview.deliveryState}
                    >
                      <strong>
                        {t("yourGuestReview")} ({r.guestReview.deliveryState}):
                      </strong>{" "}
                      {r.guestReview.publicReview} ·{" "}
                      {r.guestReview.scores
                        .map((x) => `${t(`guestReviewCategories.${x.category}`)} ${x.rating}/5`)
                        .join(" · ")}
                      {r.guestReview.isRecommended ? ` · ${t("recommended")}` : ""}
                    </p>
                  ) : (
                    <details className="rounded-xl border border-border" open={r.hidden}>
                      <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-muted select-none">
                        {tr("reviewGuest")}
                      </summary>
                      <form
                        action={reviewGuestAction}
                        className="flex flex-wrap items-end gap-2 border-t border-border p-3 text-xs"
                        data-testid="guest-review-form"
                      >
                        <input type="hidden" name="reviewId" value={r.id} />
                        <input type="hidden" name="propertyId" value={r.propertyId} />
                        <span className="w-full text-muted">{t("reviewTheGuest")}</span>
                        {(["cleanliness", "respect_house_rules", "communication"] as const).map(
                          (c) => (
                            <label key={c} className="flex items-center gap-1">
                              {t(`guestReviewCategories.${c}`)}
                              <Select
                                name={c}
                                size="sm"
                                defaultValue="5"
                                aria-label={t(`guestReviewCategories.${c}`)}
                              >
                                {[5, 4, 3, 2, 1].map((n) => (
                                  <option key={n} value={n}>
                                    {n}
                                  </option>
                                ))}
                              </Select>
                            </label>
                          ),
                        )}
                        <label className="flex items-center gap-1">
                          <input type="checkbox" name="isRecommended" value="1" defaultChecked />
                          {t("recommendGuest")}
                        </label>
                        <Textarea
                          name="publicReview"
                          required
                          rows={2}
                          placeholder={t("publicReviewPlaceholder")}
                          className="w-full"
                          data-testid="guest-review-public"
                        />
                        <Input
                          name="privateReview"
                          placeholder={t("privateReviewPlaceholder")}
                          className="w-full"
                        />
                        <Button
                          type="submit"
                          size="sm"
                          variant="secondary"
                          data-testid="submit-guest-review"
                        >
                          {t("sendGuestReview")}
                        </Button>
                      </form>
                    </details>
                  )
                ) : null}
              </Card>
            );
          })}
        </div>

        <div className="flex flex-col gap-5">
          <Card title={tr("requestsTitle")}>
            <p className="text-sm text-muted">{tr("requestsBody")}</p>
            {afterRule ? (
              <p className="mt-3 flex items-center gap-2 text-sm">
                <Chip size="sm" color={afterRule.enabled ? "success" : "default"}>
                  {afterRule.enabled ? ta("on") : ta("offPill")}
                </Chip>
                {tr("requestsRule", {
                  rule: afterRule.name,
                  when:
                    Math.abs(afterRule.offsetDays ?? 0) === 0
                      ? ta("when.after")
                      : ta("when.daysAfter", { n: Math.abs(afterRule.offsetDays ?? 0) }),
                })}
              </p>
            ) : (
              <p className="mt-3 text-sm text-muted">{tr("requestsNone")}</p>
            )}
            <div className="mt-3">
              <LinkButton
                href={
                  afterRule
                    ? `/inbox/automation?rule=${afterRule.id}`
                    : "/inbox/automation?rule=new"
                }
                size="sm"
              >
                {afterRule ? tr("requestsEdit") : tr("requestsCreate")}
              </LinkButton>
            </div>
          </Card>
          <Card title={tr("guestsTitle")}>
            <p className="text-sm text-muted">{tr("guestsBody")}</p>
            <p className="mt-3 text-sm">
              {toReviewGuests.length ? (
                <Link href="/reviews?guest=1" className="font-semibold text-accent hover:underline">
                  {tr("guestsWaiting", { n: toReviewGuests.length })}
                </Link>
              ) : (
                <span className="text-muted">{tr("guestsNone")}</span>
              )}
            </p>
          </Card>
          {byProperty.length > 0 ? (
            <Card title={tr("byProperty")}>
              <ul className="flex flex-col text-sm">
                {byProperty.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center justify-between border-b border-default py-2 last:border-b-0"
                  >
                    <span>{p.title}</span>
                    <strong className="tabular-nums">
                      {p.avg === null ? "—" : p.avg.toFixed(2)} · {p.n}
                    </strong>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
