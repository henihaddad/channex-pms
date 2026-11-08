import { getLocale, getTranslations } from "next-intl/server";
import type { DifferingNight } from "@pms/db";
import { Button, Card, Chip, PageHeader, Stat } from "@/components/ui";
import { guard } from "@/server/guard";
import { day, elapsed, money } from "@/lib/format";
import { loadSyncHealth, loadSyncOverview, verifyNowAction } from "./sync-health.actions";

/** The nightly check compares this many nights from today (RECONCILE_HORIZON_DAYS in the worker). */
const CHECKED_NIGHTS = 365;
const STATES = ["pending", "in_flight", "synced", "failed", "conflicted"] as const;

interface Range extends DifferingNight {
  to: string;
}

const nextDay = (iso: string): string => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

/** Consecutive nights with the same room, plan, values and outcome read as one row. */
function ranges(rows: DifferingNight[]): Range[] {
  const out: Range[] = [];
  for (const r of rows) {
    const last = out.at(-1);
    if (
      last &&
      last.propertyTitle === r.propertyTitle &&
      last.roomTitle === r.roomTitle &&
      last.planTitle === r.planTitle &&
      last.kind === r.kind &&
      last.state === r.state &&
      last.local === r.local &&
      last.channel === r.channel &&
      nextDay(last.to) === r.date
    ) {
      last.to = r.date;
    } else out.push({ ...r, to: r.date });
  }
  return out;
}

/**
 * Sync health (design canvas board): is every channel showing what the calendar says, what went
 * out and came in during the last day, and which nights still differ. Counters per property and
 * the connection's environment sit under "Technical details".
 */
export default async function SyncHealthPage() {
  const t = await getTranslations("syncHealth");
  const locale = await getLocale();
  const [o, perProperty] = await Promise.all([
    guard(() => loadSyncOverview()),
    guard(() => loadSyncHealth()),
  ]);
  const s = o.summary;
  const drift = s.conflictedCells + s.failedCells;
  const healthy = drift === 0 && s.unackedBookings === 0;
  const rows = ranges(o.differing);
  const peak = Math.max(1, ...s.perHour);

  const value = (r: DifferingNight, raw: string): string => {
    if (!raw) return "—";
    if (r.kind === "availability") {
      const n = Number(raw);
      return n <= 0 ? t("closed") : t("left", { n });
    }
    let v: Record<string, unknown> = {};
    try {
      v = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return raw;
    }
    if (v.stopSell === true) return t("closed");
    if (typeof v.rate === "number")
      return `${t("rate")} ${money(v.rate, r.currency ?? "EUR", locale)}`;
    return t("open");
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t("title")} />

      <section
        className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5"
        data-testid="sync-tiles"
      >
        <Stat
          label={t("status")}
          value={
            <span className={healthy ? "text-success" : "text-warning"}>
              {healthy ? t("healthy") : t("attention")}
            </span>
          }
          hint={t("statusSub", { n: s.liveProperties })}
        />
        <Stat
          label={t("drift")}
          value={<span className={drift ? "text-warning" : undefined}>{drift}</span>}
          hint={
            s.lastVerifiedAt ? t("verified", { ago: elapsed(s.lastVerifiedAt) }) : t("notVerified")
          }
        />
        <Stat
          label={t("sent")}
          value={String(s.changesSent24h)}
          hint={t("failed", { n: s.failedCells })}
        />
        <Stat
          label={t("received")}
          value={String(s.bookingsReceived24h)}
          hint={s.unackedBookings ? t("unacked", { n: s.unackedBookings }) : t("noneLost")}
        />
        <Stat label={t("kept")} value={String(CHECKED_NIGHTS)} hint={t("rolling")} />
      </section>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-5">
          <Card
            title={t("differTitle")}
            actions={
              o.verifyRequested ? (
                <Chip size="sm" color="info" data-testid="verify-queued">
                  {t("verifyQueued")}
                </Chip>
              ) : (
                <form action={verifyNowAction}>
                  <Button type="submit" size="sm" variant="secondary" data-testid="verify-now">
                    {t("verifyNow")}
                  </Button>
                </form>
              )
            }
          >
            <p className="text-sm text-muted">{t("differBody")}</p>
            {rows.length === 0 ? (
              <p className="mt-3 text-sm font-medium text-success" data-testid="nothing-differs">
                {t("nothingDiffers")}
              </p>
            ) : (
              <div className="mt-3 overflow-x-auto rounded-card border border-default">
                <table className="w-full text-sm" data-testid="differing">
                  <thead className="bg-surface-secondary text-left text-xs text-muted">
                    <tr>
                      <th className="px-3 py-2 font-medium">{t("roomPlan")}</th>
                      <th className="px-3 py-2 font-medium">{t("nights")}</th>
                      <th className="px-3 py-2 font-medium">{t("local")}</th>
                      <th className="px-3 py-2 font-medium">{t("channel")}</th>
                      <th className="px-3 py-2 font-medium">{t("action")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr
                        key={`${r.propertyTitle}|${r.roomTitle}|${r.planTitle ?? ""}|${r.kind}|${r.date}`}
                        className="border-t border-default align-top"
                      >
                        <td className="px-3 py-2">
                          {[r.propertyTitle, r.roomTitle, r.planTitle ?? t("availability")].join(
                            " · ",
                          )}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {r.to === r.date
                            ? day(r.date, locale)
                            : `${day(r.date, locale)} → ${day(r.to, locale)}`}
                        </td>
                        <td className="px-3 py-2">{value(r, r.local)}</td>
                        <td className="px-3 py-2">{value(r, r.channel)}</td>
                        <td className="px-3 py-2">
                          {r.state === "conflicted" ? (
                            <Chip size="sm" color="info">
                              {t("repushed")}
                            </Chip>
                          ) : (
                            <Chip size="sm" color="warning" title={r.lastError ?? undefined}>
                              {t("failedPill", { why: (r.lastError ?? "?").slice(0, 40) })}
                            </Chip>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <details
            className="rounded-card border border-default bg-surface p-4"
            data-testid="sync-technical"
          >
            <summary className="cursor-pointer text-sm font-semibold">{t("tech")}</summary>
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs text-muted">{t("connection")}</dt>
                <dd>
                  {o.channexEnv === "production" ? t("production") : t("staging")}
                  {o.channexEnv === "staging" ? (
                    <span className="block text-xs text-muted">{t("switchHint")}</span>
                  ) : null}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">{t("lastPush")}</dt>
                <dd>{s.lastPushAt ? t("ago", { ago: elapsed(s.lastPushAt) }) : t("never")}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">{t("incoming")}</dt>
                <dd>{t("lastReceived", { n: s.bookingsReceived24h })}</dd>
              </div>
            </dl>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-left text-muted">
                  <tr>
                    <th className="py-1 pe-3 font-medium" />
                    {STATES.map((st) => (
                      <th key={st} className="py-1 pe-3 font-medium">
                        {st.replace("_", " ")}
                      </th>
                    ))}
                    <th className="py-1 font-medium">unacked</th>
                  </tr>
                </thead>
                <tbody>
                  {perProperty.map((p) => (
                    <tr key={p.propertyId} className="border-t border-default">
                      <td className="py-1 pe-3 font-medium">{p.title}</td>
                      {STATES.map((st) => (
                        <td
                          key={st}
                          className={`py-1 pe-3 font-mono ${(st === "failed" || st === "conflicted") && p.cells[st] ? "text-danger" : ""}`}
                        >
                          {p.cells[st] ?? 0}
                        </td>
                      ))}
                      <td className={`py-1 font-mono ${p.unackedBookings ? "text-danger" : ""}`}>
                        {p.unackedBookings}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </div>

        <div className="flex flex-col gap-5">
          <Card title={t("perHour")}>
            <div
              className="flex h-24 items-end gap-[3px]"
              data-testid="per-hour"
              aria-label={t("perHour")}
              role="img"
            >
              {s.perHour.map((n, i) => (
                <span
                  key={i}
                  className={
                    i === s.perHour.length - 1
                      ? "flex-1 rounded-t-sm bg-accent"
                      : "flex-1 rounded-t-sm bg-accent/35"
                  }
                  style={{ height: `${Math.max(4, Math.round((n / peak) * 100))}%` }}
                  title={String(n)}
                />
              ))}
            </div>
            <div className="mt-1 flex justify-between text-xs text-muted">
              <span>−24 h</span>
              <span>−12 h</span>
              <span>{t("now")}</span>
            </div>
          </Card>
          <Card title={t("whatTitle")}>
            <ol className="list-decimal space-y-1 ps-5 text-sm text-muted">
              <li>{t("what1")}</li>
              <li>{t("what2")}</li>
              <li>{t("what3")}</li>
            </ol>
          </Card>
        </div>
      </div>
    </div>
  );
}
