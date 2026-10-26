import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
  GUIDE_SECTIONS,
  emptyGuide,
  guideCompleteness,
  guideVariables,
  type PropertyGuide,
} from "@pms/core";
import { DrizzleGuideRepository, rawRows, sql } from "@pms/db";
import { withPermission } from "@/server/with-permission";
import {
  Alert,
  Breadcrumbs,
  Button,
  Card,
  Checkbox,
  Chip,
  Field,
  PageHeader,
  TextareaField,
} from "@/components/ui";
import { publishGuideAction, saveGuideAction } from "./guide.actions";

const LOCALES = ["en", "fr", "ar", "es", "pt"] as const;

const loadGuide = withPermission<
  [{ propertyId: string; locale: string }],
  { title: string; guide: PropertyGuide; written: string[] } | null
>(
  "property:read",
  {
    scope: "property",
    resolveScope: (i) => ({ kind: "property", id: i.propertyId }),
    audit: false,
  },
  async (ctx, { propertyId, locale }) => {
    const [p] = await rawRows<{ title: string }>(
      ctx.tx,
      sql`select title from property where id = ${propertyId} and archived_at is null`,
    );
    if (!p) return null;
    const repo = new DrizzleGuideRepository(ctx.tx, ctx.orgId);
    const all = await repo.forProperty(propertyId);
    return {
      title: p.title,
      guide: all.find((g) => g.locale === locale) ?? emptyGuide(propertyId, locale),
      written: all.filter((g) => g.sections.some((s) => s.body)).map((g) => g.locale),
    };
  },
);

/**
 * The guest guide (spec 10 §10.6b): eight questions a guest always asks, answered once.
 * The page leads with what is still unanswered, because a half-written guide is not a
 * score — it is the questions the inbox will get by hand.
 */
export default async function GuidePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ locale?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const locale = LOCALES.includes((sp.locale ?? "en") as (typeof LOCALES)[number])
    ? (sp.locale as string)
    : "en";
  const d = await loadGuide({ propertyId: id, locale });
  if (!d) notFound();
  const t = await getTranslations("guides");
  const tp = await getTranslations("properties");
  const g = d.guide;
  const byKind = new Map(g.sections.map((s) => [s.kind, s]));
  const done = guideCompleteness(g);
  const variables = guideVariables(g);
  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { href: "/properties", label: tp("title") },
          { href: `/properties/${id}`, label: d.title },
          { label: t("title") },
        ]}
      />
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {t("title")}
            <Chip
              color={g.published ? "success" : "default"}
              data-testid="guide-published"
              data-state={g.published ? "published" : "draft"}
            >
              {g.published ? t("published") : t("draft")}
            </Chip>
          </span>
        }
        description={t("intro")}
        actions={
          <form action={publishGuideAction}>
            <input type="hidden" name="propertyId" value={id} />
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="published" value={g.published ? "0" : "1"} />
            <Button
              type="submit"
              variant={g.published ? "secondary" : "primary"}
              data-testid="toggle-publish"
            >
              {g.published ? t("unpublish") : t("publish")}
            </Button>
          </form>
        }
      />

      <nav aria-label={t("locale")} className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted">{t("locale")}:</span>
        {LOCALES.map((l) => (
          <a
            key={l}
            href={`/properties/${id}/guide?locale=${l}`}
            aria-current={l === locale ? "page" : undefined}
            data-testid={`guide-locale-${l}`}
            className={
              l === locale
                ? "rounded bg-accent-soft px-2 py-0.5 font-medium text-accent-soft-foreground"
                : "rounded px-2 py-0.5 text-muted hover:text-foreground"
            }
          >
            {l.toUpperCase()}
            {d.written.includes(l) ? " ·" : ""}
          </a>
        ))}
      </nav>

      <Card>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm font-medium" data-testid="guide-progress">
            {t("answered", { written: done.written, total: done.total })}
          </p>
          <p className="text-sm text-muted">{done.percent}%</p>
        </div>
        <div
          className="mt-2 h-2 w-full overflow-hidden rounded bg-background-secondary"
          role="progressbar"
          aria-valuenow={done.percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={t("answered", { written: done.written, total: done.total })}
        >
          <div className="h-full rounded bg-accent" style={{ width: `${done.percent}%` }} />
        </div>
        {done.unanswered.length > 0 ? (
          <p className="mt-3 text-sm text-muted" data-testid="guide-unanswered">
            {t("stillAsked")} {done.unanswered.map((s) => t(`questions.${s.kind}`)).join(" ")}
          </p>
        ) : (
          <p className="mt-3 text-sm text-success-soft-foreground" data-testid="guide-complete">
            {t("allAnswered")}
          </p>
        )}
      </Card>

      {g.published && done.unanswered.length > 0 ? (
        <Alert tone="info" title={t("partialTitle")}>
          {t("partialBody")}
        </Alert>
      ) : null}

      <form action={saveGuideAction} className="space-y-4">
        <input type="hidden" name="propertyId" value={id} />
        <input type="hidden" name="locale" value={locale} />
        {GUIDE_SECTIONS.map((spec) => {
          const s = byKind.get(spec.kind);
          return (
            <Card
              key={spec.kind}
              title={t(`sections.${spec.kind}`)}
              data-testid={`guide-section-${spec.kind}`}
            >
              <p className="-mt-1 mb-3 text-xs text-muted">{t(`questions.${spec.kind}`)}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {spec.fields.map((f) => (
                  <Field
                    key={f}
                    label={t(`fields.${spec.kind}_${f}`)}
                    name={`field.${spec.kind}.${f}`}
                    required={false}
                    defaultValue={s?.fields?.[f] ?? ""}
                    testId={`guide-field-${spec.kind}-${f}`}
                  />
                ))}
                <Field
                  label={t("heading")}
                  name={`heading.${spec.kind}`}
                  required={false}
                  placeholder={t(`sections.${spec.kind}`)}
                  defaultValue={s?.heading ?? ""}
                />
                <div className="sm:col-span-2">
                  <TextareaField
                    label={t("body")}
                    name={`body.${spec.kind}`}
                    rows={3}
                    defaultValue={s?.body ?? ""}
                    description={`{{guide.${spec.kind}}}`}
                  />
                </div>
                <div className="sm:col-span-2">
                  <Checkbox
                    name={`sensitive.${spec.kind}`}
                    defaultChecked={s?.sensitive ?? spec.sensitive}
                  >
                    {t("sensitive")}
                  </Checkbox>
                </div>
              </div>
            </Card>
          );
        })}
        <div className="flex items-center gap-3">
          <Button type="submit" data-testid="save-guide">
            {t("save")}
          </Button>
          <span className="text-xs text-muted">
            {g.updatedAt ? t("updated", { when: g.updatedAt.slice(0, 16).replace("T", " ") }) : ""}
          </span>
        </div>
      </form>

      <Card title={t("variablesTitle")}>
        <p className="mb-2 text-sm text-muted">{t("variablesBody")}</p>
        <ul className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2" data-testid="guide-variables">
          {Object.keys(variables).length === 0 ? (
            <li className="text-muted">{t("variablesEmpty")}</li>
          ) : (
            Object.entries(variables).map(([k, v]) => (
              <li key={k}>
                <code className="text-xs">{`{{guide.${k}}}`}</code>{" "}
                <span className="text-muted">{v.length > 40 ? `${v.slice(0, 40)}…` : v}</span>
              </li>
            ))
          )}
        </ul>
      </Card>
    </div>
  );
}
