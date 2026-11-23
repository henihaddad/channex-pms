import { getTranslations } from "next-intl/server";
import { LinkButton } from "@/components/ui";

export async function generateMetadata() {
  const t = await getTranslations("system");
  return { title: t("notFoundTitle") };
}

/** A link that leads nowhere: say so in the host's language and offer the way back. */
export default async function NotFound() {
  const t = await getTranslations("system");
  return (
    <main id="main" className="mx-auto flex max-w-lg flex-col gap-3 px-4 py-24">
      <h1 className="font-display text-2xl font-bold text-foreground">{t("notFoundTitle")}</h1>
      <p className="text-sm leading-relaxed text-muted">{t("notFoundBody")}</p>
      <div className="mt-2">
        <LinkButton href="/">{t("backHome")}</LinkButton>
      </div>
    </main>
  );
}
