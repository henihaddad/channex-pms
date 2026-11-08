import Link from "next/link";
import { headers } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";
import {
  countryFromAcceptLanguage,
  countryOptions,
  currencyForCountry,
  currencyOptions,
} from "@/lib/iso";
import { AuthCard, AuthFootnote, authLinkClass } from "../auth-card";
import { SignupForm } from "./signup-form";

/**
 * Create the organization (spec 02 §2.6, persona: the manager starting a trial).
 * Country and currency are ISO lists named in the visitor's language; the country is
 * guessed from the browser's language region, the currency follows it.
 */
export default async function SignupPage() {
  const [t, locale, h] = await Promise.all([getTranslations("auth"), getLocale(), headers()]);
  const countries = countryOptions(locale);
  const country = countryFromAcceptLanguage(h.get("accept-language"));
  const currencyFor = Object.fromEntries(
    countries.flatMap((c) => {
      const cur = currencyForCountry(c.value);
      return cur ? [[c.value, cur]] : [];
    }),
  );
  return (
    <AuthCard title={t("signUp")}>
      <SignupForm
        countries={countries}
        currencies={currencyOptions(locale)}
        defaults={{ country, currency: currencyForCountry(country) }}
        currencyFor={currencyFor}
        labels={{
          name: t("name"),
          namePlaceholder: t("namePlaceholder"),
          email: t("email"),
          emailPlaceholder: t("emailPlaceholder"),
          password: t("password"),
          passwordPlaceholder: t("passwordPlaceholder"),
          organizationName: t("organizationName"),
          organizationPlaceholder: t("organizationPlaceholder"),
          slug: t("slug"),
          slugBefore: t("slugBefore"),
          slugAfter: t("slugAfter"),
          country: t("country"),
          currency: t("currency"),
          choose: t("choose"),
          submit: t("startFree"),
        }}
      />
      <AuthFootnote>
        {t("haveAccount")}{" "}
        <Link className={authLinkClass} href="/login">
          {t("signIn")}
        </Link>
      </AuthFootnote>
    </AuthCard>
  );
}
