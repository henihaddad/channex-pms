import { getLocale, getTranslations } from "next-intl/server";
import { Alert, Card, Chip, ConfirmSubmit, DataTable, SectionTitle } from "@/components/ui";
import { guard } from "@/server/guard";
import { container } from "@/server/container";
import { dayMonth } from "@/lib/format";
import {
  disconnectAppAction,
  listApiKeys,
  listConnectedApps,
  revokeApiKeyAction,
} from "./api-keys.actions";
import { ApiAccess } from "./api-access";

export async function generateMetadata() {
  const t = await getTranslations("apiKeys");
  return { title: t("title") };
}

/**
 * Settings → Connect Claude & API (spec 04 §4.7a/b). Persona: the host who runs the business through
 * Claude (spec 02 §2.2). Keys, the apps connected by signing in, their access, and how to
 * connect Claude to OTAbridge.
 */
export default async function ApiSettingsPage() {
  const t = await getTranslations("apiKeys");
  const locale = await getLocale();
  const [keys, apps] = await guard(() => Promise.all([listApiKeys(), listConnectedApps()]));
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
              { label: <span className="sr-only">{t("colActions")}</span>, align: "end" },
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
                  <ConfirmSubmit
                    variant="danger"
                    size="sm"
                    title={t("revokeTitle", { name: k.name })}
                    body={t("revokeBody", { prefix: k.prefix })}
                    confirmLabel={t("revokeConfirm")}
                    cancelLabel={t("revokeCancel")}
                    pendingLabel={t("revoking")}
                    aria-label={t("revokeLabel", { name: k.name, prefix: k.prefix })}
                    testId="revoke-key"
                  >
                    {t("revoke")}
                  </ConfirmSubmit>
                </form>
              ),
            ])}
          />
        </Card>
        <Card title={t("apps")} description={t("appsHint")}>
          <DataTable
            testId="connected-apps"
            empty={t("appsEmpty")}
            columns={[
              t("colApp"),
              t("colAccess"),
              t("colConnected"),
              t("colLastUsed"),
              t("colApprovedBy"),
              { label: <span className="sr-only">{t("colActions")}</span>, align: "end" },
            ]}
            rowKey={(_r, i) => apps[i]!.grantId}
            rows={apps.map((a) => [
              <span key="n" className="font-semibold">
                {a.name}
              </span>,
              <Chip key="a" color={a.access === "full" ? "accent" : "default"}>
                {t(`level.${a.access as "full"}`)}
              </Chip>,
              when(a.createdAt),
              when(a.lastUsedAt),
              a.createdByName ?? "—",
              <form key="d" action={disconnectAppAction}>
                <input type="hidden" name="grantId" value={a.grantId} />
                <ConfirmSubmit
                  variant="danger"
                  size="sm"
                  title={t("disconnectTitle", { name: a.name })}
                  body={t("disconnectBody", { name: a.name })}
                  confirmLabel={t("disconnectConfirm")}
                  cancelLabel={t("disconnectCancel")}
                  pendingLabel={t("disconnecting")}
                  aria-label={t("disconnectLabel", { name: a.name })}
                  testId="disconnect-app"
                >
                  {t("disconnect")}
                </ConfirmSubmit>
              </form>,
            ])}
          />
        </Card>
      </ApiAccess>
    </div>
  );
}
