import { getTranslations } from "next-intl/server";
import { Button, Card, Field, PageTitle } from "@/components/ui";
import { guard } from "@/server/guard";
import {
  decideImpersonationAction,
  grantSupportAccessAction,
  loadSupport,
  revokeSupportAccessAction,
} from "./support.actions";

/** Support (spec 12 §12.6, spec 02 §2.7): pre-granted access, impersonation approvals, the diagnostics bundle. */
export default async function SupportPage() {
  const t = await getTranslations("support");
  const v = await guard(() => loadSupport());
  return (
    <div className="space-y-6">
      <PageTitle>{t("title")}</PageTitle>
      <Card>
        <h2 className="font-semibold">{t("accessTitle")}</h2>
        <p className="text-xs text-slate-600">{t("accessHint")}</p>
        {v.access ? (
          <div className="mt-2 flex items-center gap-3 text-sm">
            <span data-testid="support-access-active">
              {t("active", { time: v.access.expiresAt.slice(0, 16).replace("T", " ") })}
            </span>
            <form action={revokeSupportAccessAction}>
              <Button
                type="submit"
                variant="secondary"
                className="h-7 text-xs"
                data-testid="revoke-support-access"
              >
                {t("revoke")}
              </Button>
            </form>
          </div>
        ) : (
          <form action={grantSupportAccessAction} className="mt-2 flex items-end gap-2">
            <Field label={t("hours")} name="hours" type="number" defaultValue="24" />
            <label className="flex items-center gap-1 text-sm">
              <input type="checkbox" name="writeAllowed" /> {t("writeAllowed")}
            </label>
            <Button type="submit" data-testid="grant-support-access">
              {t("grant")}
            </Button>
          </form>
        )}
      </Card>
      <Card>
        <h2 className="font-semibold">{t("requests")}</h2>
        {v.requests.length === 0 ? (
          <p className="text-sm text-slate-500">{t("noRequests")}</p>
        ) : null}
        <ul className="mt-1 space-y-2 text-sm" data-testid="impersonation-requests">
          {v.requests.map((r) => (
            <li
              key={r.id}
              className="rounded border border-slate-200 p-2"
              data-testid="impersonation-request"
              data-state={r.state}
            >
              <p>
                <strong>{r.state}</strong> · {t("reason")}: {r.reason} · {t("operator")}:{" "}
                {r.operatorId.slice(0, 8)} · {r.createdAt.slice(0, 16)}
                {r.breakGlass ? " · break-glass" : ""}
              </p>
              {r.state === "requested" ? (
                <div className="mt-1 flex gap-2">
                  {(["approve", "approve_write", "deny"] as const).map((d) => (
                    <form key={d} action={decideImpersonationAction}>
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="decision" value={d} />
                      <Button
                        type="submit"
                        variant="secondary"
                        className="h-7 text-xs"
                        data-testid={`impersonation-${d}`}
                      >
                        {d === "approve"
                          ? t("approve")
                          : d === "approve_write"
                            ? t("approveWrite")
                            : t("deny")}
                      </Button>
                    </form>
                  ))}
                </div>
              ) : null}
              {r.transcript.length ? (
                <details className="mt-1 text-xs">
                  <summary>{r.transcript.length} actions</summary>
                  <ul>
                    {r.transcript.map((x, i) => (
                      <li key={i}>
                        {x.at.slice(11, 19)} {x.action}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </li>
          ))}
        </ul>
      </Card>
      <Card>
        <h2 className="font-semibold">{t("diagnostics")}</h2>
        <p className="text-xs text-slate-600">{t("diagnosticsHint")}</p>
        <a
          className="mt-2 inline-block text-sm underline"
          href="/api/v1/support/diagnostics"
          data-testid="download-diagnostics"
        >
          {t("downloadDiagnostics")}
        </a>
        <p className="mt-2 text-xs text-slate-500">
          {t("version")}: {v.version}
        </p>
      </Card>
    </div>
  );
}
