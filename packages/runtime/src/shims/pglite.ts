/** `@electric-sql/pglite` stand-in for Workers bundles: the in-process database is a development convenience, never a deployment target. */
export class PGlite {
  constructor() {
    throw new Error(
      "PGlite is not available on this runtime; set DATABASE_URL or a Hyperdrive binding",
    );
  }
}
export const btree_gist = {};
/** drizzle-orm/pglite imports the type parsers; the stub is never queried. */
export const types = {};
