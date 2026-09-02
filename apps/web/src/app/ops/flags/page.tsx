import { getTranslations } from "next-intl/server";
import { Button, Card, Field, PageTitle } from "@/components/ui";
import { withOperator } from "@/server/operator";
import { guard } from "@/server/guard";
import { setFlagAction } from "../ops.actions";

const loadFlags = withOperator("flags.read", { audit: false }, async (ctx) => ctx.repo.flags());

/** Feature flags (spec 12 §12.1): per tenant or percentage rollout, audited; never a paywall. */
export default async function FlagsPage() {
  const t = await getTranslations("ops");
  const flags = await guard(() => loadFlags());
  return (
    <div className="space-y-4">
      <PageTitle>{t("flags")}</PageTitle>
      <Card>
        <ul className="text-sm" data-testid="flags">
          {flags.map((f) => (
            <li key={f.id} data-testid="flag-row">
              <code>{f.key}</code> · {f.orgId ? f.orgId.slice(0, 8) : "platform"} ·{" "}
              {f.enabled ? t("enabled") : `${f.rolloutPercent} %`} · {f.updatedAt.slice(0, 16)}
            </li>
          ))}
        </ul>
      </Card>
      <Card>
        <form action={setFlagAction} className="grid gap-2 sm:grid-cols-4">
          <Field label={t("key")} name="key" />
          <Field label={t("tenant")} name="orgId" required={false} />
          <Field
            label={t("rollout")}
            name="rollout"
            type="number"
            required={false}
            defaultValue="0"
          />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="enabled" /> {t("enabled")}
          </label>
          <div>
            <Button type="submit" data-testid="save-flag">
              {t("save")}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
