import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite", "@node-rs/argon2", "pino"],
  experimental: { authInterrupts: true },
};

export default withNextIntl(nextConfig);
