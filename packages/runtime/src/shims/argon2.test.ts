import { describe, expect, it } from "vitest";
import { hash as nativeHash, verify as nativeVerify } from "@node-rs/argon2";
import { hash, verify } from "./argon2.js";

describe("argon2 shim", () => {
  it("interoperates with the native module in both directions", async () => {
    const opts = { memoryCost: 8_192, timeCost: 1, parallelism: 1 };
    const fromShim = await hash("correct horse", opts);
    expect(fromShim.startsWith("$argon2id$v=19$m=8192,t=1,p=1$")).toBe(true);
    expect(await nativeVerify(fromShim, "correct horse")).toBe(true);
    expect(await verify(fromShim, "wrong")).toBe(false);
    const fromNative = await nativeHash("battery staple", opts);
    expect(await verify(fromNative, "battery staple")).toBe(true);
    expect(await verify(fromNative, "battery stapler")).toBe(false);
    expect(await verify("not a hash", "x")).toBe(false);
  });
});
