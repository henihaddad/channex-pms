import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Alert, LinkButton } from "@/components/ui";
import { loadConsent } from "@/server/oauth-consent";
import { AuthCard, AuthFootnote } from "../../auth-card";
import { ConsentForm } from "./consent-form";

/**
 * "Sign in with OTAbridge" (spec 04 §4.7b): the consent screen an MCP client (Claude on
 * claude.ai, Claude Desktop, Claude Code) opens in the browser. Persona: the host who runs the
 * business through Claude (spec 02 §2.2). Not signed in: the login page, and back here.
 */
export default async function AuthorizePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getTranslations("oauth");
  const view = await loadConsent(await searchParams);
  if (view.kind === "signin") redirect(`/login?next=${encodeURIComponent(view.next)}`);
  if (view.kind === "redirect") redirect(view.to);
  if (view.kind === "error")
    return (
      <AuthCard title={t("errorTitle")}>
        <Alert>{t("errorBody")}</Alert>
        <p className="font-mono text-xs text-muted" data-testid="oauth-error">
          {view.error}: {view.description}
        </p>
      </AuthCard>
    );
  if (view.kind === "no_org")
    return (
      <AuthCard title={t("title", { client: view.clientName })}>
        <Alert>{t("noOrg")}</Alert>
        <LinkButton href="/">{t("back")}</LinkButton>
      </AuthCard>
    );
  return (
    <AuthCard title={t("title", { client: view.clientName })}>
      <p className="-mt-2 text-sm text-muted">
        {view.loopback
          ? t("introLocal", { client: view.clientName })
          : t("intro", { client: view.clientName, host: view.redirectHost })}
      </p>
      <ConsentForm
        orgs={view.orgs}
        defaultOrgId={view.defaultOrgId}
        params={view.params}
        denyUrl={view.denyUrl}
      />
      <AuthFootnote>{t("footnote")}</AuthFootnote>
    </AuthCard>
  );
}
