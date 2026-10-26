import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { INTEGRATIONS, type IntegrationEntry, type IntegrationStatus } from "@pms/core";
import { Card, Chip, SectionTitle } from "@/components/ui";
import { container } from "@/server/container";
import { withPermission } from "@/server/with-permission";
import { guard } from "@/server/guard";

/**
 * What this deployment can actually reach. Behind `org:read` because it names the
 * services the organisation has wired, which is nobody's business but theirs.
 */
const loadConfigured = withPermission<[], Record<string, boolean>>(
  "org:read",
  { scope: "organization", audit: false },
  async () => {
    const c = await container();
    return {
      stripe_payments: Boolean(process.env.STRIPE_SECRET_KEY),
      stripe_connect: Boolean(process.env.STRIPE_SECRET_KEY),
      stripe_billing: Boolean(process.env.STRIPE_SECRET_KEY) && c.hosted,
      mail: c.config.MAIL_TRANSPORT !== "console",
      llm: c.llm.name !== "none",
    };
  },
);

const ORDER: IntegrationStatus[] = ["built", "partial", "port", "planned"];
const TONE: Record<IntegrationStatus, "success" | "accent" | "warning" | "default"> = {
  built: "success",
  partial: "accent",
  port: "warning",
  planned: "default",
};

/**
 * What this product connects to, and how far each one is built (spec 12 §12.7). Every
 * competitor's integrations page is a wall of logos you cannot verify; this one says
 * `built`, `partial`, `port` or `planned`, and for the ones that need a key it says
 * whether this deployment has one. Honest is the differentiator.
 */
export default async function IntegrationsPage() {
  const t = await getTranslations("integrations");
  const configured = await guard(() => loadConfigured());
  const entry = (i: IntegrationEntry) => (
    <li key={i.key} className="border-t border-border py-3 first:border-0 first:pt-0">
      <div className="flex flex-wrap items-baseline gap-2">
        <strong className="text-sm">{i.name}</strong>
        <Chip color={TONE[i.status]} data-testid={`integration-${i.key}`} data-status={i.status}>
          {t(`status.${i.status}`)}
        </Chip>
        {i.configurable ? (
          <Chip
            color={configured[i.key] ? "success" : "default"}
            data-testid={`integration-configured-${i.key}`}
          >
            {configured[i.key] ? t("configured") : t("notConfigured")}
          </Chip>
        ) : null}
      </div>
      <p className="mt-1 text-sm text-muted">{i.summary}</p>
      <p className="mt-1 text-xs text-muted">
        {i.href ? (
          <>
            <Link href={i.href} className="underline">
              {t("openSettings")}
            </Link>
            {" · "}
          </>
        ) : null}
        {i.port ? (
          <>
            <code>{i.port}</code>
            {" · "}
          </>
        ) : null}
        {t("specRef", { spec: i.spec })}
      </p>
    </li>
  );
  return (
    <div className="space-y-6">
      <SectionTitle>{t("title")}</SectionTitle>
      <p className="max-w-prose text-sm text-muted">{t("lead")}</p>
      {ORDER.map((status) => {
        const items = INTEGRATIONS.filter((i) => i.status === status);
        if (items.length === 0) return null;
        return (
          <Card key={status} title={t(`heading.${status}`)} description={t(`blurb.${status}`)}>
            <ul data-testid={`integrations-${status}`}>{items.map(entry)}</ul>
          </Card>
        );
      })}
      <p className="text-sm text-muted">
        {t("writeOne")}{" "}
        <Link href="/settings/plugins" className="underline">
          {t("plugins")}
        </Link>
        .
      </p>
    </div>
  );
}
