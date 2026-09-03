import { cookies } from "next/headers";
import { Id } from "@pms/core";
import { DrizzleChannelRepository } from "@pms/db";
import { withPermission } from "@/server/with-permission";
import { HttpProblem } from "@/server/errors";

interface Callback {
  channelId: string;
  propertyIds: string[];
}

/**
 * Airbnb returns the host here through Channex (CH-5): `success`, the new
 * `channel_id` and our `token`. The token must match the session's cookie, then
 * one inactive ChannelConnection per property points at that Channex channel.
 */
export const GET = withPermission.route<Callback>(
  "channel_account:manage",
  {
    scope: "organization",
    input: async (req) => {
      const q = req.nextUrl.searchParams;
      const jar = await cookies();
      const raw = jar.get("pms_airbnb_link")?.value;
      const saved = raw ? (JSON.parse(raw) as { token: string; propertyIds: string[] }) : null;
      if (q.get("success") !== "true")
        throw new HttpProblem(400, "airbnb_declined", "Airbnb authorisation was not completed");
      if (!saved || q.get("token") !== saved.token)
        throw new HttpProblem(400, "oauth_state", "Airbnb link does not belong to this session");
      const channelId = q.get("channel_id") ?? "";
      if (!channelId) throw new HttpProblem(400, "airbnb_channel", "Airbnb returned no channel");
      jar.delete("pms_airbnb_link");
      return { channelId, propertyIds: saved.propertyIds };
    },
    subject: (i) => ({ kind: "channel_connection", id: `airbnb:${i.channelId}` }),
  },
  async (ctx, input, req) => {
    const ch = new DrizzleChannelRepository(ctx.tx, ctx.orgId);
    let first: string | null = null;
    for (const propertyId of input.propertyIds) {
      const existing = (await ch.listConnections(propertyId)).find(
        (c) => c.channexChannelId === input.channelId,
      );
      const id = existing?.id ?? Id.next();
      if (!existing) {
        await ch.insertConnection({
          id,
          propertyId,
          adapterCode: "AirBNB",
          settings: { managedIn: "channex" },
        });
        await ch.updateConnection(id, { channexChannelId: input.channelId });
      }
      first ??= id;
    }
    ctx.log.info({ orgId: ctx.orgId, channelId: input.channelId }, "airbnb.link.connected");
    return Response.redirect(
      new URL(`/channels/${first ?? ""}`, req.nextUrl.origin).toString(),
      302,
    );
  },
);
