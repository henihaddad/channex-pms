import type { NextRequest } from "next/server";
import { REPORT_CATALOGUE, runReport, toCsv, toPdf } from "@pms/jobs";
import { withPermission } from "@/server/with-permission";
import { container } from "@/server/container";
import { HttpProblem } from "@/server/errors";

interface Input {
  key: string;
  from: string;
  to: string;
  propertyId: string | null;
  date: string | null;
  format: "csv" | "pdf";
}
const parse = (req: NextRequest, params: { key?: string | string[] }): Input => {
  const q = req.nextUrl.searchParams;
  const key = String(params.key ?? "").replace(/\.(csv|pdf)$/, "");
  return {
    key,
    from: q.get("from") ?? "",
    to: q.get("to") ?? "",
    propertyId: q.get("property"),
    date: q.get("date"),
    format: String(params.key).endsWith(".pdf") || q.get("format") === "pdf" ? "pdf" : "csv",
  };
};
const respond = (input: Input, result: Awaited<ReturnType<typeof runReport>>): Response =>
  input.format === "pdf"
    ? new Response(Buffer.from(toPdf(result)), {
        headers: {
          "content-type": "application/pdf",
          "content-disposition": `attachment; filename="${input.key}.pdf"`,
        },
      })
    : new Response(toCsv(result), {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="${input.key}.csv"`,
        },
      });

/** Export centre (spec 11 §11.3): CSV or PDF of any catalogue report; financial reports need `report:read_financial`, and every export is audited (`export:execute`). */
export const GET = withPermission.route<Input>(
  "export:execute",
  { scope: "organization", input: parse, auditInput: (i) => i },
  async (ctx, input) => {
    const def = REPORT_CATALOGUE.find((r) => r.key === input.key);
    if (!def) throw new HttpProblem(404, "not_found", "Unknown report");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.from) || !/^\d{4}-\d{2}-\d{2}$/.test(input.to))
      throw new HttpProblem(422, "range", "from and to are required (YYYY-MM-DD)");
    const c = await container();
    const result = await runReport(ctx.tx, ctx.orgId, c.crypto, input.key, {
      from: input.from,
      to: input.to,
      propertyId: input.propertyId,
      date: input.date,
    });
    return respond(input, result);
  },
);
