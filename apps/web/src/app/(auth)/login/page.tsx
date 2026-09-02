import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const t = await getTranslations("auth");
  return (
    <Card>
      <h1 className="mb-4 text-xl font-bold">{t("signIn")}</h1>
      <LoginForm labels={{ email: t("email"), password: t("password"), submit: t("signIn") }} />
      <p className="mt-4 text-sm text-slate-600">
        {t("noAccount")}{" "}
        <Link className="text-emerald-700 underline" href="/signup">
          {t("signUp")}
        </Link>
      </p>
    </Card>
  );
}
