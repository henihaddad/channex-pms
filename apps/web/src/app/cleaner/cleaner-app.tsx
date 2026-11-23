"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useLocale, useTranslations } from "next-intl";
import { announce, Button, Label, TextareaField, cn } from "@/components/ui";
import { day } from "@/lib/format";

type Progress = { key: string; done: boolean; photoRef?: string };
interface Task {
  id: string;
  propertyTitle: string;
  unitName: string;
  date: string;
  type: string;
  windowFrom: string;
  windowTo: string;
  isSameDay: boolean;
  state: string;
  address: Record<string, string>;
  arrivalTime: string | null;
  notes: string | null;
  progress: Progress[];
  photos: Array<{ ref: string; takenAt: string }>;
  checklist: Array<{ key: string; label: string; requiresPhoto: boolean }>;
}
interface Queued {
  id: string;
  taskId: string;
  body: { state: string; progress?: Progress[]; photos?: Task["photos"] };
  at: string;
}

const KEY_DAY = "pms.cleaner.day";
const KEY_QUEUE = "pms.cleaner.queue";
const load = <T,>(k: string, fallback: T): T => {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
};
const subscribeOnline = (cb: () => void) => {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
};
/** Server tasks with the not-yet-synced local updates applied on top (OPS-6). */
const withPending = (serverTasks: Task[]): Task[] => {
  const q = load<Queued[]>(KEY_QUEUE, []);
  return serverTasks.map((t) =>
    q
      .filter((i) => i.taskId === t.id)
      .reduce<Task>(
        (acc, i) => ({
          ...acc,
          state: i.body.state,
          progress: i.body.progress ?? acc.progress,
          photos: i.body.photos ?? acc.photos,
        }),
        t,
      ),
  );
};
const nowIso = () => new Date().toISOString();
/**
 * Supplies a cleaner can flag with one tap; anything else goes through "Something else". A flag is
 * stored as the words the cleaner saw (`restock:Toilet paper`), as a typed one is, so the office
 * reads it back as written.
 */
const RESTOCK = ["toiletPaper", "dishwasherTabs", "coffeePods", "soap", "binBags"] as const;
/** A finger needs 44px: every control on this screen is at least that tall. */
const TAP = "min-h-11";
const FOCUS = "focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none";
const nowMs = () => Date.now();
const save = (k: string, v: unknown) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* storage unavailable */
  }
};

/**
 * OPS-6: the day is cached; state updates and photos queue locally and sync on
 * reconnect with a visible pending state. Nothing here needs a signal to work.
 * Persona: the cleaner (spec 02), on a phone in a stairwell, in their own language.
 */
export function CleanerApp({ today }: { today: string }) {
  const t = useTranslations("cleaner");
  const locale = useLocale();
  const [date, setDate] = useState(today);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [queue, setQueue] = useState<Queued[]>(() =>
    typeof window === "undefined" ? [] : load<Queued[]>(KEY_QUEUE, []),
  );
  const online = useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
  const [status, setStatus] = useState("");
  const [issueFor, setIssueFor] = useState<string | null>(null);

  // the day on screen: an answer for a day the cleaner has already moved away from is dropped,
  // so a slow reply for today can never overwrite tomorrow's tasks
  // a day picked before the page became interactive (a slow phone) is in the field, not in state
  const dayInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const typed = dayInput.current?.value;
    if (typed && typed !== today) setDate(typed);
  }, [today]);
  const shownDate = useRef(date);
  useEffect(() => {
    shownDate.current = date;
  }, [date]);
  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/cleaner/day?date=${date}`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as { tasks: Task[] };
      if (shownDate.current !== date) return;
      // OPS-6: local updates stay authoritative until they are synced, whatever the server says meanwhile
      setTasks(withPending(body.tasks));
      save(KEY_DAY, { date, tasks: body.tasks });
      setStatus("");
    } catch {
      const cached = load<{ date: string; tasks: Task[] } | null>(KEY_DAY, null);
      if (cached?.date === date) {
        setTasks(cached.tasks);
        setStatus(t("cachedDay"));
      }
    }
  }, [date, t]);

  /** Send what is queued; returns how many were delivered. Items queued meanwhile are kept. */
  const flushOnce = useCallback(async (): Promise<number> => {
    const q = load<Queued[]>(KEY_QUEUE, []);
    if (q.length === 0 || !navigator.onLine) return 0;
    const sent = new Set<string>();
    for (const item of q) {
      try {
        const res = await fetch(`/api/v1/cleaner/tasks/${item.taskId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(item.body),
        });
        if (res.status >= 500 || res.status === 0) throw new Error("retry");
        if (!res.ok) {
          const p = (await res.json()) as { detail?: string };
          setStatus(t("rejected", { detail: p.detail ?? "" }));
        }
        sent.add(item.id);
      } catch {
        /* stays queued */
      }
    }
    const remaining = load<Queued[]>(KEY_QUEUE, []).filter((i) => !sent.has(i.id));
    save(KEY_QUEUE, remaining);
    setQueue(remaining);
    if (remaining.length === 0) await refresh();
    return sent.size;
  }, [refresh, t]);
  const flushing = useRef<Promise<void> | null>(null);
  const flush = useCallback(async () => {
    // one flush at a time: a second one would resend what the first still has in flight
    while (flushing.current) await flushing.current;
    const run = (async () => {
      // keep going while deliveries succeed and new updates arrived during the previous pass
      for (let pass = 0; pass < 10; pass++) if ((await flushOnce()) === 0) break;
    })();
    flushing.current = run;
    try {
      await run;
    } finally {
      if (flushing.current === run) flushing.current = null;
    }
  }, [flushOnce]);

  // fetch-on-mount and sync-on-reconnect set state after awaits; the compiler heuristic cannot tell
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    if (online) void flush();
  }, [online, flush]);
  /* eslint-enable react-hooks/set-state-in-effect */
  // say what changed without moving focus: the connection, and the queue filling or emptying (WCAG 4.1.3)
  const seenOnline = useRef(online);
  useEffect(() => {
    if (seenOnline.current === online) return;
    seenOnline.current = online;
    announce(online ? t("backOnline") : t("wentOffline"));
  }, [online, t]);
  const seenQueue = useRef(queue.length);
  useEffect(() => {
    const before = seenQueue.current;
    seenQueue.current = queue.length;
    if (queue.length === before) return;
    if (queue.length === 0) announce(t("synced"));
    else if (!online) announce(t("waiting", { n: queue.length }));
  }, [queue.length, online, t]);
  useEffect(() => {
    if ("serviceWorker" in navigator)
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);

  const send = async (taskId: string, body: Queued["body"]) => {
    // optimistic local state, then either deliver now or queue for reconnect
    setTasks((ts) =>
      ts.map((x) =>
        x.id === taskId
          ? {
              ...x,
              state: body.state,
              progress: body.progress ?? x.progress,
              photos: body.photos ?? x.photos,
            }
          : x,
      ),
    );
    const item: Queued = {
      id: `${taskId}:${body.state}:${String(nowMs())}`,
      taskId,
      body,
      at: nowIso(),
    };
    const q = [...load<Queued[]>(KEY_QUEUE, []), item];
    save(KEY_QUEUE, q);
    setQueue(q);
    save(KEY_DAY, {
      date,
      tasks: tasks.map((x) => (x.id === taskId ? { ...x, state: body.state } : x)),
    });
    if (navigator.onLine) await flush();
  };
  const toggle = (task: Task, key: string, photoRef?: string) => {
    const cur = task.progress.find((p) => p.key === key);
    const next = [
      ...task.progress.filter((p) => p.key !== key),
      {
        key,
        done: photoRef ? true : !cur?.done,
        ...(photoRef ? { photoRef } : cur?.photoRef ? { photoRef: cur.photoRef } : {}),
      },
    ];
    setTasks((ts) => ts.map((x) => (x.id === task.id ? { ...x, progress: next } : x)));
  };
  const attachPhoto = (task: Task, key: string, file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      toggle(
        task,
        key,
        `data:${file.type};name=${file.name};len=${String(reader.result?.toString().length ?? 0)}`,
      );
      announce(t("photoAdded"));
    };
    reader.readAsDataURL(file);
  };

  const typeLabel = (type: string) => (t.has(`type.${type}`) ? t(`type.${type}`) : type);
  const stateLabel = (state: string) => (t.has(`state.${state}`) ? t(`state.${state}`) : state);
  const restockLabels: string[] = RESTOCK.map((k) => t(`supply.${k}`));
  const restock = (task: Task) =>
    task.progress.filter((p) => p.key.startsWith("restock:") && p.done).map((p) => p.key.slice(8));
  const toggleRestock = (task: Task, item: string) => toggle(task, `restock:${item}`);

  return (
    <main
      className="mx-auto flex min-h-dvh max-w-md flex-col gap-3 bg-background p-3 text-sm"
      data-testid="cleaner-app"
      data-online={online ? "1" : "0"}
      data-queued={queue.length}
    >
      <header className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-bold">{t("title")}</h1>
        <div className="flex items-center gap-2">
          <input
            ref={dayInput}
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={cn(TAP, FOCUS, "rounded-input border border-border-control bg-surface px-2")}
            aria-label={t("day")}
          />
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${online ? "bg-success-soft text-success-soft-foreground" : "bg-warning-soft text-warning-soft-foreground"}`}
            data-testid="online-state"
          >
            {online ? t("online") : t("offline")}
          </span>
        </div>
      </header>
      {queue.length > 0 ? (
        <p
          className="rounded-card bg-warning-soft p-2 text-xs text-warning-soft-foreground"
          data-testid="pending-sync"
        >
          {t("waiting", { n: queue.length })}
          {online ? "…" : ` ${t("waitingOffline")}`}
        </p>
      ) : null}
      {/* always mounted, so a message written into it is announced (WCAG 4.1.3) */}
      <p className={status ? "text-xs text-muted" : "sr-only"} role="status">
        {status}
      </p>
      {tasks.length === 0 ? (
        <p className="rounded-card border border-default bg-surface p-4 text-muted">
          {t("noTasks")}
        </p>
      ) : null}
      {tasks.map((task) => {
        // the server's rule (checklistBlockers): every item ticked, and a photo where one is required
        const complete = (c: Task["checklist"][number]) => {
          const p = task.progress.find((x) => x.key === c.key);
          return Boolean(p?.done && (!c.requiresPhoto || p.photoRef));
        };
        const done = task.checklist.filter(complete).length;
        const left = task.checklist.length - done;
        const needed = restock(task);
        const extra = needed.filter((n) => !restockLabels.includes(n));
        const supplyId = `supply-${task.id}`;
        return (
          <section
            key={task.id}
            className="overflow-hidden rounded-card border border-default bg-surface shadow-sm"
            data-testid="cleaner-task"
            data-state={task.state}
          >
            <div className="border-t-4 border-accent bg-foreground p-4 text-background">
              <div className="flex items-center justify-between text-xs text-background/75">
                <span>
                  {day(task.date, locale)} · {task.windowFrom}–{task.windowTo}
                </span>
                {task.checklist.length ? (
                  <span className="font-medium text-background">
                    {t("progress", { done, total: task.checklist.length })}
                  </span>
                ) : null}
              </div>
              <h2 className="mt-1 text-xl font-bold">
                {task.unitName && task.unitName !== task.propertyTitle
                  ? `${task.propertyTitle} · ${task.unitName}`
                  : task.propertyTitle}
              </h2>
              <p className="mt-1 text-xs text-background/75">
                {typeLabel(task.type)}
                {task.isSameDay && task.type !== "changeover" ? ` · ${t("sameDay")}` : ""}
                {task.arrivalTime ? ` · ${t("nextArrives", { time: task.arrivalTime })}` : ""}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-info-soft px-2 py-0.5 text-xs font-medium text-info-soft-foreground">
                  {stateLabel(task.state)}
                </span>
                {task.address.city ? (
                  <a
                    className={cn(
                      TAP,
                      "inline-flex items-center px-1 text-xs text-background underline underline-offset-2 focus-visible:ring-2 focus-visible:ring-background focus-visible:outline-none",
                    )}
                    href={`https://maps.google.com/?q=${encodeURIComponent(Object.values(task.address).join(" "))}`}
                  >
                    {t("navigate")}
                  </a>
                ) : null}
              </div>
            </div>
            <div className="flex flex-col gap-3 p-3">
              {task.notes ? (
                <div className="rounded-card border border-warning/40 bg-warning-soft p-3 text-xs text-warning-soft-foreground">
                  <p className="font-semibold">{t("note")}</p>
                  <p>{task.notes}</p>
                </div>
              ) : null}
              {task.state === "assigned" ? (
                <Button
                  className="w-full"
                  variant="primary"
                  size="lg"
                  onClick={() => void send(task.id, { state: "accepted" })}
                  data-testid="accept"
                >
                  {t("accept")}
                </Button>
              ) : null}
              {task.state === "accepted" ? (
                <Button
                  className="w-full"
                  variant="primary"
                  size="lg"
                  onClick={() => void send(task.id, { state: "on_site" })}
                  data-testid="on-site"
                >
                  {t("onSite")}
                </Button>
              ) : null}
              {task.state === "on_site" ? (
                <>
                  <ul className="flex flex-col rounded-card border border-default">
                    {task.checklist.map((c) => {
                      const p = task.progress.find((x) => x.key === c.key);
                      return (
                        <li
                          key={c.key}
                          className="flex items-center gap-3 border-b border-default px-3 py-1.5 last:border-b-0"
                        >
                          <Label className={cn(TAP, "flex flex-1 items-center gap-3")}>
                            <input
                              type="checkbox"
                              checked={p?.done ?? false}
                              onChange={() => toggle(task, c.key)}
                              data-testid={`item-${c.key}`}
                              className="h-6 w-6 shrink-0 accent-accent"
                            />
                            <span className={p?.done ? "text-muted line-through" : ""}>
                              {c.label}
                            </span>
                          </Label>
                          {c.requiresPhoto ? (
                            p?.photoRef ? (
                              <span className="text-xs font-medium text-success">
                                {t("photoDone")}
                              </span>
                            ) : (
                              <label
                                className={cn(
                                  TAP,
                                  "inline-flex shrink-0 cursor-pointer items-center rounded-full border border-border-control px-3 text-xs font-medium hover:bg-default focus-within:ring-2 focus-within:ring-accent",
                                )}
                              >
                                {t("addPhoto")}
                                <input
                                  type="file"
                                  accept="image/*"
                                  capture="environment"
                                  className="sr-only"
                                  aria-label={t("photoFor", { item: c.label })}
                                  onChange={(e) => attachPhoto(task, c.key, e.target.files?.[0])}
                                  data-testid={`photo-${c.key}`}
                                />
                              </label>
                            )
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                  <div className="rounded-card border border-default p-3">
                    <p className="font-semibold">{t("restockTitle")}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {[...restockLabels, ...extra].map((item) => {
                        const on = needed.includes(item);
                        return (
                          <button
                            key={item}
                            type="button"
                            aria-pressed={on}
                            onClick={() => toggleRestock(task, item)}
                            className={cn(
                              TAP,
                              FOCUS,
                              "rounded-full px-3 text-xs",
                              on
                                ? "bg-accent text-accent-foreground"
                                : "bg-default text-foreground",
                            )}
                          >
                            {item}
                          </button>
                        );
                      })}
                    </div>
                    <form
                      className="mt-3 flex flex-col gap-1.5"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const input = e.currentTarget.elements.namedItem(
                          "item",
                        ) as HTMLInputElement;
                        const v = input.value.trim();
                        if (v && !needed.includes(v)) {
                          toggleRestock(task, v);
                          announce(t("supplyAdded", { item: v }));
                        }
                        input.value = "";
                      }}
                    >
                      <Label htmlFor={supplyId}>{t("otherSupply")}</Label>
                      <div className="flex gap-2">
                        <input
                          id={supplyId}
                          name="item"
                          autoComplete="off"
                          className={cn(
                            TAP,
                            FOCUS,
                            "min-w-0 flex-1 rounded-input border border-border-control bg-surface px-2 text-sm",
                          )}
                        />
                        <Button type="submit" variant="secondary" size="lg">
                          {t("add")}
                        </Button>
                      </div>
                    </form>
                  </div>
                  <button
                    type="button"
                    className={cn(
                      TAP,
                      FOCUS,
                      "rounded-full text-center text-xs font-semibold text-danger underline-offset-2 hover:underline",
                    )}
                    aria-expanded={issueFor === task.id}
                    onClick={() => setIssueFor(issueFor === task.id ? null : task.id)}
                  >
                    {t("reportProblem")}
                  </button>
                  {issueFor === task.id ? (
                    <IssueForm
                      taskId={task.id}
                      onDone={(ok) => {
                        if (ok) setIssueFor(null);
                        setStatus(ok ? t("issueSent") : t("issueFailed"));
                      }}
                    />
                  ) : null}
                  <Button
                    className="sticky bottom-3 w-full"
                    variant="primary"
                    size="lg"
                    onClick={() =>
                      void send(task.id, {
                        state: "done",
                        progress: task.progress,
                        photos: task.progress
                          .filter((p) => p.photoRef)
                          .map((p) => ({ ref: p.photoRef!, takenAt: nowIso() })),
                      })
                    }
                    data-testid="done"
                    disabled={left > 0}
                  >
                    {left > 0
                      ? t("markCleanLeft", { left, total: task.checklist.length })
                      : t("markClean")}
                  </Button>
                </>
              ) : null}
              {(task.state === "done" || task.state === "inspected") && needed.length ? (
                <p className="text-xs text-muted">
                  {t("restockList", { items: needed.join(", ") })}
                </p>
              ) : null}
            </div>
          </section>
        );
      })}
    </main>
  );
}

function IssueForm({ taskId, onDone }: { taskId: string; onDone: (ok: boolean) => void }) {
  const t = useTranslations("cleaner");
  const [sending, setSending] = useState(false);
  return (
    <form
      className="mt-2 flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const description = String(new FormData(e.currentTarget).get("description") ?? "").trim();
        if (!description) return;
        setSending(true);
        void import("@/app/(console)/operations/operations.actions")
          .then((m) => m.reportIssueFromTaskAction({ taskId, description, severity: "normal" }))
          .then(
            () => onDone(true),
            () => onDone(false),
          )
          .finally(() => setSending(false));
      }}
    >
      <TextareaField
        id={`issue-${taskId}`}
        name="description"
        label={t("issueLabel")}
        description={t("issueHint")}
        rows={3}
        required
      />
      <Button
        type="submit"
        variant="danger"
        size="lg"
        className="w-full"
        disabled={sending}
        aria-busy={sending || undefined}
        data-testid="report-issue"
      >
        {sending ? t("sendingIssue") : t("sendIssue")}
      </Button>
    </form>
  );
}
