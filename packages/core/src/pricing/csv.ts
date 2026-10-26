import { LocalDate } from "../shared/local-date.js";
import type { RateImportRow } from "./types.js";

/**
 * The CSV every pricing engine exports, and the one most properties actually arrive with
 * (spec 06 §6.7). Column names vary between PriceLabs, Wheelhouse and a spreadsheet, so
 * the header is matched by alias rather than by position.
 */
const ALIASES = {
  date: ["date", "night", "day", "stay_date", "check_in"],
  listingRef: ["listing_id", "listing", "listing_ref", "room_type", "room_type_id", "unit", "id"],
  price: ["price", "rate", "recommended_price", "final_price", "amount", "adr"],
  minStay: ["min_stay", "minimum_stay", "min_nights", "minlos", "los"],
} as const satisfies Record<string, readonly string[]>;

export interface CsvParseResult {
  rows: RateImportRow[];
  /** One message per unusable line, with its line number: the validation report of §6.7. */
  errors: string[];
  /** Headers we recognised, so the UI can say what it read. */
  columns: Partial<Record<keyof typeof ALIASES, string>>;
}

const norm = (s: string): string =>
  s
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

/** Splits one CSV line, honouring double quotes (`"1,200.00"` is one field). */
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === "," || c === ";" || c === "\t") {
      out.push(field);
      field = "";
    } else field += c;
  }
  out.push(field);
  return out.map((f) => f.trim());
}

/**
 * Money as minor units, from whatever the export wrote: `120`, `120.50`, `"1,200.00"`,
 * `€120,50`. Floats are banned for money (rule 4), so the decimal part is read as digits
 * and never multiplied.
 */
export function parseMinor(raw: string, minorDigits = 2): number | null {
  const cleaned = raw.replace(/[^\d.,-]/g, "").trim();
  if (cleaned === "" || cleaned === "-") return null;
  const negative = cleaned.startsWith("-");
  const digitsOnly = cleaned.replace(/^-/, "");
  // the last separator with 1–2 trailing digits is the decimal point; others are thousands
  const m = /^(.*?)([.,])(\d{1,2})$/.exec(digitsOnly);
  const wholeRaw = m ? m[1]! : digitsOnly;
  // A separator left of the decimals can only be a thousands group of exactly three
  // digits, so "1.005" is the European 1 005 while "1.0056" and "12.34.56" are not prices.
  if (/[.,]/.test(wholeRaw) && !/^\d{1,3}([.,]\d{3})+$/.test(wholeRaw)) return null;
  const whole = wholeRaw.replace(/[.,]/g, "");
  const frac = m ? m[3]! : "";
  if (whole === "" && frac === "") return null;
  if (!/^\d*$/.test(whole)) return null;
  const scaled = `${whole || "0"}${frac.padEnd(minorDigits, "0").slice(0, minorDigits)}`;
  const value = Number(scaled);
  if (!Number.isSafeInteger(value)) return null;
  return negative ? -value : value;
}

/** Dates as the engines write them: `2026-10-04`, `04/10/2026` is ambiguous and refused. */
function parseDate(raw: string): string | null {
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw.trim());
  if (!iso) return null;
  try {
    return LocalDate.parse(`${iso[1]!}-${iso[2]!}-${iso[3]!}`).toString();
  } catch {
    return null;
  }
}

export function parseRateImportCsv(text: string, minorDigits = 2): CsvParseResult {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  const result: CsvParseResult = { rows: [], errors: [], columns: {} };
  if (lines.length === 0) {
    result.errors.push("the file is empty");
    return result;
  }
  const header = splitCsvLine(lines[0]!).map(norm);
  const index: Partial<Record<keyof typeof ALIASES, number>> = {};
  for (const [field, aliases] of Object.entries(ALIASES) as Array<
    [keyof typeof ALIASES, readonly string[]]
  >) {
    const at = header.findIndex((h) => aliases.includes(h));
    if (at >= 0) {
      index[field] = at;
      result.columns[field] = header[at]!;
    }
  }
  for (const required of ["date", "price"] as const)
    if (index[required] === undefined)
      result.errors.push(
        `no ${required} column: looked for ${ALIASES[required].join(", ")} in "${lines[0]!}"`,
      );
  if (result.errors.length > 0) return result;

  const seen = new Set<string>();
  lines.slice(1).forEach((line, i) => {
    const lineNo = i + 2;
    const cells = splitCsvLine(line);
    const at = (f: keyof typeof ALIASES): string => {
      const col = index[f];
      return col === undefined ? "" : (cells[col] ?? "");
    };
    const date = parseDate(at("date"));
    if (!date) {
      result.errors.push(`line ${String(lineNo)}: "${at("date")}" is not a YYYY-MM-DD date`);
      return;
    }
    const priceMinor = parseMinor(at("price"), minorDigits);
    if (priceMinor === null) {
      result.errors.push(`line ${String(lineNo)}: "${at("price")}" is not a price`);
      return;
    }
    if (priceMinor < 0) {
      result.errors.push(`line ${String(lineNo)}: a negative price (${at("price")})`);
      return;
    }
    const listingRef = at("listingRef");
    const minStayRaw = at("minStay");
    const minStay = minStayRaw === "" ? null : Number.parseInt(minStayRaw, 10);
    if (minStay !== null && (!Number.isInteger(minStay) || minStay < 1)) {
      result.errors.push(`line ${String(lineNo)}: "${minStayRaw}" is not a minimum stay`);
      return;
    }
    const key = `${listingRef}|${date}`;
    if (seen.has(key)) {
      result.errors.push(`line ${String(lineNo)}: ${date} appears twice for "${listingRef}"`);
      return;
    }
    seen.add(key);
    result.rows.push({ date, listingRef, priceMinor, ...(minStay === null ? {} : { minStay }) });
  });
  return result;
}
