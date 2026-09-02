// Root ESLint config, used by packages/* and apps/worker.
// apps/web and website/ use eslint-config-next and have their own config files.
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/.turbo/**",
      "**/coverage/**",
      "website/**",
      "apps/web/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports" }],
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", destructuredArrayIgnorePattern: "^_", ignoreRestSiblings: true }],
    },
  },
  {
    // Spec 14, condition C1: packages/core imports no framework and no I/O library.
    files: ["packages/core/src/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["next", "next/*", "react", "react/*", "react-dom", "react-dom/*"],
              message: "packages/core is framework-free (spec 14 §14.3, C1).",
            },
            {
              group: ["drizzle-orm", "drizzle-orm/*", "pg", "postgres", "ioredis", "bullmq"],
              message: "packages/core does not talk to infrastructure; use a port (spec 04).",
            },
          ],
        },
      ],
      // Spec 14 §14.7: money is integer minor units, never floats.
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.name='parseFloat']",
          message: "Floats are banned for money and dates. Use Money / LocalDate.",
        },
        {
          selector: "MemberExpression[object.name='Number'][property.name='parseFloat']",
          message: "Floats are banned for money and dates. Use Money / LocalDate.",
        },
      ],
    },
  },
  {
    files: ["**/*.test.ts", "**/*.spec.ts", "**/testing/**", "**/fake*/**", "**/fakes/**"],
    rules: {
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
);
