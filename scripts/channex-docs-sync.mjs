#!/usr/bin/env node
/**
 * Refresh the vendored Channex documentation (docs/vendor/channex).
 *
 * Channex publishes every page as Markdown (append `.md` to the page URL) and an index
 * at https://docs.channex.io/llms.txt. One file per page, named <section>__<page>.md,
 * plus _index.json (path, bytes) and _fetched.txt (UTC date). Uses curl so the same
 * command works behind the sandbox proxy and in CI.
 *
 *   node scripts/channex-docs-sync.mjs            # refresh everything
 *   node scripts/channex-docs-sync.mjs --check    # exit 1 when the vendored copy is stale
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("../docs/vendor/channex/", import.meta.url).pathname;
const INDEX_URL = "https://docs.channex.io/llms.txt";
const check = process.argv.includes("--check");

const fetchText = (url) => execFileSync("curl", ["-sSfL", "--max-time", "60", url], { encoding: "utf8" });
const fileNameFor = (url) => {
  const path = new URL(url).pathname.replace(/^\//, "").replace(/\.md$/, "") || "readme";
  return `${path.replace(/\//g, "__")}.md`;
};

const index = fetchText(INDEX_URL);
const urls = [...new Set([...index.matchAll(/\((https:\/\/docs\.channex\.io\/[^)\s]+\.md)\)/g)].map((m) => m[1]))];
if (urls.length < 50) throw new Error(`llms.txt listed only ${urls.length} pages; refusing to wipe the vendored copy`);

const fresh = new Map();
for (const url of urls) {
  try {
    fresh.set(fileNameFor(url), `<!-- ${url} -->\n${fetchText(url)}`);
  } catch (e) {
    console.error(`skip ${url}: ${e.message.split("\n")[0]}`);
  }
}

if (check) {
  const stale = [];
  for (const [name, body] of fresh) {
    const p = join(ROOT, name);
    if (!existsSync(p) || readFileSync(p, "utf8") !== body) stale.push(name);
  }
  if (stale.length) {
    console.error(`vendored Channex docs are stale (${stale.length} pages):\n  ${stale.slice(0, 20).join("\n  ")}`);
    process.exit(1);
  }
  console.log(`vendored Channex docs are current (${fresh.size} pages)`);
  process.exit(0);
}

mkdirSync(ROOT, { recursive: true });
for (const f of readdirSync(ROOT)) if (f.endsWith(".md") && f !== "README.md") rmSync(join(ROOT, f));
for (const [name, body] of fresh) writeFileSync(join(ROOT, name), body);
writeFileSync(join(ROOT, "_index.json"), JSON.stringify([...fresh].map(([n, b]) => [n, b.length]), null, 0) + "\n");
writeFileSync(join(ROOT, "_fetched.txt"), `${process.env.CHANNEX_DOCS_DATE ?? new Date().toISOString().slice(0, 10)}\n`);
console.log(`vendored ${fresh.size} pages into docs/vendor/channex`);
