import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { LocalDate } from "../shared/local-date.js";
import {
  API_KEY_ACCESS_LEVELS,
  NEVER_ON_A_KEY,
  apiKeyPermissions,
  apiKeyVisiblePrefix,
  formatApiKey,
  hashApiKey,
  isApiKey,
  isApiKeyAccess,
} from "./api-key.js";
import { MAX_CELLS_PER_CALL, nightEdits, nightRange, nightsOf } from "./night-edits.js";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const body = fc.stringMatching(/^[A-Za-z0-9_-]{32,64}$/);

// a slice of the real catalogue: enough to exercise every rule
const CATALOGUE = [
  "org:read",
  "org:update",
  "org:delete",
  "property:read",
  "property:create",
  "property:delete",
  "booking:read",
  "booking:read_pii",
  "booking:read_payment_instrument",
  "booking:create",
  "booking:cancel",
  "ari:read",
  "ari:update_rate",
  "ari:update_availability",
  "ari:update_restriction",
  "channel:read",
  "channel:read_credentials",
  "message:read",
  "message:send",
  "review:read",
  "review:respond",
  "report:read_financial",
  "turnover:read_own",
  "api_key:read",
  "api_key:create",
  "member:invite",
  "payout:execute",
  "audit:read",
];

describe("API key format", () => {
  it("is otab_ plus the random body, and recognised as such", () => {
    fc.assert(
      fc.property(body, (b) => {
        const key = formatApiKey(b);
        expect(key.startsWith("otab_")).toBe(true);
        expect(isApiKey(key)).toBe(true);
        expect(apiKeyVisiblePrefix(key)).toBe(key.slice(0, 12));
      }),
    );
  });

  it("refuses short or odd bodies and other strings", () => {
    expect(() => formatApiKey("short")).toThrow();
    expect(() => formatApiKey("a".repeat(31))).toThrow();
    expect(() => formatApiKey(`${"a".repeat(32)}!`)).toThrow();
    expect(isApiKey("otab_short")).toBe(false);
    expect(isApiKey(`cx_live_${"a".repeat(40)}`)).toBe(false);
    expect(isApiKey("eyJhbGciOiJIUzI1NiJ9.e30.x")).toBe(false);
    expect(isApiKey(null)).toBe(false);
  });

  it("stores a hash: deterministic, never the secret, different keys differ", () => {
    fc.assert(
      fc.property(body, body, (a, b) => {
        const ka = formatApiKey(a);
        const h = hashApiKey(sha, ka);
        expect(h).toBe(hashApiKey(sha, ka));
        expect(h).not.toContain(a);
        expect(h).toMatch(/^[0-9a-f]{64}$/);
        if (a !== b) expect(hashApiKey(sha, formatApiKey(b))).not.toBe(h);
      }),
    );
  });
});

describe("API key access levels", () => {
  it("knows its levels", () => {
    expect(API_KEY_ACCESS_LEVELS).toEqual(["full", "read_only", "messages", "prices"]);
    expect(isApiKeyAccess("read_only")).toBe(true);
    expect(isApiKeyAccess("admin")).toBe(false);
  });

  it("never grants a forbidden permission, at any level", () => {
    for (const level of API_KEY_ACCESS_LEVELS)
      for (const p of apiKeyPermissions(level, CATALOGUE))
        expect(NEVER_ON_A_KEY.has(p)).toBe(false);
  });

  it("only grants permissions the catalogue has", () => {
    for (const level of API_KEY_ACCESS_LEVELS)
      for (const p of apiKeyPermissions(level, ["property:read", "message:send"]))
        expect(["property:read", "message:send"]).toContain(p);
  });

  it("read only holds reads and nothing that writes", () => {
    const ps = apiKeyPermissions("read_only", CATALOGUE);
    expect(ps).toEqual(
      expect.arrayContaining(["ari:read", "booking:read", "booking:read_pii", "message:read"]),
    );
    for (const p of ps) expect(p).toMatch(/:(read|read_pii|read_financial)$/);
    expect(ps).not.toContain("turnover:read_own");
  });

  it("messages can reply but not price; prices can price but not reply", () => {
    const m = apiKeyPermissions("messages", CATALOGUE);
    const p = apiKeyPermissions("prices", CATALOGUE);
    expect(m).toEqual(expect.arrayContaining(["message:send", "review:respond"]));
    expect(m).not.toContain("ari:update_rate");
    expect(p).toEqual(
      expect.arrayContaining([
        "ari:update_rate",
        "ari:update_availability",
        "ari:update_restriction",
      ]),
    );
    expect(p).not.toContain("message:send");
    expect(p).not.toContain("booking:read_pii");
  });

  it("full access is everything but the forbidden list", () => {
    const f = apiKeyPermissions("full", CATALOGUE);
    expect(f).toEqual(CATALOGUE.filter((p) => !NEVER_ON_A_KEY.has(p)).sort());
    expect(f).toContain("booking:create");
    expect(f).not.toContain("api_key:create");
  });
});

describe("night edits", () => {
  const EPOCH = LocalDate.of(2026, 1, 1);
  const night = fc.integer({ min: 0, max: 900 }).map((n) => EPOCH.plusDays(n));

  it("first and last night are both included: a half-open range one past the last", () => {
    fc.assert(
      fc.property(night, fc.integer({ min: 0, max: 365 }), (first, len) => {
        const last = first.plusDays(len);
        const r = nightRange(first.toString(), last.toString());
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.value.nights()).toBe(len + 1);
        const nights = nightsOf(r.value);
        expect(nights[0]).toBe(first.toString());
        expect(nights.at(-1)).toBe(last.toString());
        expect(new Set(nights).size).toBe(nights.length);
      }),
    );
  });

  it("refuses reversed, malformed and over-long ranges", () => {
    expect(nightRange("2026-05-10", "2026-05-09").ok).toBe(false);
    expect(nightRange("10/05/2026", "2026-05-09").ok).toBe(false);
    expect(nightRange("2026-01-01", "2027-06-01").ok).toBe(false);
  });

  it("one edit per plan and night, same values, never more than the cell cap", () => {
    fc.assert(
      fc.property(
        night,
        fc.integer({ min: 0, max: 60 }),
        fc.uniqueArray(fc.uuid(), { minLength: 1, maxLength: 4 }),
        fc.integer({ min: 0, max: 1_000_000 }),
        (first, len, plans, rate) => {
          const r = nightEdits({
            ratePlanIds: plans,
            firstNight: first.toString(),
            lastNight: first.plusDays(len).toString(),
            values: { rate },
          });
          expect(r.ok).toBe(true);
          if (!r.ok) return;
          expect(r.value).toHaveLength(plans.length * (len + 1));
          for (const e of r.value) expect(e.values).toEqual({ rate });
          expect(r.value.length).toBeLessThanOrEqual(MAX_CELLS_PER_CALL);
        },
      ),
    );
  });

  it("refuses rather than truncates past the cell cap, and needs a rate plan", () => {
    const plans = Array.from({ length: 6 }, (_, i) => `rp${String(i)}`);
    const r = nightEdits({
      ratePlanIds: plans,
      firstNight: "2026-01-01",
      lastNight: "2026-12-31",
      values: { stopSell: true },
    });
    expect(r.ok).toBe(false);
    expect(
      nightEdits({ ratePlanIds: [], firstNight: "2026-01-01", lastNight: "2026-01-02", values: {} })
        .ok,
    ).toBe(false);
  });
});
