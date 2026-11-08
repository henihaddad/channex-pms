import { getTranslations } from "next-intl/server";
import { AuthCard } from "../auth-card";
import { StepUpForm } from "./step-up-form";

/** Sensitive actions (`!` cells in spec 02 §2.4) ask for the password again within a five-minute window. */
export default async function StepUpPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const t = await getTranslations("auth");
  return (
    <AuthCard title={t("stepUpTitle")}>
      <p className="-mt-2 text-sm text-muted">{t("stepUpHint")}</p>
      <StepUpForm
        next={next ?? "/"}
        labels={{ password: t("password"), submit: t("stepUpSubmit") }}
      />
    </AuthCard>
  );
}
