import { startCardSetup } from "@pms/jobs";
import { container } from "@/server/container";
import { withPermission } from "@/server/with-permission";

/** The client secret for setting a card up at the desk, so later invoices need no challenge. */
export const POST = withPermission.route(
  "billing:manage",
  {
    scope: "organization",
    subject: () => ({ kind: "subscription", id: "current" }),
    input: () => ({}),
  },
  async (ctx) => {
    const c = await container();
    const deps = {
      db: c.db.db,
      clock: c.clock,
      crypto: c.crypto,
      log: c.log,
      mailer: c.mailer,
      billing: c.billing,
    };
    return Response.json(await startCardSetup(deps, ctx.orgId, (fn) => fn(ctx.tx)));
  },
);
