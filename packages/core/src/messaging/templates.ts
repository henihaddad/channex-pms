import type { MessageTemplate, TemplateContext } from "./types.js";

const VAR = /\{\{\s*([a-z_]+)\.([a-z_]+)\s*\}\}/g;

/** Interpolate `{{section.key}}`; unknown or empty variables are reported, never silently blanked. */
export function interpolate(
  body: string,
  ctx: TemplateContext,
): { text: string; missing: string[] } {
  const missing: string[] = [];
  const text = body.replace(VAR, (_m, section: string, key: string) => {
    const s = (ctx as unknown as Record<string, Record<string, unknown> | undefined>)[section];
    const v = s?.[key];
    if (v === undefined || v === null || v === "") {
      missing.push(`${section}.${key}`);
      return `{{${section}.${key}}}`;
    }
    return typeof v === "string"
      ? v
      : typeof v === "number" || typeof v === "boolean"
        ? String(v)
        : JSON.stringify(v);
  });
  return { text, missing: [...new Set(missing)] };
}

/** Locale variant auto-selected from the guest's language, then the org default, then anything. */
export function pickVariant(
  variants: readonly MessageTemplate[],
  guestLanguage: string | null | undefined,
  fallbackLocale = "en",
): MessageTemplate | null {
  const lang = (guestLanguage ?? "").slice(0, 2).toLowerCase();
  return (
    variants.find((v) => v.locale === lang) ??
    variants.find((v) => v.locale === fallbackLocale) ??
    variants[0] ??
    null
  );
}

const PROMO = [
  /\b\d{1,2}\s?%\s?(off|discount)\b/i,
  /\bpromo\s?code\b/i,
  /\bbook direct\b/i,
  /\bspecial offer\b/i,
  /\bnewsletter\b/i,
  /\bunsubscribe\b/i,
  /\bdiscount\b/i,
];

/** AUTO-7: OTA threads are for the reservation; obvious marketing patterns get a warning in the editor and block OTA sends. */
export function promotionalWarnings(body: string): string[] {
  return PROMO.filter((re) => re.test(body)).map(
    (re) => `looks promotional: ${re.source.replace(/\\b/g, "")}`,
  );
}

/** Variables a template may use, for the editor's help panel. */
export const TEMPLATE_VARIABLES = [
  "guest.first_name",
  "guest.last_name",
  "booking.arrival",
  "booking.departure",
  "booking.nights",
  "booking.total",
  "booking.reference",
  "booking.balance",
  "unit.name",
  "unit.wifi_name",
  "unit.wifi_password",
  "unit.access_instructions",
  "property.name",
  "property.address",
  "property.check_in_time",
  "property.check_out_time",
  "property.contact_phone",
  "access.code",
  "access.valid_from",
  "access.valid_to",
] as const;
