import type { getTranslations } from "next-intl/server";
import { money } from "@/lib/format";

type BookT = Awaited<ReturnType<typeof getTranslations<"book">>>;

/** The search pill's labels, shared by the storefront and the property page. */
export function searchLabels(t: BookT) {
  return {
    dates: t("dates"),
    arrival: t("arrival"),
    departure: t("departure"),
    guests: t("guests"),
    adults: t("adults"),
    children: t("children"),
    promo: t("promo"),
    optional: t("optional"),
    search: t("search"),
    attributes: t("attributes"),
    adultCount: (n: number) => t("adultCount", { count: n }),
    childCount: (n: number) => t("childCount", { count: n }),
  };
}

/** "14–17 November", "28 November – 2 December": a stay as a heading reads it. */
export function stayRange(arrival: string, departure: string, locale = "en"): string {
  const f = new Intl.DateTimeFormat(locale === "en" ? "en-GB" : locale, {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
  return f.formatRange(
    new Date(`${arrival.slice(0, 10)}T00:00:00Z`),
    new Date(`${departure.slice(0, 10)}T00:00:00Z`),
  );
}

/** Line items read to the cent ("€330.00"), as a receipt does. */
export function money2(minor: number, currency: string): string {
  const s = money(minor, currency);
  return minor % 100 === 0 && /\d$/.test(s) ? `${s}.00` : s;
}
