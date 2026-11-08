import { describe, expect, it } from "vitest";
import {
  countryFromAcceptLanguage,
  countryOptions,
  currencyForCountry,
  currencyOptions,
} from "./iso";

describe("iso lists", () => {
  it("lists every assigned country once, named in the visitor's language", () => {
    const en = countryOptions("en");
    expect(en).toHaveLength(249);
    expect(new Set(en.map((c) => c.value)).size).toBe(249);
    expect(en.find((c) => c.value === "PT")?.label).toBe("Portugal");
    expect(countryOptions("fr").find((c) => c.value === "DE")?.label).toBe("Allemagne");
  });

  it("lists ISO 4217 currencies with their code first", () => {
    const eur = currencyOptions("en").find((c) => c.value === "EUR");
    expect(eur?.label).toBe("EUR · Euro");
    expect(currencyOptions("en").every((c) => /^[A-Z]{3}$/.test(c.value))).toBe(true);
  });

  it("follows the country with its currency only when it knows it", () => {
    expect(currencyForCountry("PT")).toBe("EUR");
    expect(currencyForCountry("TN")).toBe("TND");
    expect(currencyForCountry("BT")).toBeNull();
    expect(currencyForCountry(null)).toBeNull();
  });

  it("reads the region from Accept-Language", () => {
    expect(countryFromAcceptLanguage("pt-PT,pt;q=0.9,en;q=0.8")).toBe("PT");
    expect(countryFromAcceptLanguage("en;q=0.9, fr-TN")).toBe("TN");
    expect(countryFromAcceptLanguage("en")).toBeNull();
    expect(countryFromAcceptLanguage(null)).toBeNull();
  });
});
