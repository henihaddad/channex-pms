// PRIV-2 / spec 04 §4.9: PII field names must never appear in log or telemetry calls.
// Greps every log call (`log.<level>(`, `logger.<level>(`, `console.<level>(`) for known-sensitive keys.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const SENSITIVE = [
  "email",
  "phone",
  "passwordHash",
  "password",
  "totpSecret",
  "cardNumber",
  "pan",
  "cvv",
  "doorCode",
  "accessCode",
  "refreshToken",
];
const ROOTS = ["apps", "packages"];
const SKIP = /node_modules|\.next|dist|\.test\.ts$|\.int\.test\.ts$|\/testing\/|\/fake|logger\.ts$/;
const CALL = /\b(?:log|logger|console)\.(?:trace|debug|info|warn|error|fatal)\(([^;]*)\)/g;

const hits = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (SKIP.test(p)) continue;
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(ts|tsx|mjs|js)$/.test(p)) {
      const src = readFileSync(p, "utf8");
      for (const m of src.matchAll(CALL)) {
        const args = m[1];
        for (const key of SENSITIVE) {
          if (new RegExp(`\\b${key}\\s*:`).test(args) && !args.includes("[redacted]"))
            hits.push(`${p}: log call mentions "${key}"`);
        }
      }
    }
  }
}
for (const r of ROOTS) walk(r);
if (hits.length) {
  console.error("check-pii-logs: sensitive field names in log calls:\n  " + hits.join("\n  "));
  process.exit(1);
}
console.log("check-pii-logs: no PII field names in log calls");
