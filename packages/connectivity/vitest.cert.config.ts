import { defineConfig } from "vitest/config";
/** Runs only with CHANNEX_STAGING_API_KEY set; every test skips otherwise (spec 05 §5.11). */
export default defineConfig({
  test: {
    include: ["certification/**/*.cert.test.ts"],
    testTimeout: 120_000,
    fileParallelism: false,
  },
});
