import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const t = await getTranslations("auth");
  return (
    <Card>
      <h1 className="mb-5 font-display text-2xl font-bold tracking-tight text-foreground">
        {t("signIn")}
      </h1>
      <LoginForm labels={{ email: t("email"), password: t("password"), submit: t("signIn") }} />
      <p className="mt-5 text-sm text-muted">
        {t("noAccount")}{" "}
        <Link
          className="font-medium text-foreground underline decoration-accent underline-offset-4"
          href="/signup"
        >
          {t("signUp")}
        </Link>
      </p>
    </Card>
  );
}
