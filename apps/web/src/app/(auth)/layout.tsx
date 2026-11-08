import type React from "react";
import { getTranslations } from "next-intl/server";
import { LAUNCH_PLANS } from "@pms/core";
import { DrizzlePlatformRepository, withoutTenant } from "@pms/db";
import { Logo } from "@/components/logo";
import { container } from "@/server/container";
import { money } from "@/lib/format";
import { AuthAside } from "./auth-aside";

/**
 * Sign-in, sign-up and the invitation and step-up pages: a dark brand panel on the
 * left half, the card on the canvas. Sign-up's panel sells the trial and the three
 * steps to a live calendar; the others carry the product claim.
 */
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const [t, ts] = await Promise.all([getTranslations("app"), getTranslations("signup")]);
  const plan = await entryPlan();
  return (
    <div className="flex min-h-screen flex-wrap">
      <aside className="relative hidden flex-[1_1_480px] flex-col justify-between gap-12 overflow-hidden bg-[#101413] p-10 text-white lg:flex">
        <div className="bridge-rail absolute inset-x-0 top-0 h-[3px]" aria-hidden="true" />
        <Logo size={34} />
        <AuthAside
          panels={{
            default: (
              <div className="flex max-w-[520px] flex-col gap-5">
                <p className="font-display text-[46px] leading-[1.04] font-extrabold tracking-[-0.025em]">
                  {t("claim")}
                </p>
                <p className="text-base leading-[1.55] text-[#b6c0bd]">{t("claimBody")}</p>
                <ul className="mt-2 flex flex-col gap-2.5 text-sm text-[#e6ebe9]">
                  {(["fact1", "fact2", "fact3"] as const).map((k) => (
                    <li key={k} className="flex items-center gap-3">
                      <span className="bridge-rail h-0.5 w-[22px] shrink-0" aria-hidden="true" />
                      {t(k)}
                    </li>
                  ))}
                </ul>
              </div>
            ),
            signup: (
              <div className="flex max-w-[520px] flex-col gap-5">
                <p className="font-display text-[44px] leading-[1.04] font-extrabold tracking-[-0.025em]">
                  {ts("claim", { days: plan.trialDays })}
                </p>
                <p className="text-base leading-[1.55] text-[#b6c0bd]">{ts("claimBody")}</p>
                <ol className="mt-2 flex flex-col gap-3.5 text-sm">
                  {(["step1", "step2", "step3"] as const).map((k, i) => (
                    <li
                      key={k}
                      className={`flex items-center gap-3.5 ${i === 0 ? "" : "text-[#b6c0bd]"}`}
                    >
                      <span
                        className={`inline-flex size-7 shrink-0 items-center justify-center rounded-full text-[13px] font-bold ${i === 0 ? "bg-accent text-white" : "border border-[#3a4441]"}`}
                      >
                        {i + 1}
                      </span>
                      <span>
                        {i === 0 ? <strong>{ts(k)}</strong> : ts(k)}{" "}
                        <span className="text-[#8a9692]">· {ts(`${k}Time`)}</span>
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            ),
          }}
        />
        <AuthAside
          panels={{
            default: <AvailabilityTiles />,
            signup: null,
          }}
        />
        <AuthAside
          panels={{
            default: <p className="text-xs text-[#8a9692]">{t("footer")}</p>,
            signup: (
              <p className="text-xs text-[#8a9692]">
                {ts("footer", { price: money(plan.unitMinor, plan.currency) })}
              </p>
            ),
          }}
        />
      </aside>
      <main className="flex flex-[1_1_480px] flex-col items-center justify-center px-6 py-10">
        <div className="w-full max-w-[460px]">
          <div className="mb-6 lg:hidden">
            <Logo size={30} />
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}

/**
 * The cheapest paid plan the operator lists, for the trial length and the price after
 * it; the launch catalogue when the table cannot be read (a fresh self-hosted install).
 */
async function entryPlan(): Promise<{ trialDays: number; unitMinor: number; currency: string }> {
  const fallback = LAUNCH_PLANS[0]!;
  let plans = LAUNCH_PLANS;
  try {
    const c = await container();
    const listed = await withoutTenant(c.db.db, (tx) =>
      new DrizzlePlatformRepository(tx, "", c.crypto).plans(),
    );
    if (listed.length > 0) plans = listed;
  } catch {
    plans = LAUNCH_PLANS;
  }
  const paid =
    plans.find((p) => p.key === "starter") ??
    plans.find((p) => (p.tiers[0]?.unitMinor ?? 0) > 0) ??
    fallback;
  return {
    trialDays: paid.trialDays,
    unitMinor: paid.tiers[0]?.unitMinor ?? 0,
    currency: paid.currency,
  };
}

/** An availability grid seen from above: the picture the product is named after. */
function AvailabilityTiles() {
  const rows = ["..###..", "##..###", ".###..#"];
  return (
    <div className="grid max-w-[420px] grid-cols-7 gap-1.5 opacity-55" aria-hidden="true">
      {rows.flatMap((row, r) =>
        [...row].map((c, i) => (
          <span
            key={`${r}-${i}`}
            className={`h-[34px] rounded-lg ${c === "#" ? "bg-accent" : "bg-[#1d2423]"}`}
          />
        )),
      )}
    </div>
  );
}
