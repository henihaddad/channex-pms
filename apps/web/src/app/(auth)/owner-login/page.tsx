import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui";
import { OwnerLoginForm } from "./owner-login-form";

/** Owner portal sign-in: magic link by default (spec 17 §17.5). */
export default async function OwnerLoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const t = await getTranslations("owner");
  return (
    <Card>
      <h1 className="mb-2 text-xl font-bold">{t("loginTitle")}</h1>
      <p className="mb-4 text-sm text-muted">{t("loginHint")}</p>
      {sp.error ? <p className="mb-2 text-sm text-rose">{t("linkInvalid")}</p> : null}
      <OwnerLoginForm labels={{ email: t("email"), submit: t("sendLink") }} />
    </Card>
  );
}
