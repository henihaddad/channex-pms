import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // The kit (src/components/ui) is the only place that talks to HeroUI: pages compose the kit.
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/components/ui/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@heroui/react",
              message: "Import from @/components/ui; the kit configures HeroUI in one place.",
            },
          ],
          patterns: [
            {
              group: ["@heroui/*", "react-aria-components", "react-aria", "@react-aria/*"],
              message: "Import from @/components/ui; the kit configures HeroUI in one place.",
            },
          ],
        },
      ],
    },
  },
  globalIgnores([
    ".next/**",
    ".open-next/**",
    ".wrangler/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);
