import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button, Card, PageTitle, Select } from "@/components/ui";
import { guard } from "@/server/guard";
import {
  assignTaskAction,
  loadBoard,
  suggestRouteAction,
  taskStateAction,
} from "./operations.actions";
import { currentSession } from "@/server/session";

const shift = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** The turnover board (spec 08 §8.6): departures, turnovers ordered by deadline pressure with same-day countdowns pinned, arrivals. */
export default async function OperationsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { date: qd } = await searchParams;
  const date = qd ?? new Date().toISOString().slice(0, 10);
  const t = await getTranslations("operations");
  const [board, session] = await Promise.all([guard(() => loadBoard(date)), currentSession()]);
  const members = board.crews.flatMap((c) =>
    c.members.map((m) => ({ ...m, crewId: c.id, crewName: c.name })),
  );
  const nowMin = new Date().getUTCHours() * 60 + new Date().getUTCMinutes();
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PageTitle>{t("title")}</PageTitle>
        <div className="flex items-center gap-2 text-sm">
          <Link href={`/operations?date=${shift(date, -1)}`} className="underline">
            ‹
          </Link>
          <span className="font-mono" data-testid="board-date">
            {date}
          </span>
          <Link href={`/operations?date=${shift(date, 1)}`} className="underline">
            ›
          </Link>
          <Link href="/operations/blocks" className="underline">
            {t("blocks")}
          </Link>
          <Link href="/operations/crews" className="underline">
            {t("crews")}
          </Link>
          <Link href="/maintenance" className="underline">
            {t("maintenance")}
          </Link>
          <Link href="/cleaner" className="underline">
            {t("cleanerApp")}
          </Link>
          <form action={suggestRouteAction}>
            <input type="hidden" name="date" value={date} />
            <Button type="submit" variant="secondary" size="sm">
              {t("suggestRouting")}
            </Button>
          </form>
        </div>
      </div>
      {board.escalations.length > 0 ? (
        <div
          className="rounded-md border border-danger/40 bg-danger-soft p-3 text-sm text-danger"
          data-testid="escalations"
        >
          {board.escalations.map((e) => (
            <p key={e.taskId}>
              ⚠{" "}
              {t("escalation", {
                level: e.level.replace("_", " "),
                minutes: Math.max(0, e.minutesLeft),
              })}
            </p>
          ))}
        </div>
      ) : null}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <h2 className="mb-2 font-semibold">
            {t("departures")} <span className="text-xs text-muted">{board.departures.length}</span>
          </h2>
          <ul className="text-sm">
            {board.departures.map((d) => (
              <li key={d.bookingId} className="border-t border-border py-1">
                <Link href={`/reservations/${d.bookingId}`} className="hover:underline">
                  {d.propertyTitle}
                </Link>{" "}
                <span className="text-xs text-muted">
                  {d.unitName ?? ""} · {d.guest} · out {d.checkOutTime}
                </span>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <h2 className="mb-2 font-semibold">
            {t("turnovers")} <span className="text-xs text-muted">{board.tasks.length}</span>
          </h2>
          <ul className="space-y-2 text-sm" data-testid="turnover-lane">
            {board.tasks.map((x) => {
              const [h, m] = x.windowTo.split(":").map(Number);
              const left = (h ?? 0) * 60 + (m ?? 0) - nowMin;
              return (
                <li
                  key={x.id}
                  className={`rounded-md border p-2 ${x.isSameDay ? "border-warning/50 bg-warning-soft" : "border-border"}`}
                  data-task={x.id}
                  data-state={x.state}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">
                      {x.propertyTitle} · {x.unitName}
                    </span>
                    <span className="rounded bg-background px-1.5 text-xs">{x.state}</span>
                  </div>
                  <p className="text-xs text-muted">
                    {x.type}
                    {x.isSameDay
                      ? ` · ${t("sameDay")} · ${date === new Date().toISOString().slice(0, 10) ? (left > 0 ? t("countdown", { minutes: left }) : t("overdue")) : ""}`
                      : ""}{" "}
                    · {x.windowFrom}–{x.windowTo}
                    {x.sequence ? ` · #${x.sequence}` : ""}
                    {x.escalatedLevel ? ` · ⚠ ${x.escalatedLevel}` : ""}
                  </p>
                  {x.lastChange ? <p className="text-xs text-accent">↻ {x.lastChange}</p> : null}
                  <form action={assignTaskAction} className="mt-1 flex items-center gap-1">
                    <input type="hidden" name="taskId" value={x.id} />
                    <Select
                      name="assigneeId"
                      defaultValue={x.assigneeId ?? ""}
                      data-testid="assignee"
                      size="sm"
                    >
                      <option value="">{t("unassigned")}</option>
                      {session ? <option value={session.userId}>{t("me")}</option> : null}
                      {members.map((mm) => (
                        <option key={mm.userId} value={mm.userId}>
                          {mm.name} ({mm.crewName})
                        </option>
                      ))}
                    </Select>
                    <Button type="submit" variant="secondary" size="sm">
                      {t("assign")}
                    </Button>
                    {x.state === "done" ? (
                      <button
                        formAction={taskStateAction}
                        name="state"
                        value="inspected"
                        className="text-xs underline"
                      >
                        {t("inspect")}
                      </button>
                    ) : null}
                  </form>
                </li>
              );
            })}
          </ul>
        </Card>
        <Card>
          <h2 className="mb-2 font-semibold">
            {t("arrivals")} <span className="text-xs text-muted">{board.arrivals.length}</span>
          </h2>
          <ul className="text-sm">
            {board.arrivals.map((a) => (
              <li key={a.bookingId} className="border-t border-border py-1">
                <Link href={`/reservations/${a.bookingId}`} className="hover:underline">
                  {a.propertyTitle}
                </Link>{" "}
                <span className="text-xs text-muted">
                  {a.unitName ?? ""} · {a.guest} · in {a.checkInTime} ·{" "}
                  {a.credentials > 0 ? "🔑 code issued" : "no code"} · unit {a.unitStatus ?? "?"}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
