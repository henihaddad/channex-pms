import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui";
import { SignupForm } from "./signup-form";

export default async function SignupPage() {
  const t = await getTranslations("auth");
  return (
    <Card>
      <h1 className="mb-4 text-xl font-bold">{t("signUp")}</h1>
      <SignupForm
        labels={{
          name: t("name"),
          email: t("email"),
          password: t("password"),
          organizationName: t("organizationName"),
          slug: t("slug"),
          country: t("country"),
          currency: t("currency"),
          submit: t("signUp"),
        }}
      />
      <p className="mt-4 text-sm text-slate-600">
        {t("haveAccount")}{" "}
        <Link className="text-emerald-700 underline" href="/login">
          {t("signIn")}
        </Link>
      </p>
    </Card>
  );
}
