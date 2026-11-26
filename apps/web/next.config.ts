import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/**
 * `next dev` / `next build`: local development, tests and e2e. Production is the vinext build for
 * Cloudflare Workers (vite.config.mts, ADR-0013), which reads this file for rewrites and headers.
 */
const nextConfig: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite", "@node-rs/argon2", "pino"],
  experimental: { authInterrupts: true },
  agentRules: false,
  // spec 04 §4.7b: OAuth discovery documents live at well-known paths; the handlers live under /oauth
  rewrites: async () => [
    { source: "/.well-known/oauth-protected-resource", destination: "/oauth/metadata/resource" },
    {
      source: "/.well-known/oauth-protected-resource/:path*",
      destination: "/oauth/metadata/resource",
    },
    { source: "/.well-known/oauth-authorization-server", destination: "/oauth/metadata/server" },
    {
      source: "/.well-known/oauth-authorization-server/:path*",
      destination: "/oauth/metadata/server",
    },
  ],
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
