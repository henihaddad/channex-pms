import type React from "react";
import { getTranslations } from "next-intl/server";
import { Logo, LogoMark } from "@/components/logo";

/**
 * Sign-in, sign-up and the invitation and step-up pages. The brand panel says
 * what the product is for in one sentence; the form sits on the canvas.
 */
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("app");
  return (
    <div className="flex min-h-screen">
      <aside className="relative hidden w-[42%] max-w-xl flex-col justify-between overflow-hidden bg-foreground p-10 text-white lg:flex">
        <div className="bridge-rail absolute inset-x-0 top-0 h-[3px]" aria-hidden="true" />
        <Logo size={34} />
        <div>
          <h2 className="font-display text-[2.6rem] leading-[1.05] font-bold tracking-tight">
            {t("claim")}
          </h2>
          <p className="mt-5 max-w-md text-[0.95rem] leading-relaxed text-white/65">
            {t("claimBody")}
          </p>
          <ul className="mt-8 space-y-2.5 text-sm text-white/75">
            {(["fact1", "fact2", "fact3"] as const).map((k) => (
              <li key={k} className="flex items-start gap-3">
                <span className="bridge-rail mt-2 h-px w-5 shrink-0" aria-hidden="true" />
                {t(k)}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-white/40">{t("footer")}</p>
        <LogoMark
          size={520}
          className="pointer-events-none absolute -end-40 -bottom-40 opacity-[0.06]"
        />
      </aside>
      <main className="flex flex-1 flex-col justify-center px-6 py-12">
        <div className="mx-auto w-full max-w-md">
          <div className="mb-6 lg:hidden">
            <Logo size={30} />
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
