import type React from "react";
import { getTranslations } from "next-intl/server";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("app");
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      <p className="mb-6 text-center text-sm font-semibold uppercase tracking-widest text-emerald-600">
        {t("name")}
      </p>
      {children}
    </main>
  );
}
