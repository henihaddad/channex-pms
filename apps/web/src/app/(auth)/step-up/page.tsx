import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui";
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
    <Card>
      <h1 className="mb-1 text-xl font-bold">{t("stepUpTitle")}</h1>
      <p className="mb-4 text-sm text-slate-600">{t("stepUpHint")}</p>
      <StepUpForm
        next={next ?? "/"}
        labels={{ password: t("password"), submit: t("stepUpSubmit") }}
      />
    </Card>
  );
}
