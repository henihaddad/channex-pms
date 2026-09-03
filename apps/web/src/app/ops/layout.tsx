import type React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { currentSession } from "@/server/session";
import { currentImpersonation, currentOperator } from "@/server/operator";
import { Card } from "@/components/ui";
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
      <aside className="w-56 shrink-0 border-e border-line bg-ink p-4 text-white/80">
        <p className="mb-6 text-sm font-bold">{t("title")}</p>
        <nav className="space-y-1">
          {links.map(([href, label]) => (
            <Link
              key={href}
              href={href}
              className="block rounded-md px-3 py-2 text-sm hover:bg-ink-3"
            >
              {label}
            </Link>
          ))}
          <Link href="/" className="mt-4 block px-3 text-xs text-faint underline">
            console →
          </Link>
        </nav>
        <p className="mt-8 text-[11px] text-faint">{t("noPii")}</p>
      </aside>
      <main className="flex-1 p-8">
        {imp ? (
          <form
            action={leaveImpersonationAction}
            className="mb-4 rounded bg-amber-soft p-2 text-sm text-amber-deep"
          >
            {t("banner", { org: imp.orgName, time: imp.expiresAt.slice(11, 16) })}{" "}
            <button className="underline" type="submit">
              {t("leave")}
            </button>
          </form>
        ) : null}
        {children}
      </main>
    </div>
  );
}
