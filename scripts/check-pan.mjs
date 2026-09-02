// PCI-6 / NFR-3: no card number may appear in fixtures, seeds, migrations or docs.
// A 13–19 digit run that passes Luhn is a PAN candidate; UUIDs and timestamps never pass.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["packages", "apps", "docs", "plugins", "load", "scripts"];
// test files that prove a PAN is refused (INV-7) legitimately contain one
const SKIP = /node_modules|\.next|dist|\.png$|\.jpg$|\.zip$|pnpm-lock|\.wasm$|\.tar$|\.test\.ts$/;
const hits = [];
function luhn(s) {
  let sum = 0;
  let alt = false;
  for (let i = s.length - 1; i >= 0; i--) {
    let n = Number(s[i]);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (SKIP.test(p)) continue;
    const st = statSync(p);
    if (st.isDirectory()) walk(p);
    else if (st.size < 4_000_000) {
      const text = readFileSync(p, "utf8");
      for (const m of text.matchAll(/(?<![\w-])\d{13,19}(?![\w-])/g)) {
        const run = m[0];
        if (/^(\d)\1+$/.test(run)) continue; // 0000000000000 style placeholders
        if (luhn(run)) hits.push(`${p}: ${run.slice(0, 6)}…${run.slice(-4)}`);
      }
    }
  }
}
for (const r of ROOTS)
  try {
    walk(r);
  } catch {
    /* absent root */
  }
if (hits.length) {
  console.error("PAN-shaped numbers found (PCI-6):\n" + hits.join("\n"));
  process.exit(1);
}
console.log("check-pan: no PAN-shaped numbers");
