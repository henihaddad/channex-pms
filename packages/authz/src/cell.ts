import {
  SENSITIVE_PERMISSIONS,
  type Permission,
  type RowFilter,
  type ScopeKind,
} from "./catalogue.js";
import type { RowDef } from "./rows.js";

/** What one matrix cell grants to a role for one row. */
export interface CellGrant {
  allow: Permission[];
  stepUp: boolean;
  rowFilter?: RowFilter;
  /** Off by default, grantable via override (`○`). */
  grantable: Permission[];
  /** The widest scope at which this row applies for the role (`✓ (group)`). */
  maxScope?: Extract<ScopeKind, "group" | "property">;
}

const FILTERS: Readonly<Record<string, RowFilter>> = {
  today: "today",
  limited: "limited",
  aggregate: "aggregate",
  "name only": "name_only",
  "own stays": "own_stays",
  own: "own",
};

const uniq = (xs: readonly Permission[]): Permission[] => [...new Set(xs)];
const stripSensitive = (xs: readonly Permission[]): Permission[] =>
  xs.filter((p) => !SENSITIVE_PERMISSIONS.has(p));

/**
 * Parse one cell of spec 02 §2.4. Grammar (whitespace-insensitive):
 *   base := ✓ | R | · | ! | ○ | ⊙ | R⊙ | create
 *   cell := base [ '(' scope ')' | '+' named | named | filter ]
 * Unknown qualifiers throw so a spec change cannot silently widen a role.
 */
export function parseCell(raw: string, row: RowDef, rowLabel: string): CellGrant {
  const text = raw.trim();
  const none: CellGrant = { allow: [], stepUp: false, grantable: [] };
  if (text === "·" || text === "") return none;

  const m = /^(R⊙|✓|R|!|○|⊙|create)\s*(.*)$/u.exec(text);
  if (!m) throw new Error(`Unparseable cell "${raw}" in row "${rowLabel}"`);
  const base = m[1] as "R⊙" | "✓" | "R" | "!" | "○" | "⊙" | "create";
  let qualifier = (m[2] ?? "").trim();

  let maxScope: CellGrant["maxScope"];
  const scope = /^\((group|property)\)$/.exec(qualifier);
  if (scope) {
    maxScope = scope[1] as "group" | "property";
    qualifier = "";
  }

  const named = (name: string): Permission[] => {
    const set = row.named?.[name];
    if (!set) throw new Error(`Row "${rowLabel}" has no named subset "${name}" (cell "${raw}")`);
    return [...set];
  };
  const filterOf = (q: string): RowFilter => {
    const f = FILTERS[q];
    if (!f) throw new Error(`Unknown row filter "${q}" in row "${rowLabel}" (cell "${raw}")`);
    return f;
  };

  const result: CellGrant = { ...none, ...(maxScope ? { maxScope } : {}) };

  switch (base) {
    case "✓": {
      if (qualifier === "") result.allow = stripSensitive(row.full);
      else result.allow = uniq([...row.read, ...named(qualifier)]);
      return result;
    }
    case "!": {
      result.allow = [...row.full];
      result.stepUp = true;
      return result;
    }
    case "R": {
      if (qualifier === "") result.allow = [...row.read];
      else if (qualifier.startsWith("+"))
        result.allow = uniq([...row.read, ...named(qualifier.slice(1).trim())]);
      else {
        result.allow = [...row.read];
        result.rowFilter = filterOf(qualifier);
      }
      return result;
    }
    case "○": {
      if (qualifier === "") result.grantable = [...row.full];
      else if (row.named?.[qualifier]) result.grantable = named(qualifier);
      else {
        result.grantable = [...row.full];
        result.rowFilter = filterOf(qualifier);
      }
      return result;
    }
    case "⊙": {
      result.allow = [...(row.own ?? row.read)];
      result.rowFilter = qualifier === "" ? "own" : filterOf(qualifier);
      return result;
    }
    case "R⊙": {
      result.allow = [...row.read];
      result.rowFilter = "own";
      if (qualifier.startsWith("+"))
        result.allow = uniq([...result.allow, ...named(qualifier.slice(1).trim())]);
      else if (qualifier !== "") result.rowFilter = filterOf(qualifier);
      return result;
    }
    case "create": {
      result.allow = named("create");
      return result;
    }
  }
}
