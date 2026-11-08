import { getTranslations } from "next-intl/server";
import { AuthCard } from "../auth-card";
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
    <AuthCard title={t("loginTitle")}>
      <p className="-mt-2 text-sm text-muted">{t("loginHint")}</p>
      {sp.error ? <p className="text-sm text-danger">{t("linkInvalid")}</p> : null}
      <OwnerLoginForm labels={{ email: t("email"), submit: t("sendLink") }} />
    </AuthCard>
  );
}
