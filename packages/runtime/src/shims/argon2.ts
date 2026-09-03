/**
 * Drop-in for `@node-rs/argon2` on runtimes without native addons or runtime
 * WebAssembly compilation (Cloudflare Workers). Bundlers alias `@node-rs/argon2`
 * to this module. Pure-JS Argon2id from @noble/hashes; the PHC strings are the
 * ones the native module produces and verifies, so a hash made on one runtime
 * verifies on the other.
 */
import { argon2id } from "@noble/hashes/argon2";

export interface Options {
  memoryCost?: number;
  timeCost?: number;
  parallelism?: number;
  outputLen?: number;
}

const b64 = (u8: Uint8Array): string =>
  btoa(Array.from(u8, (b) => String.fromCharCode(b)).join("")).replace(/=+$/, "");
const unb64 = (s: string): Uint8Array =>
  Uint8Array.from(atob(s + "=".repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));

export async function hash(password: string, opts: Options = {}): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const m = opts.memoryCost ?? 19_456;
  const t = opts.timeCost ?? 2;
  const p = opts.parallelism ?? 1;
  const out = argon2id(password, salt, { t, m, p, dkLen: opts.outputLen ?? 32 });
  return `$argon2id$v=19$m=${String(m)},t=${String(t)},p=${String(p)}$${b64(salt)}$${b64(out)}`;
}

const PHC = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/;

export async function verify(hashed: string, password: string): Promise<boolean> {
  const m = PHC.exec(hashed);
  if (!m) return false;
  const expected = unb64(m[5]!);
  const actual = argon2id(password, unb64(m[4]!), {
    m: Number(m[1]),
    t: Number(m[2]),
    p: Number(m[3]),
    dkLen: expected.length,
  });
  let diff = actual.length ^ expected.length;
  for (let i = 0; i < Math.min(actual.length, expected.length); i++)
    diff |= actual[i]! ^ expected[i]!;
  return diff === 0;
}
