/**
 * ISO 3166-1 alpha-2 countries and ISO 4217 currencies for the sign-up form. Names come
 * from the runtime's CLDR data (`Intl.DisplayNames`) in the visitor's language, so the
 * list stays correct without a translation table of its own.
 */

/** Every officially assigned ISO 3166-1 alpha-2 code. */
const COUNTRY_CODES = (
  "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS " +
  "BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE " +
  "EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM " +
  "HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC " +
  "LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA " +
  "NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW " +
  "SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO " +
  "TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW"
).split(" ");

/** Euro area members and the territories that use the euro, for the currency that follows a country. */
const EURO = new Set(
  (
    "AD AT AX BE BL CY DE EE ES FI FR GF GP GR HR IE IT LT LU LV MC ME MF MQ MT NL PM PT RE SI SK SM " +
    "VA YT"
  ).split(" "),
);
const OTHER_CURRENCY: Readonly<Record<string, string>> = {
  AE: "AED",
  AU: "AUD",
  BR: "BRL",
  CA: "CAD",
  CH: "CHF",
  CN: "CNY",
  CZ: "CZK",
  DK: "DKK",
  DZ: "DZD",
  EG: "EGP",
  GB: "GBP",
  HU: "HUF",
  ID: "IDR",
  IL: "ILS",
  IN: "INR",
  IS: "ISK",
  JP: "JPY",
  KE: "KES",
  KR: "KRW",
  MA: "MAD",
  MX: "MXN",
  MY: "MYR",
  NO: "NOK",
  NZ: "NZD",
  PH: "PHP",
  PL: "PLN",
  RO: "RON",
  SA: "SAR",
  SE: "SEK",
  SG: "SGD",
  TH: "THB",
  TN: "TND",
  TR: "TRY",
  US: "USD",
  VN: "VND",
  ZA: "ZAR",
};

export interface IsoOption {
  value: string;
  label: string;
}

/** Countries sorted by their name in `locale`. */
export function countryOptions(locale: string): IsoOption[] {
  const names = new Intl.DisplayNames([locale, "en"], { type: "region" });
  return COUNTRY_CODES.map((code) => ({ value: code, label: names.of(code) ?? code })).sort(
    (a, b) => a.label.localeCompare(b.label, locale),
  );
}

/** Currencies in active use (ISO 4217), as "EUR · Euro". */
export function currencyOptions(locale: string): IsoOption[] {
  const names = new Intl.DisplayNames([locale, "en"], { type: "currency" });
  return Intl.supportedValuesOf("currency").map((code) => ({
    value: code,
    label: `${code} · ${names.of(code) ?? code}`,
  }));
}

/** The currency most stays in this country are priced in, when we know it; null leaves the choice to the user. */
export function currencyForCountry(country: string | null | undefined): string | null {
  if (!country) return null;
  if (EURO.has(country)) return "EUR";
  return OTHER_CURRENCY[country] ?? null;
}

/** The region of an Accept-Language header ("pt-PT,pt;q=0.9" → "PT"), if it names an assigned country. */
export function countryFromAcceptLanguage(header: string | null | undefined): string | null {
  for (const part of (header ?? "").split(",")) {
    const tag = part.split(";")[0]?.trim() ?? "";
    const region = tag.split("-")[1]?.toUpperCase();
    if (region && COUNTRY_CODES.includes(region)) return region;
  }
  return null;
}
