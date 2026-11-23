/**
 * Fills `{name}` placeholders in a message the server read with `t.raw(...)`, for client
 * components that cannot load the catalogue themselves (the root layout ships only a few
 * namespaces to the browser). Plain placeholders only: plural forms are resolved on the server.
 */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in values ? String(values[key]) : whole,
  );
}
