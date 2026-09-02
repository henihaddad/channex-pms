#!/usr/bin/env node
// Reference plugin (spec 12 §12.7, ADR-0004): accounting export. Receives signed platform
// events and appends one CSV row per issued invoice, sent statement and captured payment,
// in a shape Xero and QuickBooks import as bank/journal lines. No dependencies.
import { createServer } from "node:http";
import { appendFileSync, existsSync, writeFileSync } from "node:fs";
import { createHmac, timingSafeEqual } from "node:crypto";

const PORT = Number(process.env.PORT ?? 8791);
const SECRET = process.env.PLUGIN_SECRET ?? "";
const OUT = process.env.CSV_PATH ?? "./accounting.csv";
if (!SECRET) {
  console.error("PLUGIN_SECRET is required (the secret shown at install time)");
  process.exit(1);
}
if (!existsSync(OUT)) writeFileSync(OUT, "date,type,reference,description,amount,currency,org\n");

export const manifest = {
  key: "accounting-csv",
  name: "Accounting CSV export",
  version: "1.0.0",
  events: ["invoice.issued", "statement.sent", "payment.captured"],
  extensionPoints: ["event_subscriber"],
  permissions: ["read:invoices", "read:statements", "read:payments"],
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
const csv = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;

createServer((req, res) => {
  if (req.method === "GET" && req.url === "/manifest") {
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify(manifest));
  }
  if (req.method !== "POST") return res.writeHead(405).end();
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    if (!verify(body, req.headers["x-pms-signature"], req.headers["x-pms-timestamp"]))
      return res.writeHead(401).end("bad signature");
    const e = JSON.parse(body);
    const p = e.payload ?? {};
    const row = [
      e.occurredAt?.slice(0, 10),
      e.type,
      p.reference ?? p.number ?? p.statementId ?? e.aggregate?.id,
      p.description ?? e.type,
      ((p.amountMinor ?? p.totalMinor ?? p.netDueMinor ?? 0) / 100).toFixed(2),
      p.currency ?? "",
      e.orgId,
    ]
      .map(csv)
      .join(",");
    appendFileSync(OUT, row + "\n");
    res
      .writeHead(200, { "content-type": "application/json" })
      .end(JSON.stringify({ ok: true, delivery: req.headers["x-pms-delivery"] }));
  });
}).listen(PORT, () => console.log(`accounting-csv plugin listening on :${PORT}, writing ${OUT}`));
