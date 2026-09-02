import type { AuditEntry, AuditInput } from "./types.js";

/** Stable JSON: keys sorted recursively, undefined dropped. The hash input must not depend on key order. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

export type Sha256Hex = (input: string) => string;

/** hash = sha256(prev_hash ‖ seq ‖ canonical(entry)). The genesis prev_hash is the empty string. */
export function chainHash(
  sha256Hex: Sha256Hex,
  prevHash: string,
  seq: number,
  input: AuditInput,
): string {
  return sha256Hex(`${prevHash}|${String(seq)}|${canonicalJson(input)}`);
}

export interface ChainVerification {
  ok: boolean;
  checked: number;
  brokenAtSeq?: number;
}

/** Walk entries in seq order and recompute every link. */
export function verifyChain(
  sha256Hex: Sha256Hex,
  entries: readonly AuditEntry[],
): ChainVerification {
  let prev = "";
  let expectedSeq = 1;
  for (const e of entries) {
    if (e.seq !== expectedSeq || e.prevHash !== prev)
      return { ok: false, checked: expectedSeq - 1, brokenAtSeq: e.seq };
    const { id: _id, seq: _seq, prevHash: _p, hash: _h, ...input } = e;
    if (chainHash(sha256Hex, prev, e.seq, input) !== e.hash)
      return { ok: false, checked: expectedSeq - 1, brokenAtSeq: e.seq };
    prev = e.hash;
    expectedSeq += 1;
  }
  return { ok: true, checked: expectedSeq - 1 };
}
