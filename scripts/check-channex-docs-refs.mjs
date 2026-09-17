#!/usr/bin/env node
/**
 * Every Channex call must cite the vendored docs page it was written from: a comment
 * containing `docs:` within the 15 lines above each `this.call("<op>"` / `this.listAll("<op>"`
 * in the Channex provider, naming a page that exists under docs/vendor/channex. The audit of
 * 2026-09-17 (docs/audits/) found the calls written without reading the page were the wrong ones.
 */
import { readFileSync, readdirSync } from "node:fs";

const file = new URL("../packages/connectivity/src/channex/provider.ts", import.meta.url).pathname;
const vendored = new Set(
  readdirSync(new URL("../docs/vendor/channex/", import.meta.url).pathname).map((f) => f.replace(/\.md$/, "")),
);
const lines = readFileSync(file, "utf8").split("\n");
const missing = [];
const unknownPage = [];
lines.forEach((line, i) => {
  const m = /this\.(?:call|listAll)\(\s*$|this\.(?:call|listAll)\(\s*"([a-z_.]+)"/.exec(line);
  if (!m) return;
  // the op name may sit on the next line when prettier wrapped the call
  const op = m[1] ?? (/^\s*"([a-z_.]+)"/.exec(lines[i + 1] ?? "") ?? [])[1];
  if (!op) return;
  const window = lines.slice(Math.max(0, i - 15), i + 1).join("\n");
  const cite = /docs:\s*([^\n]+)/.exec(window);
  if (!cite) return missing.push(`${op} (line ${i + 1})`);
  // the citation starts with the page: "hotels-collection (Update a property)", "channel-api-examples/booking.com (…)",
  // or prose like "Channel API — …"; normalised to a slug that must be part of a vendored file name
  const slug = cite[1].split(/ \(| — | › |:/)[0].trim().toLowerCase().replace(/[^a-z0-9./-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  const hit = slug.length >= 3 && [...vendored].some((p) => p.toLowerCase().replace(/__/g, "/").includes(slug));
  if (!hit) unknownPage.push(`${op} (line ${i + 1}): "${cite[1].trim().slice(0, 60)}"`);
});
if (missing.length || unknownPage.length) {
  if (missing.length) console.error(`Channex calls without a docs citation (${missing.length}):\n  ${missing.join("\n  ")}`);
  if (unknownPage.length) console.error(`Citations naming no vendored page (${unknownPage.length}):\n  ${unknownPage.join("\n  ")}`);
  process.exit(1);
}
console.log("every Channex call cites a vendored docs page");
