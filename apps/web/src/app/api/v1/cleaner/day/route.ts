import { withPermission } from "@/server/with-permission";
import { myDay } from "@/server/ops";

/** The cleaner app's day (spec 08 §8.7), cached on the phone for offline use (OPS-6). */
export const GET = withPermission.route<{ date: string }>(
  "turnover:read_own",
  {
    scope: "organization",
    audit: false,
    input: (req) => ({
      date: req.nextUrl.searchParams.get("date") ?? new Date().toISOString().slice(0, 10),
    }),
  },
  async (ctx, { date }) =>
    Response.json(await myDay(ctx, date), { headers: { "cache-control": "no-store" } }),
);
