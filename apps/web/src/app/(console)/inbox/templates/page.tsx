import { getTranslations } from "next-intl/server";
import { TEMPLATE_VARIABLES } from "@pms/core";
import {
  Card,
  EmptyState,
  Field,
  Label,
  PageHeader,
  SubmitButton,
  TextareaField,
} from "@/components/ui";
import { guard } from "@/server/guard";
import { PROVIDER_LABELS } from "@/server/inbox";
import { archiveTemplateAction, listTemplates, saveTemplateAction } from "../inbox.actions";

export async function generateMetadata() {
  const t = await getTranslations("inbox");
  return { title: t("templates") };
}

/** Org-scoped templates with locale variants (spec 09 §9.3); the editor warns on promotional patterns (AUTO-7). */
export default async function TemplatesPage() {
  const t = await getTranslations("inbox");
  const templates = await guard(() => listTemplates());
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t("templates")} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          {templates.length === 0 ? (
            <EmptyState title={t("noTemplatesTitle")} description={t("noTemplates")} />
          ) : null}
          {templates.map((tpl) => (
            <div
              key={tpl.id}
              className="border-t border-border py-2 text-sm"
              data-testid="template-row"
            >
              <p className="font-medium">
                {tpl.name} <span className="rounded bg-background px-1 text-xs">{tpl.locale}</span>{" "}
                <span className="text-xs text-muted">{tpl.category}</span>
                {tpl.channelScope ? (
                  <span className="ms-1 text-xs text-muted">
                    ({tpl.channelScope.map((c) => PROVIDER_LABELS[c] ?? c).join(", ")})
                  </span>
                ) : null}
              </p>
              <p className="whitespace-pre-wrap text-xs text-muted">{tpl.body}</p>
              {tpl.warnings.length ? (
                <p className="text-xs text-warning-soft-foreground" data-testid="promo-warning">
                  ⚠ {tpl.warnings.join("; ")}
                </p>
              ) : null}
              <form action={archiveTemplateAction} className="mt-1">
                <input type="hidden" name="id" value={tpl.id} />
                <SubmitButton
                  variant="secondary"
                  size="sm"
                  aria-label={t("archiveNamed", { name: tpl.name })}
                >
                  {t("archive")}
                </SubmitButton>
              </form>
            </div>
          ))}
        </Card>
        <Card>
          <form action={saveTemplateAction} className="space-y-2">
            <Field label={t("templateName")} name="name" />
            <Field label={t("category")} name="category" defaultValue="general" />
            <Field
              label={t("locale")}
              name="locale"
              defaultValue="en"
              description={t("localeHint")}
              maxLength={5}
              spellCheck={false}
            />
            <fieldset className="text-xs">
              <legend className="font-medium">{t("channelScope")}</legend>
              {Object.entries(PROVIDER_LABELS).map(([code, label]) => (
                <Label key={code}>
                  <input type="checkbox" name="channelScope" value={code} /> {label}
                </Label>
              ))}
            </fieldset>
            <TextareaField label={t("body")} name="body" rows={6} required />
            <p className="text-xs text-muted">
              {t("variables")}: {TEMPLATE_VARIABLES.map((v) => `{{${v}}}`).join(" ")}
            </p>
            <SubmitButton testId="save-template">{t("saveTemplate")}</SubmitButton>
          </form>
        </Card>
      </div>
    </div>
  );
}
