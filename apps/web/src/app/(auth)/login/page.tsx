import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AuthCard, AuthFootnote, authLinkClass } from "../auth-card";
import { LoginForm } from "./login-form";

/**
 * Sign in with a password, or have a sign-in link emailed (spec 02 §2.6). "Forgot?"
 * opens the link-only form: the link signs you in, and a second factor still applies.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ link?: string; next?: string }>;
}) {
  const sp = await searchParams;
  // the action checks it is a same-site path before following it
  const next = typeof sp.next === "string" ? sp.next : "";
  const t = await getTranslations("auth");
  const linkOnly = sp.link === "1";
  return (
    <AuthCard title={linkOnly ? t("linkTitle") : t("signIn")}>
      {linkOnly ? <p className="-mt-2 text-sm text-muted">{t("linkHint")}</p> : null}
      <LoginForm
        linkOnly={linkOnly}
        next={next}
        labels={{
          email: t("email"),
          password: t("password"),
          submit: t("signIn"),
          forgot: t("forgot"),
          or: t("or"),
          emailLink: t("emailLink"),
        }}
      />
      <AuthFootnote>
        {linkOnly ? (
          <Link className={authLinkClass} href="/login">
            {t("backToPassword")}
          </Link>
        ) : (
          <>
            {t("noAccount")}{" "}
            <Link className={authLinkClass} href="/signup">
              {t("signUp")}
            </Link>
          </>
        )}
      </AuthFootnote>
    </AuthCard>
  );
}
