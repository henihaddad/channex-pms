import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Chip } from "@/components/ui";
import { elapsed } from "@/lib/format";
import type { ChannelsOverview } from "./channels.actions";
import { channelOf } from "./channel-meta";

/** "Which room is which, per channel": each room type against each connected channel, Direct and the last push. */
export async function RoomsTable({ rooms }: { rooms: ChannelsOverview["rooms"] }) {
  const t = await getTranslations("channels.board");
  const channels = [
    ...new Map(
      rooms
        .filter((r) => r.adapterCode)
        .map((r) => [channelOf(r.adapterCode!).name, channelOf(r.adapterCode!)]),
    ).values(),
  ];
  const byRoom = new Map<string, typeof rooms>();
  for (const r of rooms) byRoom.set(r.roomTypeId, [...(byRoom.get(r.roomTypeId) ?? []), r]);
  return (
    <div className="overflow-x-auto rounded-card border border-border bg-surface">
      <table className="w-full min-w-[760px] border-collapse text-sm">
        <thead>
          <tr className="bg-surface-secondary text-xs text-muted">
            <th className="border-b border-border px-4 py-3 text-start font-semibold">
              {t("propertyRoom")}
            </th>
            {channels.map((c) => (
              <th
                key={c.name}
                className="border-b border-border px-4 py-3 text-start font-semibold"
              >
                {c.name}
              </th>
            ))}
            <th className="border-b border-border px-4 py-3 text-start font-semibold">Direct</th>
            <th className="border-b border-border px-4 py-3 text-start font-semibold">
              {t("lastPush")}
            </th>
          </tr>
        </thead>
        <tbody>
          {[...byRoom.values()].map((rs) => {
            const r0 = rs[0]!;
            const missing = rs.some((r) => r.connectionId && r.otaRoomCodes.length === 0);
            return (
              <tr key={r0.roomTypeId} className={missing ? "bg-warning-soft/40" : undefined}>
                <td className="border-b border-default px-4 py-3">
                  <strong className="font-semibold">{r0.propertyTitle}</strong> · {r0.roomTitle}
                </td>
                {channels.map((c) => {
                  const cell = rs.find(
                    (r) => r.adapterCode && channelOf(r.adapterCode).name === c.name,
                  );
                  return (
                    <td key={c.name} className="border-b border-default px-4 py-3">
                      {!cell ? (
                        <span className="text-muted">—</span>
                      ) : cell.otaRoomCodes.length > 0 ? (
                        <Chip size="sm">
                          {cell.otaRoomCodes
                            .map((x) => (x.length > 12 ? `${x.slice(0, 12)}…` : x))
                            .join(", ")}
                        </Chip>
                      ) : (
                        <Link
                          href={`/channels/${cell.connectionId}`}
                          className="text-xs font-semibold text-warning-soft-foreground underline"
                        >
                          {t("notAssignedCell", { n: cell.waitingBookings })}
                        </Link>
                      )}
                    </td>
                  );
                })}
                <td className="border-b border-default px-4 py-3">
                  {r0.direct ? (
                    <Chip size="sm" color="success">
                      {t("live")}
                    </Chip>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
                <td className="border-b border-default px-4 py-3 text-muted">
                  {r0.lastPushAt ? t("ago", { ago: elapsed(r0.lastPushAt) }) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
