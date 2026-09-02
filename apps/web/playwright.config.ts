import { defineConfig } from "@playwright/test";

/** E2E against a built app on PGlite (no external services). CI runs the same against Postgres via DATABASE_URL. */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3100",
    trace: "retain-on-failure",
    // test-hook calls reuse sockets across long UI phases; Node closes idle keep-alive sockets
    // after 5 s and the reuse races it (ECONNRESET). Browsers drop this header; the API context honours it.
    extraHTTPHeaders: { connection: "close" },
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "pnpm exec next start -p 3100",
        url: "http://localhost:3100/api/health",
        reuseExistingServer: true,
        timeout: 120_000,
        env: { NEXT_TELEMETRY_DISABLED: "1", PMS_TEST_HOOKS: "1" },
      },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
