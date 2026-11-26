import { fileURLToPath } from "node:url";
import { cloudflare } from "@cloudflare/vite-plugin";
import vinext from "vinext";
import { defineConfig } from "vite";

/**
 * ADR-0013: the production build of apps/web, for Cloudflare Workers (`pnpm build:cf`, Worker
 * config in wrangler.jsonc). `next dev` / `next build` stay the local and test builds. Native and
 * process-bound modules are swapped for the Worker shims in @pms/runtime; the paths are absolute
 * because Vite resolves an alias from the package that imports it.
 */
const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const shim = (name: string) => here(`../../packages/runtime/dist/shims/${name}.js`);

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@node-rs\/argon2$/, replacement: shim("argon2") },
      { find: /^pino$/, replacement: shim("pino") },
      { find: /^@electric-sql\/pglite(\/contrib\/btree_gist)?$/, replacement: shim("pglite") },
      { find: /^ioredis$/, replacement: shim("ioredis") },
    ],
  },
  environments: {
    // vinext loads ./ssr/index.js; without "type": "module" Vite would name it index.mjs
    ssr: { build: { rolldownOptions: { output: { entryFileNames: "[name].js" } } } },
    rsc: { build: { rolldownOptions: { output: { entryFileNames: "[name].js" } } } },
  },
  plugins: [
    vinext(),
    cloudflare({
      viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
    }),
  ],
});
