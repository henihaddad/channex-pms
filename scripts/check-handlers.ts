/**
 * Unwrapped-handler build check (spec 14 §14.3 C2, spec 02 RBAC-1).
 *
 * Every export of app/**\/route.ts must be `withPermission.route(...)` or `publicRoute(...)`.
 * Every export of a `'use server'` file must be `withPermission(...)`, `publicAction(...)` or
 * `withGuestSession(...)`; server files must be named *.actions.ts; inline `'use server'`
 * directives inside functions are errors. Emits handlers.manifest.json for the isolation suites.
 */
import { writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { Node, Project, SyntaxKind, type SourceFile } from "ts-morph";

const webRoot = resolve(import.meta.dirname, "../apps/web");
const project = new Project({
  tsConfigFilePath: resolve(webRoot, "tsconfig.json"),
  skipAddingFilesFromTsConfig: true,
});
project.addSourceFilesAtPaths([resolve(webRoot, "src/**/*.ts"), resolve(webRoot, "src/**/*.tsx")]);

const ROUTE_WRAPPERS = new Set(["withPermission.route", "publicRoute", "withOperator.route"]);
const ACTION_WRAPPERS = new Set([
  "withPermission",
  "publicAction",
  "withGuestSession",
  "withOperator",
]);
const ROUTE_CONFIG_EXPORTS = new Set([
  "dynamic",
  "runtime",
  "revalidate",
  "maxDuration",
  "preferredRegion",
  "fetchCache",
  "dynamicParams",
]);
const HTTP_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);

interface ManifestEntry {
  file: string;
  export: string;
  kind: "route" | "action";
  wrapper: string;
  permission?: string;
  publicReason?: string;
  scope?: string;
}

const errors: string[] = [];
const manifest: ManifestEntry[] = [];

function calleeText(init: Node): string | null {
  if (!Node.isCallExpression(init)) return null;
  return init.getExpression().getText();
}

function literalArg(init: Node, index: number): string | undefined {
  if (!Node.isCallExpression(init)) return undefined;
  const arg = init.getArguments()[index];
  return arg && Node.isStringLiteral(arg) ? arg.getLiteralValue() : undefined;
}

function scopeArg(init: Node): string | undefined {
  if (!Node.isCallExpression(init)) return undefined;
  const opts = init.getArguments()[1];
  if (!opts || !Node.isObjectLiteralExpression(opts)) return undefined;
  const prop = opts.getProperty("scope");
  if (!prop || !Node.isPropertyAssignment(prop)) return undefined;
  const v = prop.getInitializer();
  return v && Node.isStringLiteral(v) ? v.getLiteralValue() : undefined;
}

function hasUseServerDirective(sf: SourceFile): boolean {
  const first = sf.getStatements()[0];
  return (
    !!first &&
    Node.isExpressionStatement(first) &&
    first.getExpression().getText().replace(/['"]/g, "") === "use server"
  );
}

function checkExports(sf: SourceFile, kind: "route" | "action"): void {
  const file = relative(webRoot, sf.getFilePath());
  const wrappers = kind === "route" ? ROUTE_WRAPPERS : ACTION_WRAPPERS;
  for (const [name, decls] of sf.getExportedDeclarations()) {
    if (kind === "route" && ROUTE_CONFIG_EXPORTS.has(name)) continue;
    if (
      kind === "action" &&
      !decls.some((d) => Node.isVariableDeclaration(d) || Node.isFunctionDeclaration(d))
    )
      continue; // types/interfaces
    for (const d of decls) {
      if (Node.isInterfaceDeclaration(d) || Node.isTypeAliasDeclaration(d)) continue;
      if (!Node.isVariableDeclaration(d)) {
        errors.push(
          `${file}: export "${name}" must be a const initialised with ${[...wrappers].join(" | ")}`,
        );
        continue;
      }
      const init = d.getInitializer();
      const callee = init ? calleeText(init) : null;
      if (!init || !callee || !wrappers.has(callee)) {
        errors.push(
          `${file}: export "${name}" is not wrapped (found: ${callee ?? init?.getKindName() ?? "nothing"})`,
        );
        continue;
      }
      if (kind === "route" && !HTTP_METHODS.has(name))
        errors.push(`${file}: unexpected route export "${name}"`);
      const entry: ManifestEntry = { file, export: name, kind, wrapper: callee };
      if (callee === "publicRoute" || callee === "publicAction") {
        const reason = literalArg(init, 0);
        if (!reason) errors.push(`${file}: ${callee} for "${name}" needs a literal reason`);
        else entry.publicReason = reason;
      } else if (callee.startsWith("withPermission")) {
        const permission = literalArg(init, 0);
        if (!permission)
          errors.push(`${file}: withPermission for "${name}" needs a literal permission`);
        else entry.permission = permission;
        const scope = scopeArg(init);
        if (scope) entry.scope = scope;
      }
      manifest.push(entry);
    }
  }
}

for (const sf of project.getSourceFiles()) {
  const file = relative(webRoot, sf.getFilePath());
  const isRoute = /(^|\/)route\.tsx?$/.test(file);
  const useServer = hasUseServerDirective(sf);
  // inline 'use server' inside a function body anywhere is forbidden
  for (const lit of sf.getDescendantsOfKind(SyntaxKind.StringLiteral)) {
    if (lit.getLiteralValue() !== "use server") continue;
    const stmt = lit.getParentIfKind(SyntaxKind.ExpressionStatement);
    if (stmt && stmt.getParent() !== sf)
      errors.push(`${file}: inline 'use server' directive; move the action to a *.actions.ts file`);
  }
  if (isRoute) checkExports(sf, "route");
  else if (useServer) {
    if (!/\.actions\.ts$/.test(file))
      errors.push(`${file}: 'use server' files must be named *.actions.ts`);
    checkExports(sf, "action");
  }
}

manifest.sort((a, b) => (a.file + a.export).localeCompare(b.file + b.export));
writeFileSync(resolve(webRoot, "handlers.manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

if (errors.length) {
  console.error("check-handlers: unwrapped or malformed handlers:\n  " + errors.join("\n  "));
  process.exit(1);
}
console.log(
  `check-handlers: ${String(manifest.length)} handlers verified (${String(manifest.filter((m) => m.publicReason).length)} public)`,
);
