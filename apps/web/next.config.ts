import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/**
 * ADR-0008: `PMS_TARGET=cloudflare` builds for Workers through OpenNext. Native
 * and process-bound modules are swapped for the shims in @pms/runtime; `pg`
 * stays external so OpenNext bundles it under the `workerd` condition.
 */
const cloudflare = process.env.PMS_TARGET === "cloudflare";
const workerShims = {
  "@node-rs/argon2": "@pms/runtime/shims/argon2",
  pino: "@pms/runtime/shims/pino",
  "@electric-sql/pglite": "@pms/runtime/shims/pglite",
  "@electric-sql/pglite/contrib/btree_gist": "@pms/runtime/shims/pglite",
  ioredis: "@pms/runtime/shims/ioredis",
};

const nextConfig: NextConfig = {
  serverExternalPackages: cloudflare
    ? ["pg", "pg-cloudflare"]
    : ["@electric-sql/pglite", "@node-rs/argon2", "pino"],
  ...(cloudflare ? { turbopack: { resolveAlias: workerShims } } : {}),
  experimental: { authInterrupts: true },
  agentRules: false,
  // spec 10 §10.3: the funnel may be framed by the property's own site; everything else stays same-origin
  headers: async () => [
    {
      source: "/book/:path*",
      headers: [{ key: "Content-Security-Policy", value: "frame-ancestors *" }],
    },
    {
      source: "/((?!book|widget.js).*)",
      headers: [{ key: "X-Frame-Options", value: "SAMEORIGIN" }],
    },
  ],
};

export default withNextIntl(nextConfig);
