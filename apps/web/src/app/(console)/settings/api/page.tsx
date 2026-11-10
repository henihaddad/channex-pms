import { getLocale, getTranslations } from "next-intl/server";
import { Alert, Card, Chip, DataTable, SectionTitle } from "@/components/ui";
import { guard } from "@/server/guard";
import { container } from "@/server/container";
import { dayMonth } from "@/lib/format";
import { listApiKeys, revokeApiKeyAction } from "./api-keys.actions";
import { ApiAccess } from "./api-access";

/**
 * Settings → API & AI (spec 04 §4.7a/b). Persona: the host who runs the business through
 * Claude (spec 02 §2.2). Keys, their access, and how to connect Claude to OTAbridge.
 */
export default async function ApiSettingsPage() {
  const t = await getTranslations("apiKeys");
  const locale = await getLocale();
  const keys = await guard(() => listApiKeys());
  const baseUrl = (await container()).config.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const when = (iso: string | null) => (iso ? dayMonth(iso, locale) : t("never"));
  return (
    <div className="space-y-6">
      <SectionTitle>{t("title")}</SectionTitle>
      <Card>
        <div className="flex flex-col gap-3 text-sm text-foreground">
          <p>{t("intro")}</p>
          <Alert tone="warning">{t("testNotice")}</Alert>
          <p className="text-muted">{t("stepUp")}</p>
        </div>
      </Card>
      <ApiAccess baseUrl={baseUrl}>
        <Card title={t("keys")}>
          <DataTable
            testId="api-keys"
            empty={t("empty")}
            columns={[
              t("colName"),
              t("colAccess"),
              t("colKey"),
              t("colCreated"),
              t("colLastUsed"),
              t("colCreatedBy"),
              { label: "", align: "end" },
            ]}
            rowKey={(_r, i) => keys[i]!.id}
            rows={keys.map((k) => [
              <span key="n" className={k.revokedAt ? "text-muted line-through" : "font-semibold"}>
                {k.name}
              </span>,
              <Chip key="a" color={k.access === "full" ? "accent" : "default"}>
                {t(`level.${k.access as "full"}`)}
              </Chip>,
              <code key="p" className="font-mono text-xs">
                {k.prefix}…
              </code>,
              when(k.createdAt),
              when(k.lastUsedAt),
              k.createdByName ?? "—",
              k.revokedAt ? (
                <Chip key="r" color="danger">
                  {t("revoked")}
                </Chip>
              ) : (
                <form key="r" action={revokeApiKeyAction}>
                  <input type="hidden" name="keyId" value={k.id} />
                  <button type="submit" className="text-xs font-semibold text-danger underline">
                    {t("revoke")}
                  </button>
                </form>
              ),
            ])}
          />
        </Card>
      </ApiAccess>
    </div>
  );
}
