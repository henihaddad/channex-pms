import { getTranslations } from "next-intl/server";
import { Alert } from "@/components/ui";
import { AuthCard } from "../auth-card";
import { OwnerLoginForm } from "./owner-login-form";

export async function generateMetadata() {
  const t = await getTranslations("owner");
  return { title: t("loginTitle") };
}

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
      {sp.error ? <Alert>{t("linkInvalid")}</Alert> : null}
      <OwnerLoginForm
        labels={{ email: t("email"), submit: t("sendLink"), sending: t("sendingLink") }}
      />
    </AuthCard>
  );
}
