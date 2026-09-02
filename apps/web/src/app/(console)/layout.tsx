import type React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { currentSession } from "@/server/session";
import { logoutAction } from "../(auth)/auth.actions";
import { Button } from "@/components/ui";

export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const session = await currentSession();
  if (!session) redirect("/login");
  const t = await getTranslations("nav");
  const links = [
    { href: "/", label: t("dashboard") },
    { href: "/properties", label: t("properties") },
    { href: "/calendar", label: t("calendar") },
    { href: "/channels", label: t("channels") },
    { href: "/sync-health", label: t("syncHealth") },
    { href: "/settings/members", label: t("members") },
    { href: "/settings/organization", label: t("organization") },
    { href: "/settings/audit", label: t("audit") },
  ] as const;
  return (
    <div className="flex min-h-screen">
      <aside className="w-60 shrink-0 border-e border-slate-200 bg-white p-4">
        <p className="mb-6 text-sm font-bold text-emerald-700">Channex PMS</p>
        <nav className="space-y-1">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="block rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <form action={logoutAction} className="mt-8">
          <Button type="submit" variant="secondary" className="w-full">
            {t("signOut")}
          </Button>
        </form>
      </aside>
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
