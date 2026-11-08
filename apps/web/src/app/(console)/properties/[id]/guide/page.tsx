import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
  GUIDE_SECTIONS,
  emptyGuide,
  guideCompleteness,
  guideVariables,
  sectionSensitive,
  sectionWritten,
  type GuideSectionKind,
  type PropertyGuide,
} from "@pms/core";
import { DrizzleGuideRepository, rawRows, sql } from "@pms/db";
import { withPermission } from "@/server/with-permission";
import {
  Button,
  Card,
  Checkbox,
  Chip,
  Field,
  PageHeader,
  TextareaField,
  cn,
} from "@/components/ui";
import { elapsed } from "@/lib/format";
import { publishGuideAction, saveGuideSectionAction } from "./guide.actions";

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
      written: all.filter((g) => g.sections.some(sectionWritten)).map((g) => g.locale),
    };
  },
);

/**
 * The guest guide (spec 10 §10.6b, design "Guest guide"): the sections a guest always asks
 * about on the left with what is still empty, one section open in the middle, and on the
 * right what the guest will read and whether they can read it yet. A half-written guide is
 * not a score — it is the questions the inbox will get by hand.
 */
export default async function GuidePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ locale?: string; section?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const locale = LOCALES.includes((sp.locale ?? "en") as (typeof LOCALES)[number])
    ? (sp.locale ?? "en")
    : "en";
  const d = await loadGuide({ propertyId: id, locale });
  if (!d) notFound();
  const t = await getTranslations("guides");
  const tp = await getTranslations("properties");
  const g = d.guide;
  const byKind = new Map(g.sections.map((s) => [s.kind, s]));
  const done = guideCompleteness(g);
  const variables = guideVariables(g);
  const chosen = GUIDE_SECTIONS.find((s) => s.kind === sp.section);
  const spec = chosen ?? done.unanswered[0] ?? GUIDE_SECTIONS[0]!;
  const section = byKind.get(spec.kind);
  const sensitive = section ? sectionSensitive(section) : spec.sensitive;
  const href = (kind: GuideSectionKind) =>
    `/properties/${id}/guide?locale=${locale}&section=${kind}`;
  const written = section ? sectionWritten(section) : false;
  const empty = done.total - done.written;
  return (
    <div className="space-y-5">
      <PageHeader
        crumb={[
          { href: "/properties", label: tp("title") },
          { href: `/properties/${id}`, label: d.title },
          { label: t("crumb") },
        ]}
        title={t("title")}
      />

      <nav aria-label={t("locale")} className="flex flex-wrap items-center gap-1.5 text-sm">
        <span className="me-1 text-muted">{t("locale")}</span>
        {LOCALES.map((l) => (
          <Link
            key={l}
            href={`/properties/${id}/guide?locale=${l}&section=${spec.kind}`}
            aria-current={l === locale ? "page" : undefined}
            data-testid={`guide-locale-${l}`}
            className={cn(
              "inline-flex h-7 items-center rounded-full border px-2.5 text-xs font-semibold",
              l === locale
                ? "border-foreground bg-foreground text-background"
                : "border-border bg-surface text-foreground hover:border-muted",
            )}
          >
            {t(`languages.${l}`)}
            {d.written.includes(l) && l !== locale ? (
              <span className="ms-1 text-muted" aria-label={t("hasContent")}>
                ·
              </span>
            ) : null}
          </Link>
        ))}
      </nav>

      <div className="grid items-start gap-5 xl:grid-cols-[280px_minmax(0,1fr)_340px]">
        <Card
          title={t("sectionsTitle")}
          actions={
            <span className="text-xs text-muted tabular-nums" data-testid="guide-progress">
              {t("of", { written: done.written, total: done.total })}
            </span>
          }
        >
          <div
            className="-mt-2 mb-3 h-1.5 overflow-hidden rounded-full bg-default"
            role="progressbar"
            aria-valuenow={done.percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={t("answered", { written: done.written, total: done.total })}
          >
            <div
              className="h-full rounded-full bg-[linear-gradient(90deg,#34d399,#22d3ee)]"
              style={{ width: `${done.percent}%` }}
            />
          </div>
          <ul className="flex flex-col gap-1">
            {GUIDE_SECTIONS.map((s) => {
              const isOn = s.kind === spec.kind;
              const w = byKind.get(s.kind);
              const ok = w ? sectionWritten(w) : false;
              return (
                <li key={s.kind}>
                  <Link
                    href={href(s.kind)}
                    aria-current={isOn ? "true" : undefined}
                    data-testid={`guide-section-${s.kind}`}
                    className={cn(
                      "flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-sm",
                      isOn
                        ? "border-accent/40 bg-accent-soft/50 font-semibold"
                        : "border-transparent hover:bg-surface-secondary",
                    )}
                  >
                    <span className="truncate">{t(`sections.${s.kind}`)}</span>
                    <Chip color={ok ? "success" : "warning"} size="sm">
                      {ok ? t("written") : t("empty")}
                    </Chip>
                  </Link>
                </li>
              );
            })}
          </ul>
          {done.unanswered.length > 0 ? (
            <p className="mt-3 text-xs text-muted" data-testid="guide-unanswered">
              {done.unanswered.length > 3
                ? t("leftCount", { count: done.unanswered.length })
                : `${t("stillAsked")} ${done.unanswered.map((s) => t(`questions.${s.kind}`)).join(" ")}`}
            </p>
          ) : (
            <p className="mt-3 text-xs text-success-soft-foreground" data-testid="guide-complete">
              {t("allAnswered")}
            </p>
          )}
        </Card>

        <div className="flex min-w-0 flex-col gap-5">
          <Card
            title={t(`sections.${spec.kind}`)}
            description={t(`hints.${spec.kind}`)}
            data-testid="guide-editor"
          >
            {sensitive ? (
              <Chip color="warning" className="mb-4">
                {t("sensitiveChip")}
              </Chip>
            ) : null}
            <form action={saveGuideSectionAction} className="flex flex-col gap-4">
              <input type="hidden" name="propertyId" value={id} />
              <input type="hidden" name="locale" value={locale} />
              <input type="hidden" name="kind" value={spec.kind} />
              {spec.fields.map((f) => (
                <Field
                  key={f}
                  label={t(`fields.${spec.kind}_${f}`)}
                  name={`field.${f}`}
                  required={false}
                  defaultValue={section?.fields?.[f] ?? ""}
                  testId={`guide-field-${spec.kind}-${f}`}
                />
              ))}
              <TextareaField
                label={t(`bodyLabels.${spec.kind}`)}
                name="body"
                rows={4}
                defaultValue={section?.body ?? ""}
              />
              <Field
                label={t("heading")}
                name="heading"
                required={false}
                placeholder={t(`sections.${spec.kind}`)}
                defaultValue={section?.heading ?? ""}
              />
              <Checkbox name="sensitive" defaultChecked={sensitive}>
                {t("sensitive")}
              </Checkbox>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="submit" data-testid="save-guide">
                  {t("saveSection")}
                </Button>
                <a
                  href="#preview"
                  className="inline-flex h-10 items-center rounded-full border border-border px-4 text-sm font-semibold hover:border-muted"
                >
                  {t("previewAsGuest")}
                </a>
                <span className="flex-1" />
                <span className="text-xs text-muted">
                  {g.published ? t("published") : t("draft")}
                  {g.updatedAt ? ` · ${t("savedAgo", { ago: elapsed(g.updatedAt) })}` : ""}
                </span>
              </div>
            </form>
          </Card>

          <Card title={t("variablesTitle")} description={t("variablesBody")}>
            <ul className="flex flex-wrap gap-2" data-testid="guide-variables">
              {GUIDE_SECTIONS.flatMap((s) => [
                s.kind as string,
                ...s.fields.map((f) => `${s.kind}_${f}`),
              ]).map((k) => (
                <li key={k}>
                  <code
                    title={variables[k] ?? t("variableEmpty")}
                    className={cn(
                      "inline-block rounded-md border border-border px-2 py-0.5 font-mono text-xs",
                      variables[k]
                        ? "bg-surface text-foreground"
                        : "bg-surface-secondary text-muted",
                    )}
                  >
                    {`{guide.${k}}`}
                  </code>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <Card id="preview" title={t("previewTitle")} data-testid="guide-preview">
            <div className="rounded-xl border border-border bg-surface-secondary p-4">
              <p className="text-[11px] font-bold tracking-wider text-accent uppercase">
                {d.title}
              </p>
              <h3 className="mt-1 font-display text-xl font-bold">
                {section?.heading || t(`sections.${spec.kind}`)}
              </h3>
              {written ? (
                <>
                  {spec.fields.some((f) => section?.fields?.[f]) ? (
                    <dl className="mt-3 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
                      {spec.fields
                        .filter((f) => section?.fields?.[f])
                        .map((f) => (
                          <div key={f} className="contents">
                            <dt className="text-muted">{t(`fields.${spec.kind}_${f}`)}</dt>
                            <dd className="font-semibold">{section?.fields?.[f]}</dd>
                          </div>
                        ))}
                    </dl>
                  ) : null}
                  {section?.body ? (
                    <p className="mt-3 text-sm leading-relaxed whitespace-pre-line">
                      {section.body}
                    </p>
                  ) : null}
                  {sensitive ? (
                    <p className="mt-3 text-xs text-muted">{t("previewSensitive")}</p>
                  ) : null}
                </>
              ) : (
                <p className="mt-3 text-sm text-muted">{t("previewEmpty")}</p>
              )}
            </div>
          </Card>

          <Card title={t("publishTitle")}>
            <p className="text-sm leading-relaxed text-muted">
              {g.published
                ? empty > 0
                  ? t("publishedGaps", { count: empty })
                  : t("publishedFull")
                : empty > 0
                  ? t("draftGaps", { count: empty })
                  : t("draftFull")}
            </p>
            <form action={publishGuideAction} className="mt-4">
              <input type="hidden" name="propertyId" value={id} />
              <input type="hidden" name="locale" value={locale} />
              <input type="hidden" name="published" value={g.published ? "0" : "1"} />
              <Button
                type="submit"
                fullWidth
                variant={g.published ? "secondary" : "primary"}
                data-testid="toggle-publish"
              >
                {g.published ? t("unpublish") : t("publishGuide")}
              </Button>
            </form>
            <p className="mt-3 text-xs text-muted">
              <Chip
                color={g.published ? "success" : "default"}
                size="sm"
                data-testid="guide-published"
                data-state={g.published ? "published" : "draft"}
              >
                {g.published ? t("published") : t("draft")}
              </Chip>{" "}
              {t(`languages.${locale}`)}
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
