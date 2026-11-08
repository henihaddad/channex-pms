import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui";
import { guard } from "@/server/guard";
import { loadChannelsOverview } from "../channels.actions";
import { RoomsTable } from "../rooms-table";

/** Rooms per channel (Channels tab): every room type against every connected channel. */
export default async function RoomsPerChannelPage() {
  const t = await getTranslations("channels");
  const tb = await getTranslations("channels.board");
  const o = await guard(() => loadChannelsOverview());
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t("title")} description={tb("tableTitle")} />
      <RoomsTable rooms={o.rooms} />
    </div>
  );
}
