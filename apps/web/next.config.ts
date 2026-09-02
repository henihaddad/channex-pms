import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite", "@node-rs/argon2", "pino"],
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
