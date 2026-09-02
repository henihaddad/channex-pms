/**
 * Fails when the Drizzle schema has changes not captured by a migration.
 * drizzle-kit has no dry-run for generate, so we run it into a temp dir and
 * compare the snapshot it would write with the last committed one.
 */
import { execSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const committed = join(root, "migrations");
const tmp = mkdtempSync(join(tmpdir(), "pms-drift-"));
try {
  cpSync(committed, tmp, { recursive: true });
  execSync(`pnpm exec drizzle-kit generate --out ${tmp} --name drift_check`, {
    cwd: root,
    stdio: "pipe",
  });
  const before = readdirSync(committed).filter((f) => f.endsWith(".sql")).length;
  const after = readdirSync(tmp).filter((f) => f.endsWith(".sql")).length;
  if (after > before) {
    const extra = readdirSync(tmp)
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .at(-1)!;
    console.error(
      "db: schema drift detected; run `pnpm --filter @pms/db db:generate`:\n" +
        readFileSync(join(tmp, extra), "utf8"),
    );
    process.exit(1);
  }
  console.log("db: schema matches migrations");
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
