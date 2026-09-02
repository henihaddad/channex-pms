import { describe, expect, it } from "vitest";
import { argon2Hasher, createCrypto, timingSafeEqualStrings, totpVerifier } from "./crypto.js";
import { createTokenService } from "./tokens.js";
import { loadConfig } from "./config.js";
import * as OTPAuth from "otpauth";

describe("crypto adapters", () => {
  it("argon2id hashes verify and reject", async () => {
    const h = await argon2Hasher.hash("correct horse battery");
    expect(h).toMatch(/^\$argon2id\$/);
    expect(await argon2Hasher.verify(h, "correct horse battery")).toBe(true);
    expect(await argon2Hasher.verify(h, "wrong")).toBe(false);
    expect(await argon2Hasher.verify("garbage", "x")).toBe(false);
  });

  it("seals and opens under the master key, rejecting tampering", async () => {
    const c = createCrypto("ab".repeat(32));
    const sealed = await c.seal("door code 1234");
    expect(sealed).not.toContain("1234");
    expect(await c.open(sealed)).toBe("door code 1234");
    await expect(c.open(sealed.slice(0, -2) + "zz")).rejects.toThrow();
    await expect(createCrypto("cd".repeat(32)).open(sealed)).rejects.toThrow();
  });

  it("verifies TOTP codes against the current step", () => {
    const secret = totpVerifier.generateSecret();
    const now = 1_780_000_000;
    const code = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secret) }).generate({
      timestamp: now * 1000,
    });
    expect(totpVerifier.verify(secret, code, now)).toBe(true);
    expect(totpVerifier.verify(secret, code, now + 120)).toBe(false);
    expect(totpVerifier.uri(secret, "ana@example.com", "Channex PMS")).toContain("otpauth://totp/");
  });

  it("access tokens round-trip and expire", async () => {
    const t = createTokenService("a".repeat(40));
    const token = await t.issueAccess({ sub: "u1", sid: "s1", gv: 3 });
    expect(await t.verifyAccess(token)).toEqual({ sub: "u1", sid: "s1", gv: 3 });
    expect(await createTokenService("b".repeat(40)).verifyAccess(token)).toBeNull();
  });

  it("timing-safe compare and config validation", () => {
    expect(timingSafeEqualStrings("abc", "abc")).toBe(true);
    expect(timingSafeEqualStrings("abc", "abd")).toBe(false);
    expect(() => loadConfig({ PMS_ENV: "production" })).toThrow(/Production requires/);
    expect(loadConfig({ LOG_LEVEL: "debug" }).LOG_LEVEL).toBe("debug");
    expect(() => loadConfig({ PMS_MASTER_KEY: "short" })).toThrow(/64 hex/);
  });
});
