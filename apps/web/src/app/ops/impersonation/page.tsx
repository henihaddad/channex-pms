import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button, Card, Field, Label, PageTitle } from "@/components/ui";
import { withOperator } from "@/server/operator";
import { guard } from "@/server/guard";
import {
  authoriseBreakGlassAction,
  enterImpersonationAction,
  requestImpersonationAction,
} from "../ops.actions";

const loadImpersonations = withOperator("impersonation.read", { audit: false }, async (ctx) => ({
  rows: await ctx.repo.allImpersonations(),
  me: ctx.operatorId,
}));

/** Impersonation (spec 02 §2.7): request with a reason, tenant approves (or pre-granted), capped, redacted, transcribed. */
export default async function ImpersonationPage({
  searchParams,
}: {
  searchParams: Promise<{ orgId?: string }>;
}) {
  const sp = await searchParams;
  const t = await getTranslations("ops");
  const { rows, me } = await guard(() => loadImpersonations());
  return (
    <div className="space-y-4">
      <PageTitle>{t("impersonation")}</PageTitle>
      <Card>
        <form action={requestImpersonationAction} className="grid gap-2 sm:grid-cols-3">
          <Field label={t("tenant")} name="orgId" defaultValue={sp.orgId ?? ""} />
          <Field label={t("reason")} name="reason" />
          <Label>
            <input type="checkbox" name="breakGlass" /> {t("breakGlass")}
          </Label>
          <div>
            <Button type="submit" data-testid="request-impersonation">
              {t("request")}
            </Button>
          </div>
        </form>
      </Card>
      <Card>
        <ul className="space-y-2 text-sm" data-testid="impersonations">
          {rows.map((r) => (
            <li
              key={r.id}
              className="rounded border border-border p-2"
              data-testid="impersonation-row"
              data-state={r.state}
            >
              <p>
                <strong>{r.orgName}</strong> · {r.state} · {r.reason} ·{" "}
                {r.operatorId === me ? "you" : r.operatorId.slice(0, 8)} ·{" "}
                {r.createdAt.slice(0, 16)}
                {r.breakGlass ? " · break-glass" : ""}
                {r.writeApproved ? " · writes approved" : ""}
                {r.expiresAt ? ` · ends ${r.expiresAt.slice(11, 16)}` : ""}
              </p>
              <div className="mt-1 flex gap-2">
                {r.state === "approved" && r.operatorId === me ? (
                  <form action={enterImpersonationAction}>
                    <input type="hidden" name="id" value={r.id} />
                    <Button type="submit" data-testid="enter-impersonation" size="sm">
                      {t("enter")}
                    </Button>
                  </form>
                ) : null}
                {r.state === "active" && r.operatorId === me ? (
                  <Link href="/" className="text-xs underline" data-testid="open-console">
                    console →
                  </Link>
                ) : null}
                {r.state === "requested" && r.breakGlass && r.operatorId !== me ? (
                  <form action={authoriseBreakGlassAction}>
                    <input type="hidden" name="id" value={r.id} />
                    <Button type="submit" variant="secondary" size="sm">
                      {t("authorise")}
                    </Button>
                  </form>
                ) : null}
              </div>
              {r.transcript.length ? (
                <details className="mt-1 text-xs">
                  <summary>
                    {t("transcript")} ({r.transcript.length})
                  </summary>
                  <ul>
                    {r.transcript.map((x, i) => (
                      <li key={i}>
                        {x.at.slice(11, 19)} {x.action} {x.subject.slice(0, 8)}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
