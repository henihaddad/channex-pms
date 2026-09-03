import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button, Card, PageTitle } from "@/components/ui";
import { guard } from "@/server/guard";
import {
  acknowledgeEventAction,
  loadHealthBoard,
  pauseAction,
  removeAction,
  resumeAction,
} from "./channels.actions";
import { AirbnbImport } from "./airbnb-import";

const tone: Record<string, string> = {
  active: "bg-mint-soft text-mint-deep",
  paused: "bg-canvas text-text",
  error: "bg-rose-soft text-rose",
  mapped: "bg-sky-soft text-sky-deep",
  testing: "bg-sky-soft text-sky-deep",
  draft: "bg-canvas text-muted",
};

export default async function ChannelsPage() {
  const t = await getTranslations("channels");
  const board = await guard(() => loadHealthBoard());
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageTitle>{t("title")}</PageTitle>
        <div className="flex gap-2">
          <a href="/api/v1/channels/oauth/airbnb/start">
            <Button variant="secondary" data-testid="connect-airbnb">
              {t("connectAirbnb")}
            </Button>
          </a>
          <Link href="/channels/new">
            <Button data-testid="connect-channel">{t("connect")}</Button>
          </Link>
        </div>
      </div>
      <Card>
        <h2 className="mb-2 font-semibold">{t("health")}</h2>
        {board.connections.length === 0 ? <p className="text-sm text-muted">{t("empty")}</p> : null}
        <div className="grid gap-3 md:grid-cols-2" data-testid="health-board">
          {board.connections.map((c) => (
            <div
              key={c.id}
              className={`rounded-lg border p-3 text-sm ${c.state === "error" || c.openP1 > 0 ? "border-rose/40" : !c.ready ? "border-amber/50" : "border-line"}`}
              data-state={c.state}
            >
              <div className="flex items-center justify-between">
                <Link href={`/channels/${c.id}`} className="font-semibold hover:underline">
                  {c.propertyTitle} · {c.adapterCode}
                </Link>
                <span className={`rounded px-2 py-0.5 text-xs ${tone[c.state] ?? ""}`}>
                  {c.state}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted">
                {c.ready ? "Ready" : `Not ready: ${c.readiness.issues.join("; ") || "unknown"}`}
                {c.lastError ? ` · ${c.lastError}` : ""}
              </p>
              <p className="text-xs text-muted">
                Pending {c.pendingCells} · failed {c.failedCells} · last push{" "}
                {c.lastPushAt ?? "never"} · bookings 7d/30d {c.bookings7d}/{c.bookings30d} ·
                unmapped {c.unmappedBookings} · open P1/P2 {c.openP1}/{c.openP2}
              </p>
              <div className="mt-2 flex gap-2">
                {c.state === "active" ? (
                  <form action={pauseAction}>
                    <input type="hidden" name="connectionId" value={c.id} />
                    <Button type="submit" variant="secondary" className="h-7 px-2 text-xs">
                      {t("pause")}
                    </Button>
                  </form>
                ) : null}
                {c.state === "paused" ? (
                  <form action={resumeAction}>
                    <input type="hidden" name="connectionId" value={c.id} />
                    <Button type="submit" variant="secondary" className="h-7 px-2 text-xs">
                      {t("resume")}
                    </Button>
                  </form>
                ) : null}
                <form action={removeAction}>
                  <input type="hidden" name="connectionId" value={c.id} />
                  <Button type="submit" variant="danger" className="h-7 px-2 text-xs">
                    {t("remove")}
                  </Button>
                </form>
              </div>
            </div>
          ))}
        </div>
      </Card>
      <Card>
        <h2 className="mb-2 font-semibold">{t("events")}</h2>
        {board.events.length === 0 ? <p className="text-sm text-muted">—</p> : null}
        <ul className="space-y-1 text-sm">
          {board.events.map((e) => (
            <li
              key={e.id}
              className="flex items-start justify-between gap-2 border-t border-line py-1"
            >
              <span>
                <span
                  className={`me-2 rounded px-1.5 text-[10px] uppercase ${e.severity === "p1" ? "bg-rose-soft text-rose" : e.severity === "p2" ? "bg-amber-soft text-amber-deep" : "bg-canvas"}`}
                >
                  {e.severity}
                </span>
                {e.message}
              </span>
              <form action={acknowledgeEventAction}>
                <input type="hidden" name="eventId" value={e.id} />
                <button className="text-xs underline">{t("ack")}</button>
              </form>
            </li>
          ))}
        </ul>
      </Card>
      <Card>
        <h2 className="mb-2 font-semibold">{t("accounts")}</h2>
        {board.accounts.length === 0 ? <p className="text-sm text-muted">—</p> : null}
        <ul className="space-y-2 text-sm" data-testid="accounts">
          {board.accounts.map((a) => (
            <li key={a.id} className="border-t border-line py-2">
              <span className="font-medium">{a.label}</span>{" "}
              <span className="text-xs text-muted">
                · {a.adapterCode} · {a.state} · token{" "}
                {a.oauthExpiresAt ? `expires ${a.oauthExpiresAt.slice(0, 10)}` : "n/a"}
              </span>
              {a.adapterCode === "AirBNB" ? (
                <AirbnbImport accountId={a.id} label={t("importListings")} />
              ) : null}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
