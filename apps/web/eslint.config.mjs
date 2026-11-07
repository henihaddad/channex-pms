import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // The kit (src/components/ui) owns every control (ADR-0011): pages compose the kit, never a component library.
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/components/ui/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@heroui/react",
              message: "Removed (ADR-0011). Import from @/components/ui.",
            },
          ],
          patterns: [
            {
              group: [
                "@heroui/*",
                "react-aria-components",
                "react-aria",
                "@react-aria/*",
                "@radix-ui/*",
                "cmdk",
              ],
              message: "Import from @/components/ui; the kit owns every control (ADR-0011).",
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
