import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui";
import { SignupForm } from "./signup-form";

export default async function SignupPage() {
  const t = await getTranslations("auth");
  return (
    <Card>
      <h1 className="mb-5 font-display text-2xl font-bold tracking-tight text-ink">
        {t("signUp")}
      </h1>
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
      <p className="mt-5 text-sm text-muted">
        {t("haveAccount")}{" "}
        <Link
          className="font-medium text-ink underline decoration-sky underline-offset-4"
          href="/login"
        >
          {t("signIn")}
        </Link>
      </p>
    </Card>
  );
}
