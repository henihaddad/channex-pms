import { getTranslations } from "next-intl/server";
import { TEMPLATE_VARIABLES } from "@pms/core";
import { Button, Card, Field, Label, PageTitle, Textarea } from "@/components/ui";
import { guard } from "@/server/guard";
import { PROVIDER_LABELS } from "@/server/inbox";
import { archiveTemplateAction, listTemplates, saveTemplateAction } from "../inbox.actions";

/** Org-scoped templates with locale variants (spec 09 §9.3); the editor warns on promotional patterns (AUTO-7). */
export default async function TemplatesPage() {
  const t = await getTranslations("inbox");
  const templates = await guard(() => listTemplates());
  return (
    <div className="space-y-4">
      <PageTitle>{t("templates")}</PageTitle>
      <div className="grid grid-cols-2 gap-4">
        <Card>
          {templates.length === 0 ? <p className="text-sm text-muted">{t("noTemplates")}</p> : null}
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
                <Button type="submit" variant="secondary" size="sm">
                  {t("archive")}
                </Button>
              </form>
            </div>
          ))}
        </Card>
        <Card>
          <form action={saveTemplateAction} className="space-y-2">
            <Field label={t("templateName")} name="name" />
            <Field label={t("category")} name="category" defaultValue="general" />
            <Field label={t("locale")} name="locale" defaultValue="en" />
            <fieldset className="text-xs">
              <legend className="font-medium">{t("channelScope")}</legend>
              {Object.entries(PROVIDER_LABELS).map(([code, label]) => (
                <Label key={code}>
                  <input type="checkbox" name="channelScope" value={code} /> {label}
                </Label>
              ))}
            </fieldset>
            <div>
              <Label htmlFor="body">{t("body")}</Label>
              <Textarea
                id="body"
                name="body"
                rows={6}
                required
                className="w-full rounded border border-border-secondary p-2 text-sm"
              />
            </div>
            <p className="text-xs text-muted">
              {t("variables")}: {TEMPLATE_VARIABLES.map((v) => `{{${v}}}`).join(" ")}
            </p>
            <Button type="submit" data-testid="save-template">
              {t("saveTemplate")}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
