import type React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { currentSession } from "@/server/session";
import { currentImpersonation, currentOperator } from "@/server/operator";
import { Alert, Card } from "@/components/ui";
import { Logo } from "@/components/logo";
import { leaveImpersonationAction } from "./ops.actions";

/** The operator console shell (spec 12 §12.1): outside tenancy, operators only, no guest data anywhere. */
export default async function OpsLayout({ children }: { children: React.ReactNode }) {
  const session = await currentSession();
  if (!session) redirect("/login");
  const t = await getTranslations("ops");
  const op = await currentOperator();
  if (!op)
    return (
      <div className="mx-auto max-w-2xl p-8">
        <Card>
          <p data-testid="not-operator">{t("notOperator")}</p>
        </Card>
      </div>
    );
  const imp = await currentImpersonation();
  const links = [
    ["/ops", t("fleet")],
    ["/ops/tenants", t("tenants")],
    ["/ops/dlq", t("dlq")],
    ["/ops/webhooks", t("webhooks")],
    ["/ops/flags", t("flags")],
    ["/ops/announcements", t("announcements")],
    ["/ops/impersonation", t("impersonation")],
    ["/ops/jobs", t("jobs")],
    ["/ops/operators", t("operators")],
    ["/ops/audit", t("audit")],
  ] as const;
  return (
    <div className="flex min-h-screen" data-testid="ops-console">
      <aside
        className="dark sticky top-0 flex h-screen w-60 shrink-0 flex-col bg-background p-4 text-foreground"
        data-theme="dark"
      >
        <Logo size={26} suffix={t("title")} />
        <div className="bridge-rail mt-4 mb-4 h-px w-full opacity-60" />
        <nav className="flex flex-col gap-0.5">
          {links.map(([href, label]) => (
            <Link
              key={href}
              href={href}
              className="rounded-xl px-3 py-2 text-sm text-muted transition-colors hover:bg-surface-secondary hover:text-foreground"
            >
              {label}
            </Link>
          ))}
          <Link href="/" className="mt-4 px-3 text-xs text-accent hover:underline">
            console →
          </Link>
        </nav>
        <p className="mt-auto text-xs text-muted">{t("noPii")}</p>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="bridge-rail h-[3px] w-full" aria-hidden="true" />
        <main className="flex-1 px-8 py-7">
          <div className="mx-auto flex max-w-[1400px] flex-col gap-4">
            {imp ? (
              <form action={leaveImpersonationAction}>
                <Alert tone="warning">
                  {t("banner", { org: imp.orgName, time: imp.expiresAt.slice(11, 16) })}{" "}
                  <button className="font-medium underline" type="submit">
                    {t("leave")}
                  </button>
                </Alert>
              </form>
            ) : null}
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
