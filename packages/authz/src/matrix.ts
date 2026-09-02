import { SYSTEM_ROLES, type SystemRole } from "./catalogue.js";
import { ROWS } from "./rows.js";

export interface Matrix {
  /** Row label → role → raw cell text, exactly as in the spec. */
  rows: Record<string, Record<SystemRole, string>>;
}

/** Parse the §2.4 table out of the spec markdown. Only the table between "## 2.4" and "## 2.5" is read. */
export function parseMatrixMarkdown(markdown: string): Matrix {
  const start = markdown.indexOf("## 2.4");
  const end = markdown.indexOf("## 2.5", start);
  if (start < 0 || end < 0) throw new Error("Spec 02 §2.4 not found");
  const lines = markdown
    .slice(start, end)
    .split("\n")
    .filter((l) => l.trim().startsWith("|"));
  const header = lines[0];
  if (!header) throw new Error("Matrix header not found");
  const headerCells = header
    .split("|")
    .slice(1, -1)
    .map((c) => c.trim().replace(/`/g, ""));
  const roles = headerCells.slice(1);
  const expected = [...SYSTEM_ROLES];
  if (roles.join(",") !== expected.join(",")) {
    throw new Error(`Matrix roles ${roles.join(",")} differ from catalogue ${expected.join(",")}`);
  }
  const rows: Matrix["rows"] = {};
  for (const line of lines.slice(2)) {
    const cells = line
      .split("|")
      .slice(1, -1)
      .map((c) => c.trim());
    const label = cells[0];
    if (!label) continue;
    if (!ROWS[label]) throw new Error(`Matrix row "${label}" has no definition in rows.ts`);
    const entry = {} as Record<SystemRole, string>;
    roles.forEach((role, i) => {
      entry[role as SystemRole] = cells[i + 1] ?? "·";
    });
    rows[label] = entry;
  }
  for (const label of Object.keys(ROWS)) {
    if (!rows[label]) throw new Error(`rows.ts defines "${label}" but the spec matrix does not`);
  }
  return { rows };
}
