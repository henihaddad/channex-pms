import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";

export const LOCALES = ["en", "fr", "ar"] as const;
export type Locale = (typeof LOCALES)[number];
export const RTL_LOCALES: ReadonlySet<string> = new Set(["ar"]);

/** Per-user locale, independent of any property's locale (spec 13 §13.8): cookie, then Accept-Language, then en. */
export async function resolveLocale(): Promise<Locale> {
  const jar = await cookies();
  const fromCookie = jar.get("pms_locale")?.value;
  if (fromCookie && (LOCALES as readonly string[]).includes(fromCookie))
    return fromCookie as Locale;
  const accept = (await headers()).get("accept-language") ?? "";
  for (const part of accept.split(",")) {
    const tag = part.trim().slice(0, 2).toLowerCase();
    if ((LOCALES as readonly string[]).includes(tag)) return tag as Locale;
  }
  return "en";
}

export default getRequestConfig(async () => {
  const locale = await resolveLocale();
  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default as Record<string, unknown>,
  };
});
