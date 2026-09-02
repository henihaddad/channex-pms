#!/usr/bin/env node
// Reference plugin (spec 12 §12.7, ADR-0004): Slack notifications. Posts a short line to an
// incoming-webhook URL for the events it subscribes to. No dependencies, no PII: only
// references and amounts are forwarded, never guest names or message bodies.
import { createServer } from "node:http";
import { createHmac, timingSafeEqual } from "node:crypto";

const PORT = Number(process.env.PORT ?? 8792);
const SECRET = process.env.PLUGIN_SECRET ?? "";
const SLACK = process.env.SLACK_WEBHOOK_URL ?? "";
if (!SECRET || !SLACK) {
  console.error("PLUGIN_SECRET and SLACK_WEBHOOK_URL are required");
  process.exit(1);
}

export const manifest = {
  key: "slack-notify",
  name: "Slack notifications",
  version: "1.0.0",
  events: ["booking.revision_applied", "alert.raised", "statement.sent", "channel.health_changed"],
  extensionPoints: ["notification_sink"],
  permissions: ["read:booking_references", "read:alerts"],
  compatibleCore: ">=1.0.0 <2",
};

function verify(body, signature, timestamp) {
  const now = Math.floor(Date.now() / 1000);
  if (!timestamp || Math.abs(now - Number(timestamp)) > 300) return false;
  const expected =
    "v1=" + createHmac("sha256", SECRET).update(`v1.${timestamp}.${body}`).digest("hex");
  return (
    expected.length === (signature ?? "").length &&
    timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  );
}

function line(e) {
  const p = e.payload ?? {};
  switch (e.type) {
    case "booking.revision_applied":
      return `Booking ${p.bookingId?.slice(0, 8) ?? "?"}: ${p.diff?.statusChanged ? `${p.diff.statusChanged.from ?? "new"} → ${p.diff.statusChanged.to}` : "updated"}`;
    case "alert.raised":
      return `Alert ${p.type ?? ""} (${p.severity ?? ""}) on property ${p.propertyId?.slice(0, 8) ?? "?"}`;
    case "statement.sent":
      return `Owner statement ${p.period ?? ""} sent`;
    default:
      return `${e.type}`;
  }
}

createServer((req, res) => {
  if (req.method === "GET" && req.url === "/manifest") {
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify(manifest));
  }
  if (req.method !== "POST") return res.writeHead(405).end();
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", async () => {
    if (!verify(body, req.headers["x-pms-signature"], req.headers["x-pms-timestamp"]))
      return res.writeHead(401).end("bad signature");
    const e = JSON.parse(body);
    const r = await fetch(SLACK, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: line(e) }),
    });
    res.writeHead(r.ok ? 200 : 502).end(JSON.stringify({ ok: r.ok }));
  });
}).listen(PORT, () => console.log(`slack-notify plugin listening on :${PORT}`));
