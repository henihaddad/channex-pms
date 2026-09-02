import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";

export const LOCALES = ["en", "fr", "ar", "es", "pt"] as const;
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

type Messages = Record<string, unknown>;
/** A locale file may lag behind English; missing keys fall back to the English string, never to the key. */
function merge(base: Messages, over: Messages): Messages {
  const out: Messages = { ...base };
  for (const [k, v] of Object.entries(over))
    out[k] =
      v && typeof v === "object" && base[k] && typeof base[k] === "object"
        ? merge(base[k] as Messages, v as Messages)
        : v;
  return out;
}

export default getRequestConfig(async () => {
  const locale = await resolveLocale();
  const en = (await import("../messages/en.json")).default as Messages;
  const own =
    locale === "en" ? en : ((await import(`../messages/${locale}.json`)).default as Messages);
  return { locale, messages: locale === "en" ? en : merge(en, own) };
});
