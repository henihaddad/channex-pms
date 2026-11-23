import { getTranslations } from "next-intl/server";
import { LinkButton } from "@/components/ui";

export async function generateMetadata() {
  const t = await getTranslations("system");
  return { title: t("forbiddenTitle") };
}

/** Rendered with a 403 status by `forbidden()` (spec 02 RBAC-7: denied, never leaked). */
export default async function Forbidden() {
  const t = await getTranslations("system");
  return (
    <main id="main" className="mx-auto flex max-w-lg flex-col gap-3 px-4 py-24">
      <h1 className="font-display text-2xl font-bold text-foreground">{t("forbiddenTitle")}</h1>
      <p className="text-sm leading-relaxed text-muted">{t("forbiddenBody")}</p>
      <div className="mt-2">
        <LinkButton href="/">{t("backToToday")}</LinkButton>
      </div>
    </main>
  );
}
