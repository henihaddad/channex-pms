import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { hash as argonHash, verify as argonVerify } from "@node-rs/argon2";
import * as OTPAuth from "otpauth";
import type { Crypto, PasswordHasher, TotpVerifier } from "@pms/core";

/** Argon2id with OWASP-recommended parameters (spec 13 §13.5). */
export const argon2Hasher: PasswordHasher = {
  hash: (password) => argonHash(password, { memoryCost: 19_456, timeCost: 2, parallelism: 1 }),
  verify: async (hash, password) => {
    try {
      return await argonVerify(hash, password);
    } catch {
      return false;
    }
  },
};

export const totpVerifier: TotpVerifier = {
  generateSecret: () => new OTPAuth.Secret({ size: 20 }).base32,
  uri: (secret, accountName, issuer) =>
    new OTPAuth.TOTP({
      issuer,
      label: accountName,
      secret: OTPAuth.Secret.fromBase32(secret),
    }).toString(),
  verify: (secret, code, nowEpochSeconds) => {
    const totp = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secret) });
    return (
      totp.validate({
        token: code.replace(/\s+/g, ""),
        timestamp: nowEpochSeconds * 1000,
        window: 1,
      }) !== null
    );
  },
};

/**
 * AES-256-GCM sealing under the master key. Format: v1.<iv>.<tag>.<ciphertext> base64url.
 * Tenant DEKs (spec 04 §4.6 layer 5) are wrapped with the same primitive.
 */
export function createCrypto(masterKeyHex: string): Crypto {
  const key = Buffer.from(masterKeyHex, "hex");
  if (key.length !== 32) throw new Error("master key must be 32 bytes");
  return {
    randomToken: (bytes = 32) => randomBytes(bytes).toString("base64url"),
    sha256Hex: (input) => createHash("sha256").update(input).digest("hex"),
    seal: async (plain) => {
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
      return [
        "v1",
        iv.toString("base64url"),
        cipher.getAuthTag().toString("base64url"),
        ct.toString("base64url"),
      ].join(".");
    },
    open: async (sealed) => {
      const [v, iv, tag, ct] = sealed.split(".");
      if (v !== "v1" || !iv || !tag || !ct) throw new Error("malformed sealed value");
      const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
      decipher.setAuthTag(Buffer.from(tag, "base64url"));
      return Buffer.concat([
        decipher.update(Buffer.from(ct, "base64url")),
        decipher.final(),
      ]).toString("utf8");
    },
  };
}

/** Constant-time comparison for webhook secrets and tokens. */
export function timingSafeEqualStrings(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i]! ^ bb[i]!;
  return diff === 0;
}
