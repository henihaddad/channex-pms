import type { NextConfig } from "next";

// Static export: the landing page has no server features and deploys to Cloudflare Pages as files.
const nextConfig: NextConfig = { output: "export", images: { unoptimized: true } };

export default nextConfig;
