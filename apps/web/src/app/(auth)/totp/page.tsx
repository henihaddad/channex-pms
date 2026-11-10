import { getTranslations } from "next-intl/server";
import { AuthCard } from "../auth-card";
import { TotpForm } from "./totp-form";

export default async function TotpPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const t = await getTranslations("auth");
  const { next } = await searchParams;
  return (
    <AuthCard title={t("totpTitle")}>
      <p className="-mt-2 text-sm text-muted">{t("totpHint")}</p>
      <TotpForm
        labels={{ code: t("code"), submit: t("continue") }}
        next={typeof next === "string" ? next : ""}
      />
    </AuthCard>
  );
}
