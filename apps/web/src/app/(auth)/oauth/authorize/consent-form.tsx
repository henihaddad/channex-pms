"use client";

import { useActionState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Alert, AnchorButton, Button, Select } from "@/components/ui";
import { approveAuthorizationAction, type ConsentState } from "./authorize.actions";

const LEVELS = ["full", "read_only", "messages", "prices"] as const;

/**
 * Pick the organization (when there are several) and the access level, the same four as an
 * API key, Full access first; then Approve or Deny. Approving hands the browser back to the
 * client with a one-time code; denying sends `access_denied`.
 */
export function ConsentForm({
  orgs,
  defaultOrgId,
  params,
  denyUrl,
}: {
  orgs: Array<{ id: string; name: string }>;
  defaultOrgId: string;
  params: Record<string, string>;
  denyUrl: string;
}) {
  const t = useTranslations("oauth");
  const levels = useTranslations("apiKeys");
  const [state, action, pending] = useActionState<ConsentState, FormData>(
    approveAuthorizationAction,
    {},
  );
  useEffect(() => {
    if (state.redirectTo) window.location.assign(state.redirectTo);
  }, [state.redirectTo]);
  const busy = pending || Boolean(state.redirectTo);
  return (
    <form action={action} className="flex flex-col gap-[18px]" data-testid="oauth-consent">
      {state.error ? (
        <Alert>{state.error === "access" ? t("errorAccess") : t("errorRequest")}</Alert>
      ) : null}
      {Object.entries(params).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {orgs.length > 1 ? (
        <Select label={t("org")} name="orgId" defaultValue={defaultOrgId}>
          {orgs.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </Select>
      ) : (
        <>
          <input type="hidden" name="orgId" value={orgs[0]!.id} />
          <p className="text-sm text-foreground">
            {t("orgOne")} <strong>{orgs[0]!.name}</strong>
          </p>
        </>
      )}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-sm font-semibold text-foreground">{t("access")}</legend>
        {LEVELS.map((l) => (
          <label
            key={l}
            className="flex cursor-pointer items-start gap-3 rounded-control border border-border p-3 text-sm has-[:checked]:border-accent has-[:checked]:bg-accent-soft"
          >
            <input
              type="radio"
              name="access"
              value={l}
              defaultChecked={l === "full"}
              className="mt-0.5 accent-[var(--color-accent)]"
            />
            <span>
              <span className="font-semibold text-foreground">{levels(`level.${l}`)}</span>
              <span className="block text-muted">{levels(`levelHint.${l}`)}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <p className="text-xs text-muted">{t("never")}</p>
      <div className="grid grid-cols-2 gap-3">
        <Button type="submit" size="lg" disabled={busy} fullWidth>
          {t("approve")}
        </Button>
        <AnchorButton href={denyUrl} size="lg" variant="secondary" fullWidth>
          {t("deny")}
        </AnchorButton>
      </div>
    </form>
  );
}
