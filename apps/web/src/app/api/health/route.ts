import { publicRoute } from "@/server/public";

export const dynamic = "force-dynamic";

export const GET = publicRoute("health", async () =>
  Response.json({ status: "ok", service: "web", time: new Date().toISOString() }),
);
