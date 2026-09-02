/**
 * Regenerate src/generated/matrix.json from docs/specs/02-personas-and-rbac.md §2.4.
 * `--check` fails when the committed snapshot differs from the spec (CI gate).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseMatrixMarkdown } from "../src/matrix.js";
import { buildRoles } from "../src/roles.js";

const here = dirname(fileURLToPath(import.meta.url));
const specPath = resolve(here, "../../../docs/specs/02-personas-and-rbac.md");
const outPath = resolve(here, "../src/generated/matrix.json");

const matrix = parseMatrixMarkdown(readFileSync(specPath, "utf8"));
buildRoles(matrix); // throws on any unparseable cell
const fresh = JSON.stringify(matrix, null, 2) + "\n";

if (process.argv.includes("--check")) {
  let current = "";
  try {
    current = readFileSync(outPath, "utf8");
  } catch {
    /* missing */
  }
  if (current !== fresh) {
    console.error(
      `authz: ${outPath} is out of date with spec 02 §2.4. Run \`pnpm --filter @pms/authz generate\`.`,
    );
    process.exit(1);
  }
  console.log("authz: matrix snapshot matches spec 02 §2.4");
} else {
  writeFileSync(outPath, fresh);
  console.log(`authz: wrote ${outPath}`);
}
