import { defineConfig } from "vitest/config";
/** Unit tests only; Playwright specs under e2e/ are run by `pnpm test:e2e`. */
export default defineConfig({ test: { include: ["src/**/*.test.ts", "src/**/*.test.tsx"] } });
