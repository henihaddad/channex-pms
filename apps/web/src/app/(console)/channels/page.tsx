import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Alert, AnchorButton, Card, Chip, LinkButton, PageHeader, Stat, cn } from "@/components/ui";
import { guard } from "@/server/guard";
import { container } from "@/server/container";
import { elapsed } from "@/lib/format";
import { acknowledgeEventAction, loadChannelsOverview, loadHealthBoard } from "./channels.actions";
import { CHANNELS, channelOf, type ChannelKey } from "./channel-meta";
import { IcalCopy } from "./copy-link";
import { RoomsTable } from "./rooms-table";

/**
 * Channels (design canvas board): what is connected and whether every room is assigned, one card
 * per channel with the one action it needs, the iCal export for anything else, and which room is
 * which on each channel. Each connection keeps its own element (data-state) inside its card.
 */
export default async function ChannelsPage({
  searchParams,
}: {
  searchParams: Promise<{ problem?: string }>;
}) {
  const t = await getTranslations("channels");
  const tb = await getTranslations("channels.board");
  const { problem } = await searchParams;
  const [board, o] = await Promise.all([
    guard(() => loadHealthBoard()),
    guard(() => loadChannelsOverview()),
  ]);
  const appUrl = (await container()).config.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");

  // per channel: its connections and its rooms
  const conns = board.connections.map((c) => ({ ...c, ch: channelOf(c.adapterCode) }));
  const directProps = new Set(o.rooms.filter((r) => r.direct).map((r) => r.propertyId));
  const keys: ChannelKey[] = [
    ...CHANNELS.map((c) => c.key),
    ...(conns.some((c) => c.ch.key === "other") ? (["other"] as const) : []),
  ];
  const roomsFor = (key: ChannelKey) =>
    o.rooms.filter((r) => r.adapterCode && channelOf(r.adapterCode).key === key);
  const unassigned = o.rooms.filter((r) => r.connectionId && r.otaRoomCodes.length === 0);
  const needed = o.rooms.filter((r) => r.connectionId).length;
  const connectedNames = [
    ...new Set([
      ...conns.filter((c) => c.state === "active").map((c) => c.ch.name),
      ...(directProps.size ? ["Direct"] : []),
    ]),
  ];
  const drift = o.sync.conflictedCells + o.sync.failedCells;

  return (
    <div className="flex flex-col gap-5">
      {problem === "no_live_property" ? (
        <Alert tone="warning" data-testid="no-live-property">
          {t("noLiveProperty")}{" "}
          <Link href="/properties" className="font-semibold underline underline-offset-2">
            {t("goToProperties")}
          </Link>
        </Alert>
      ) : null}
      <PageHeader
        title={t("title")}
        actions={
          <>
            <Link
              href="/channels/connect"
              className="text-sm text-muted hover:text-foreground hover:underline"
              data-testid="connect-via-channex"
            >
              {tb("otherChannels")}
            </Link>
            <LinkButton href="/channels/new" variant="primary" data-testid="connect-channel">
              {tb("connectChannel")}
            </LinkButton>
          </>
        }
      />

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label={tb("connected")}
          value={String(connectedNames.length)}
          hint={connectedNames.length ? connectedNames.join(", ") : tb("connectedNone")}
        />
        <Stat
          label={tb("rooms")}
          value={needed ? tb("roomsOf", { a: needed - unassigned.length, b: needed }) : "—"}
          hint={
            unassigned.length
              ? tb("roomsMissing", { n: unassigned.length })
              : needed
                ? tb("roomsAll")
                : undefined
          }
        />
        <Stat
          label={tb("pending")}
          value={String(o.sync.pendingCells)}
          hint={o.sync.pendingCells ? tb("sending") : tb("queueEmpty")}
        />
        <Stat
          label={tb("lastVerify")}
          value={
            o.sync.lastVerifiedAt
              ? tb("ago", { ago: elapsed(o.sync.lastVerifiedAt) })
              : tb("notYet")
          }
          hint={drift ? tb("drift", { n: drift }) : tb("noDrift")}
        />
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" data-testid="health-board">
        {keys.map((key) => {
          const meta =
            key === "other"
              ? { name: "Other", color: "#4b5553" }
              : CHANNELS.find((c) => c.key === key)!;
          const mine = conns.filter((c) => c.ch.key === key);
          const active = mine.some((c) => c.state === "active");
          const trouble = mine.some((c) => c.state === "error" || c.openP1 > 0 || !c.ready);
          const rooms = roomsFor(key);
          const missing = rooms.filter((r) => r.otaRoomCodes.length === 0);
          const props = new Set(key === "direct" ? directProps : mine.map((c) => c.propertyId))
            .size;
          const status =
            key === "direct"
              ? directProps.size
                ? { label: tb("statusLive"), tone: "success" as const }
                : { label: tb("statusOff"), tone: "default" as const }
              : mine.length === 0
                ? { label: tb("statusNone"), tone: "default" as const }
                : trouble
                  ? { label: tb("statusAttention"), tone: "warning" as const }
                  : active
                    ? { label: tb("statusConnected"), tone: "success" as const }
                    : { label: mine[0]!.state, tone: "default" as const };
          const blurb =
            missing.length > 0
              ? tb("notAssigned", {
                  rooms: missing.map((r) => `${r.propertyTitle} · ${r.roomTitle}`).join(", "),
                })
              : tb(`blurb.${key}`);
          return (
            <Card key={key} className={cn("gap-2", trouble && "border-warning/60")}>
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-2 text-base font-bold">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ background: meta.color }}
                    aria-hidden="true"
                  />
                  {meta.name}
                </span>
                <Chip size="sm" color={status.tone}>
                  {status.label}
                </Chip>
              </div>
              {props > 0 ? (
                <p className="text-sm font-medium">
                  {key === "direct"
                    ? tb("props", { p: props })
                    : tb("propsRooms", { p: props, r: rooms.length })}
                </p>
              ) : null}
              <p className="text-sm text-muted">{blurb}</p>
              {mine.length > 0 ? (
                <ul className="flex flex-col gap-1 text-xs">
                  {mine.map((c) => (
                    <li
                      key={c.id}
                      data-state={c.state}
                      className="flex items-center justify-between gap-2"
                    >
                      <Link href={`/channels/${c.id}`} className="truncate hover:underline">
                        {c.propertyTitle}
                      </Link>
                      <span className="shrink-0 text-muted">
                        {c.lastPushAt ? tb("ago", { ago: elapsed(c.lastPushAt) }) : c.state}
                      </span>
                      {c.expectedRemovalDate ? (
                        <span className="text-danger" data-testid="removal-scheduled">
                          {t("removalScheduled", { date: c.expectedRemovalDate })}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="mt-1">
                {key === "direct" ? (
                  <LinkButton href="/booking-engine" size="sm">
                    {directProps.size ? tb("bookingSite") : tb("turnOn")}
                  </LinkButton>
                ) : mine.length > 0 ? (
                  <LinkButton
                    href={
                      missing[0]?.connectionId
                        ? `/channels/${missing[0].connectionId}`
                        : `/channels/${mine[0]!.id}`
                    }
                    size="sm"
                  >
                    {missing.length ? tb("assignRooms") : tb("manage")}
                  </LinkButton>
                ) : key === "airbnb" ? (
                  <AnchorButton
                    href="/api/v1/channels/oauth/airbnb/start"
                    size="sm"
                    variant="primary"
                    data-testid="connect-airbnb"
                  >
                    {tb("connect")}
                  </AnchorButton>
                ) : (
                  <LinkButton
                    href={key === "booking" ? "/channels/new" : "/channels/connect"}
                    size="sm"
                  >
                    {tb("connect")}
                  </LinkButton>
                )}
              </div>
            </Card>
          );
        })}
        <div className="flex flex-wrap items-center justify-center gap-2 rounded-card border border-dashed border-[#d5d9d7] p-5 text-sm text-muted md:col-span-2 xl:col-span-1">
          {tb("ical")} ·
          {o.ical.length ? (
            <IcalCopy
              feeds={o.ical.map((f) => ({
                propertyId: f.propertyId,
                title: f.title,
                url: `${appUrl}${f.path}`,
              }))}
              labels={{ copy: tb("icalCopy"), copied: tb("copied"), pick: tb("icalPick") }}
            />
          ) : (
            <span>—</span>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-bold">{tb("tableTitle")}</h2>
          <Link href="/sync-health" className="text-sm font-semibold text-accent hover:underline">
            {tb("syncHealth")}
          </Link>
        </div>
        <RoomsTable rooms={o.rooms} />
      </section>

      {board.events.length > 0 ? (
        <Card title={t("events")}>
          <ul className="flex flex-col text-sm">
            {board.events.map((e) => (
              <li
                key={e.id}
                className="flex items-start justify-between gap-2 border-b border-default py-2 last:border-b-0"
              >
                <span>
                  <Chip
                    size="sm"
                    color={
                      e.severity === "p1" ? "danger" : e.severity === "p2" ? "warning" : "default"
                    }
                    className="me-2"
                  >
                    {e.severity === "p1" ? tb("attention") : e.severity.toUpperCase()}
                  </Chip>
                  {e.message}
                </span>
                <form action={acknowledgeEventAction}>
                  <input type="hidden" name="eventId" value={e.id} />
                  <button className="text-xs font-semibold text-accent hover:underline">
                    {t("ack")}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      {board.accounts.length > 0 ? (
        <Card title={t("accounts")}>
          <ul className="flex flex-col text-sm" data-testid="accounts">
            {board.accounts.map((a) => (
              <li key={a.id} className="border-b border-default py-2 last:border-b-0">
                <span className="font-medium">{a.label}</span>{" "}
                <span className="text-xs text-muted">
                  · {channelOf(a.adapterCode).name} · {a.state}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
