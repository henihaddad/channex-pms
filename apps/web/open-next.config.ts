import { defineCloudflareConfig } from "@opennextjs/cloudflare";

/** ADR-0008. Every page is dynamic (tenant data behind RLS), so no incremental cache is configured. */
export default defineCloudflareConfig({});
