import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import type { TaskRow } from "@pms/db";
import {
  Button,
  Card,
  Chip,
  EmptyState,
  LinkButton,
  PageHeader,
  Select,
  Stat,
  cn,
} from "@/components/ui";
import { OperationsPreview } from "@/components/previews";
import { guard } from "@/server/guard";
import { currentSession } from "@/server/session";
import { day } from "@/lib/format";
import {
  assignTaskAction,
  loadWeekBoard,
  suggestRouteAction,
  taskStateAction,
} from "./operations.actions";

const shift = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const todayIso = () => new Date().toISOString().slice(0, 10);
const VIEWS = ["board", "list", "cleaner"] as const;
type View = (typeof VIEWS)[number];
type Tone = "warning" | "default" | "info" | "success";

/** Where a task stands, in the words on the design's pills. */
function status(x: TaskRow): { key: string; tone: Tone } {
  if (x.state === "inspected") return { key: "inspected", tone: "success" };
  if (x.state === "done") return { key: "done", tone: "success" };
  if (x.state === "on_site") return { key: "inProgress", tone: "info" };
  if (!x.assigneeId) return { key: "needsCleaner", tone: "warning" };
  return { key: "scheduled", tone: "default" };
}

/**
 * Operations (design canvas board): four days of turnover cards with who does each one, the
 * week's numbers on top, the open issues below. List and By cleaner show the same seven days.
 */
export default async function OperationsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; view?: string }>;
}) {
  const { date: qd, view: qv } = await searchParams;
  const today = todayIso();
  const from = qd ?? today;
  const view: View = VIEWS.includes(qv as View) ? (qv as View) : "board";
  const t = await getTranslations("operations");
  const tb = await getTranslations("operations.board");
  const locale = await getLocale();
  const [w, session] = await Promise.all([guard(() => loadWeekBoard(from)), currentSession()]);

  const days = Array.from({ length: 4 }, (_, i) => shift(from, i));
  const cleans = w.tasks.filter((x) => x.type !== "inspection");
  const unassigned = cleans.filter(
    (x) => !x.assigneeId && x.state !== "done" && x.state !== "inspected",
  );
  const inspections = w.tasks.filter((x) => x.type === "inspection");
  const inspectionsLeft = inspections.filter(
    (x) => x.state !== "inspected" && x.state !== "done",
  ).length;
  const openIssues = w.issues.filter((i) => i.state !== "closed");
  const title = (x: TaskRow) =>
    x.unitName && x.unitName !== x.propertyTitle
      ? `${x.propertyTitle} · ${x.unitName}`
      : x.propertyTitle;
  const what = (x: TaskRow) =>
    `${tb(`type.${x.type}`)} · ${x.windowFrom}${x.isSameDay ? ` → ${x.windowTo}` : ""}${
      x.type === "inspection" && x.arrivalTime ? ` ${tb("arrival", { time: x.arrivalTime })}` : ""
    }`;
  const href = (p: Record<string, string>) => {
    const q = new URLSearchParams({
      ...(qd ? { date: qd } : {}),
      ...(view !== "board" ? { view } : {}),
      ...p,
    });
    if (q.get("view") === "board") q.delete("view");
    const s = q.toString();
    return `/operations${s ? `?${s}` : ""}`;
  };

  const assignForm = (x: TaskRow) => (
    <form action={assignTaskAction} className="mt-2 flex items-center gap-1">
      <input type="hidden" name="taskId" value={x.id} />
      <Select
        name="assigneeId"
        defaultValue={x.assigneeId ?? ""}
        testId="assignee"
        size="sm"
        aria-label={tb("cleaner")}
      >
        <option value="">{t("unassigned")}</option>
        {session ? <option value={session.userId}>{t("me")}</option> : null}
        {w.members.map((m) => (
          <option key={m.userId} value={m.userId}>
            {m.name} ({m.crewName})
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
          className="text-xs font-semibold text-accent hover:underline"
        >
          {t("inspect")}
        </button>
      ) : null}
    </form>
  );

  const card = (x: TaskRow) => {
    const s = status(x);
    const escalation = w.escalations.find((e) => e.taskId === x.id);
    return (
      <div
        key={x.id}
        className={cn(
          "rounded-card border bg-surface p-4",
          escalation ? "border-warning/60" : "border-default",
        )}
        data-task={x.id}
        data-state={x.state}
      >
        <div className="flex items-start justify-between gap-2">
          <span className="font-semibold">{title(x)}</span>
          <Chip size="sm" color={s.tone} className="shrink-0">
            {tb(`state.${s.key}`)}
          </Chip>
        </div>
        <p className="mt-1 text-sm text-muted">{what(x)}</p>
        <p className="mt-1 text-sm">{x.assigneeName ?? t("unassigned")}</p>
        {x.progress.some((p) => p.key.startsWith("restock:") && p.done) ? (
          <p className="mt-1 text-xs text-muted">
            {tb("restock", {
              items: x.progress
                .filter((p) => p.key.startsWith("restock:") && p.done)
                .map((p) => p.key.slice(8))
                .join(", "),
            })}
          </p>
        ) : null}
        {escalation ? (
          <p className="mt-1 text-xs font-medium text-warning">
            {t("countdown", { minutes: Math.max(0, escalation.minutesLeft) })}
          </p>
        ) : null}
        {!x.assigneeId || x.state === "done" ? (
          assignForm(x)
        ) : (
          <details className="mt-1 text-xs text-muted">
            <summary className="cursor-pointer hover:text-foreground">{tb("change")}</summary>
            {assignForm(x)}
          </details>
        )}
      </div>
    );
  };

  const byCleaner = [...new Set(w.tasks.map((x) => x.assigneeName ?? ""))].sort((a, b) =>
    a === "" ? -1 : b === "" ? 1 : a.localeCompare(b),
  );

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={tb("title")} description={tb("lead")} />

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label={tb("week")}
          value={
            <span className={unassigned.length ? "text-warning" : undefined}>{cleans.length}</span>
          }
          hint={
            unassigned.length ? tb("weekUnassigned", { n: unassigned.length }) : tb("allAssigned")
          }
        />
        <Stat
          label={tb("issuesOpen")}
          value={String(openIssues.length)}
          hint={
            openIssues[0]
              ? `${openIssues[0].category} · ${openIssues[0].propertyTitle}`
              : tb("noIssues")
          }
        />
        <Stat
          label={tb("inspections")}
          value={String(inspections.length)}
          hint={
            inspections.length === 0
              ? tb("noneThisWeek")
              : inspectionsLeft
                ? tb("toDo", { n: inspectionsLeft })
                : tb("allPassed")
          }
        />
        <Stat
          label={tb("cleaners")}
          value={String(w.cleaners.length)}
          hint={
            w.cleaners.length
              ? `${w.cleaners
                  .slice(0, 3)
                  .map((n) => n.split(" ")[0])
                  .join(", ")}${w.cleaners.length > 3 ? `, +${w.cleaners.length - 3}` : ""}`
              : tb("noCleaners")
          }
        />
      </section>

      {w.escalations.length > 0 ? (
        <div
          className="rounded-card border border-warning/50 bg-warning-soft p-3 text-sm"
          data-testid="escalations"
        >
          {w.escalations.map((e) => (
            <p key={e.taskId}>
              {t("escalation", {
                level: e.level.replace("_", " "),
                minutes: Math.max(0, e.minutesLeft),
              })}
            </p>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {VIEWS.map((v) => (
            <Link
              key={v}
              href={href({ view: v })}
              className={cn(
                "rounded-full border px-4 py-1.5 text-sm font-medium",
                v === view
                  ? "border-[#141716] bg-[#141716] text-white"
                  : "border-default bg-surface hover:bg-default",
              )}
              aria-current={v === view ? "page" : undefined}
            >
              {tb(`view.${v}`)}
            </Link>
          ))}
          <span className="ms-2 inline-flex items-center rounded-full border border-default bg-surface p-0.5 text-sm">
            <Link
              href={href({ date: shift(from, -7) })}
              className="grid h-7 w-7 place-items-center rounded-full text-muted hover:bg-default"
              aria-label={tb("earlier")}
            >
              ‹
            </Link>
            <Link
              href={href({ date: today })}
              className="px-2 text-xs font-medium"
              data-testid="board-date"
            >
              {from === today ? tb("today") : day(from, locale)}
            </Link>
            <Link
              href={href({ date: shift(from, 7) })}
              className="grid h-7 w-7 place-items-center rounded-full text-muted hover:bg-default"
              aria-label={tb("later")}
            >
              ›
            </Link>
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <LinkButton href="/cleaner" variant="secondary" size="sm">
            {tb("cleanerPreview")}
          </LinkButton>
          <form action={suggestRouteAction}>
            <input type="hidden" name="date" value={from} />
            <Button type="submit" variant="secondary" size="sm">
              {t("suggestRouting")}
            </Button>
          </form>
        </div>
      </div>

      {w.tasks.length === 0 && view === "board" ? (
        <Card>
          <EmptyState
            title={t("emptyTitle")}
            description={t("empty")}
            preview={<OperationsPreview />}
          />
        </Card>
      ) : null}

      {view === "board" && w.tasks.length > 0 ? (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {days.map((d) => {
            const mine = w.tasks.filter((x) => x.date === d);
            return (
              <div key={d} className="flex flex-col gap-3" data-lane={d}>
                <h2 className="text-sm font-medium">
                  {d === today ? `${tb("today")} · ` : ""}
                  {day(d, locale)} · {mine.length}
                </h2>
                {mine.length === 0 ? (
                  <p className="text-sm text-muted">{tb("nothing")}</p>
                ) : (
                  mine.map(card)
                )}
              </div>
            );
          })}
        </section>
      ) : null}

      {view === "list" ? (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="task-list">
              <thead className="text-left text-xs text-muted">
                <tr>
                  <th className="py-2 pe-3 font-medium">{tb("col.day")}</th>
                  <th className="py-2 pe-3 font-medium">{tb("col.task")}</th>
                  <th className="py-2 pe-3 font-medium">{tb("col.what")}</th>
                  <th className="py-2 pe-3 font-medium">{tb("cleaner")}</th>
                  <th className="py-2 font-medium">{tb("col.status")}</th>
                </tr>
              </thead>
              <tbody>
                {w.tasks.map((x) => {
                  const s = status(x);
                  return (
                    <tr
                      key={x.id}
                      className="border-t border-default"
                      data-task={x.id}
                      data-state={x.state}
                    >
                      <td className="py-2 pe-3 whitespace-nowrap">{day(x.date, locale)}</td>
                      <td className="py-2 pe-3 font-medium">{title(x)}</td>
                      <td className="py-2 pe-3 text-muted">{what(x)}</td>
                      <td className="py-2 pe-3">{x.assigneeName ?? t("unassigned")}</td>
                      <td className="py-2">
                        <Chip size="sm" color={s.tone}>
                          {tb(`state.${s.key}`)}
                        </Chip>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {w.tasks.length === 0 ? (
              <p className="py-3 text-sm text-muted">{t("noTurnovers")}</p>
            ) : null}
          </div>
        </Card>
      ) : null}

      {view === "cleaner" ? (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {byCleaner.map((name) => {
            const mine = w.tasks.filter((x) => (x.assigneeName ?? "") === name);
            return (
              <Card key={name || "none"} title={`${name || t("unassigned")} · ${mine.length}`}>
                <ul className="flex flex-col text-sm">
                  {mine.map((x) => {
                    const s = status(x);
                    return (
                      <li
                        key={x.id}
                        className="flex items-center justify-between gap-2 border-b border-default py-2 last:border-b-0"
                        data-task={x.id}
                        data-state={x.state}
                      >
                        <span>
                          <span className="font-medium">{title(x)}</span>
                          <span className="block text-xs text-muted">
                            {day(x.date, locale)} · {what(x)}
                          </span>
                        </span>
                        <Chip size="sm" color={s.tone} className="shrink-0">
                          {tb(`state.${s.key}`)}
                        </Chip>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            );
          })}
          {byCleaner.length === 0 ? <p className="text-sm text-muted">{t("noTurnovers")}</p> : null}
        </section>
      ) : null}

      <Card
        title={tb("issuesTitle")}
        actions={
          <LinkButton href="/maintenance" size="sm" variant="secondary">
            {tb("reportIssue")}
          </LinkButton>
        }
      >
        {w.issues.length === 0 ? (
          <p className="text-sm text-muted">{tb("noIssues")}</p>
        ) : (
          <div className="overflow-x-auto rounded-card border border-default">
            <table className="w-full text-sm" data-testid="issues">
              <thead className="bg-surface-secondary text-left text-xs text-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">{tb("col.issue")}</th>
                  <th className="px-3 py-2 font-medium">{tb("col.property")}</th>
                  <th className="px-3 py-2 font-medium">{tb("col.reported")}</th>
                  <th className="px-3 py-2 font-medium">{tb("col.assigned")}</th>
                  <th className="px-3 py-2 font-medium">{tb("col.status")}</th>
                </tr>
              </thead>
              <tbody>
                {w.issues.map((i) => (
                  <tr key={i.id} className="border-t border-default align-top">
                    <td className="px-3 py-2">
                      <Link href="/maintenance" className="font-medium hover:underline">
                        {i.description}
                      </Link>
                      <span className="block text-xs text-muted">
                        {tb(
                          `via.${i.reportedVia === "guest" || i.reportedVia === "cleaner" || i.reportedVia === "owner" ? i.reportedVia : "staff"}`,
                        )}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {i.unitName && i.unitName !== i.propertyTitle
                        ? `${i.propertyTitle} · ${i.unitName}`
                        : i.propertyTitle}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {day(i.createdAt.slice(0, 10), locale)}
                    </td>
                    <td className="px-3 py-2">{i.assigneeName ?? t("unassigned")}</td>
                    <td className="px-3 py-2">
                      <Chip
                        size="sm"
                        color={
                          i.state === "closed" ? "success" : i.state === "open" ? "warning" : "info"
                        }
                      >
                        {tb(
                          `issue.${i.state === "assigned" || i.state === "in_progress" || i.state === "closed" ? i.state : "open"}`,
                        )}
                      </Chip>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
