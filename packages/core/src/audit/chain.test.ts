import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { canonicalJson, chainHash, verifyChain } from "./chain.js";
import type { AuditEntry, AuditInput } from "./types.js";
import { Id } from "../shared/id.js";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

const inputArb: fc.Arbitrary<AuditInput> = fc.record({
  orgId: fc.constant(Id.next()),
  actor: fc.record({ type: fc.constantFrom("user", "system"), id: fc.uuid() }),
  action: fc.constantFrom("rate.set", "booking.cancel", "member.invite"),
  subject: fc.record({ kind: fc.constant("thing"), id: fc.uuid() }),
  before: fc.option(fc.jsonValue(), { nil: undefined }),
  after: fc.option(fc.jsonValue(), { nil: undefined }),
  surface: fc.constant("test"),
  occurredAt: fc.constant("2026-09-02T00:00:00Z"),
});

function build(inputs: AuditInput[]): AuditEntry[] {
  let prev = "";
  return inputs.map((input, i) => {
    const seq = i + 1;
    const hash = chainHash(sha, prev, seq, input);
    const entry: AuditEntry = { ...input, id: Id.next(), seq, prevHash: prev, hash };
    prev = hash;
    return entry;
  });
}

describe("audit chain", () => {
  it("canonical JSON is key-order independent", () => {
    expect(canonicalJson({ b: 1, a: { d: undefined, c: [1, { z: 0, y: 1 }] } })).toBe(
      canonicalJson({ a: { c: [1, { y: 1, z: 0 }] }, b: 1 }),
    );
  });

  it("a valid chain verifies and any mutation is detected", () => {
    fc.assert(
      fc.property(fc.array(inputArb, { minLength: 1, maxLength: 12 }), fc.nat(), (inputs, pick) => {
        const chain = build(inputs);
        expect(verifyChain(sha, chain)).toEqual({ ok: true, checked: chain.length });
        const i = pick % chain.length;
        const tampered = chain.map((e, j) => (j === i ? { ...e, action: e.action + "!" } : e));
        const v = verifyChain(sha, tampered);
        expect(v.ok).toBe(false);
        expect(v.brokenAtSeq).toBe(i + 1);
      }),
    );
  });

  it("detects a deleted entry and a reordered entry", () => {
    const chain = build(Array.from({ length: 4 }, () => fc.sample(inputArb, 1)[0]!));
    expect(
      verifyChain(
        sha,
        chain.filter((e) => e.seq !== 2),
      ).ok,
    ).toBe(false);
    expect(verifyChain(sha, [chain[0]!, chain[2]!, chain[1]!, chain[3]!]).ok).toBe(false);
  });
});
