"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Button, Label, Textarea } from "@/components/ui";

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
/** Supplies a cleaner can flag with one tap; anything else goes through "+ Add". */
const RESTOCK = ["Toilet paper", "Dishwasher tabs", "Coffee pods", "Soap", "Bin bags"];
const fmtDay = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${iso}T00:00:00Z`));
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
 */
export function CleanerApp({ today }: { today: string }) {
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

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/cleaner/day?date=${date}`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const day = (await res.json()) as { tasks: Task[] };
      // OPS-6: local updates stay authoritative until they are synced, whatever the server says meanwhile
      setTasks(withPending(day.tasks));
      save(KEY_DAY, { date, tasks: day.tasks });
      setStatus("");
    } catch {
      const cached = load<{ date: string; tasks: Task[] } | null>(KEY_DAY, null);
      if (cached?.date === date) {
        setTasks(cached.tasks);
        setStatus("Offline: showing the cached day");
      }
    }
  }, [date]);

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
          setStatus(`Rejected: ${p.detail ?? res.status}`);
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
  }, [refresh]);
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
  useEffect(() => {
    if ("serviceWorker" in navigator)
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);

  const send = async (taskId: string, body: Queued["body"]) => {
    // optimistic local state, then either deliver now or queue for reconnect
    setTasks((ts) =>
      ts.map((t) =>
        t.id === taskId
          ? {
              ...t,
              state: body.state,
              progress: body.progress ?? t.progress,
              photos: body.photos ?? t.photos,
            }
          : t,
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
      tasks: tasks.map((t) => (t.id === taskId ? { ...t, state: body.state } : t)),
    });
    if (navigator.onLine) await flush();
  };
  const toggle = (t: Task, key: string, photoRef?: string) => {
    const cur = t.progress.find((p) => p.key === key);
    const next = [
      ...t.progress.filter((p) => p.key !== key),
      {
        key,
        done: photoRef ? true : !cur?.done,
        ...(photoRef ? { photoRef } : cur?.photoRef ? { photoRef: cur.photoRef } : {}),
      },
    ];
    setTasks((ts) => ts.map((x) => (x.id === t.id ? { ...x, progress: next } : x)));
  };
  const attachPhoto = (t: Task, key: string, file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () =>
      toggle(
        t,
        key,
        `data:${file.type};name=${file.name};len=${String(reader.result?.toString().length ?? 0)}`,
      );
    reader.readAsDataURL(file);
  };

  const typeLabel: Record<string, string> = {
    changeover: "Turnover",
    departure: "Check-out clean",
    mid_stay: "Mid-stay refresh",
    deep: "Deep clean",
    inspection: "Inspection",
    linen: "Linen change",
  };
  const stateLabel: Record<string, string> = {
    assigned: "Assigned to you",
    accepted: "Accepted",
    on_site: "In progress",
    done: "Clean",
    inspected: "Inspected",
  };
  const restock = (t: Task) =>
    t.progress.filter((p) => p.key.startsWith("restock:") && p.done).map((p) => p.key.slice(8));
  const toggleRestock = (t: Task, item: string) => toggle(t, `restock:${item}`);

  return (
    <main
      className="mx-auto flex min-h-dvh max-w-md flex-col gap-3 bg-background p-3 text-sm"
      data-testid="cleaner-app"
      data-online={online ? "1" : "0"}
      data-queued={queue.length}
    >
      <header className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-bold">My day</h1>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-8 rounded-input border border-default bg-surface px-2"
            aria-label="Day"
          />
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${online ? "bg-success-soft text-success-soft-foreground" : "bg-warning-soft text-warning-soft-foreground"}`}
            data-testid="online-state"
          >
            {online ? "online" : "offline"}
          </span>
        </div>
      </header>
      {queue.length > 0 ? (
        <p
          className="rounded-card bg-warning-soft p-2 text-xs text-warning-soft-foreground"
          data-testid="pending-sync"
        >
          {queue.length} update(s) waiting to sync{online ? "…" : " (will send when back online)"}
        </p>
      ) : null}
      {status ? (
        <p className="text-xs text-muted" role="status">
          {status}
        </p>
      ) : null}
      {tasks.length === 0 ? (
        <p className="rounded-card border border-default bg-surface p-4 text-muted">
          No tasks assigned for this day.
        </p>
      ) : null}
      {tasks.map((t) => {
        const done = t.checklist.filter(
          (c) => t.progress.find((p) => p.key === c.key)?.done,
        ).length;
        const left = t.checklist.length - done;
        const needed = restock(t);
        const extra = needed.filter((n) => !RESTOCK.includes(n));
        return (
          <section
            key={t.id}
            className="overflow-hidden rounded-card border border-default bg-surface shadow-sm"
            data-testid="cleaner-task"
            data-state={t.state}
          >
            <div className="border-t-4 border-accent bg-[#141716] p-4 text-white">
              <div className="flex items-center justify-between text-xs text-[#b6c0bd]">
                <span>
                  {fmtDay(t.date)} · {t.windowFrom}–{t.windowTo}
                </span>
                {t.checklist.length ? (
                  <span className="font-medium text-[#5eead4]">
                    {done} of {t.checklist.length} done
                  </span>
                ) : null}
              </div>
              <h2 className="mt-1 text-xl font-bold">
                {t.unitName && t.unitName !== t.propertyTitle
                  ? `${t.propertyTitle} · ${t.unitName}`
                  : t.propertyTitle}
              </h2>
              <p className="mt-1 text-xs text-[#b6c0bd]">
                {typeLabel[t.type] ?? t.type}
                {t.isSameDay ? " · same-day" : ""}
                {t.arrivalTime ? ` · next arrives ${t.arrivalTime}` : ""}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-[#e0f2fe] px-2 py-0.5 text-xs font-medium text-[#075985]">
                  {stateLabel[t.state] ?? t.state}
                </span>
                {t.address.city ? (
                  <a
                    className="text-xs text-white underline underline-offset-2"
                    href={`https://maps.google.com/?q=${encodeURIComponent(Object.values(t.address).join(" "))}`}
                  >
                    Navigate
                  </a>
                ) : null}
              </div>
            </div>
            <div className="flex flex-col gap-3 p-3">
              {t.notes ? (
                <div className="rounded-card border border-[#fde68a] bg-[#fffbeb] p-3 text-xs">
                  <p className="font-semibold">Note</p>
                  <p>{t.notes}</p>
                </div>
              ) : null}
              {t.state === "assigned" ? (
                <Button
                  className="w-full"
                  variant="primary"
                  size="lg"
                  onClick={() => void send(t.id, { state: "accepted" })}
                  data-testid="accept"
                >
                  Accept
                </Button>
              ) : null}
              {t.state === "accepted" ? (
                <Button
                  className="w-full"
                  variant="primary"
                  size="lg"
                  onClick={() => void send(t.id, { state: "on_site" })}
                  data-testid="on-site"
                >
                  I&apos;m on site
                </Button>
              ) : null}
              {t.state === "on_site" ? (
                <>
                  <ul className="flex flex-col rounded-card border border-default">
                    {t.checklist.map((c) => {
                      const p = t.progress.find((x) => x.key === c.key);
                      return (
                        <li
                          key={c.key}
                          className="flex items-center gap-3 border-b border-default px-3 py-3 last:border-b-0"
                        >
                          <Label className="flex flex-1 items-center gap-3">
                            <input
                              type="checkbox"
                              checked={p?.done ?? false}
                              onChange={() => toggle(t, c.key)}
                              data-testid={`item-${c.key}`}
                              className="h-6 w-6 shrink-0 accent-[#0f766e]"
                            />
                            <span className={p?.done ? "text-muted line-through" : ""}>
                              {c.label}
                            </span>
                          </Label>
                          {c.requiresPhoto ? (
                            p?.photoRef ? (
                              <span className="text-xs font-medium text-success">photo ✓</span>
                            ) : (
                              <label className="shrink-0 cursor-pointer rounded-full border border-default px-3 py-1 text-xs font-medium hover:bg-default">
                                Add photo
                                <input
                                  type="file"
                                  accept="image/*"
                                  capture="environment"
                                  className="sr-only"
                                  aria-label={`Photo: ${c.label}`}
                                  onChange={(e) => attachPhoto(t, c.key, e.target.files?.[0])}
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
                    <p className="font-semibold">Supplies to restock</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {[...RESTOCK, ...extra].map((item) => {
                        const on = needed.includes(item);
                        return (
                          <button
                            key={item}
                            type="button"
                            aria-pressed={on}
                            onClick={() => toggleRestock(t, item)}
                            className={`rounded-full px-3 py-1 text-xs ${on ? "bg-accent text-white" : "bg-default text-foreground"}`}
                          >
                            {item}
                          </button>
                        );
                      })}
                    </div>
                    <form
                      className="mt-2 flex gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const input = e.currentTarget.elements.namedItem(
                          "item",
                        ) as HTMLInputElement;
                        const v = input.value.trim();
                        if (v && !needed.includes(v)) toggleRestock(t, v);
                        input.value = "";
                      }}
                    >
                      <input
                        name="item"
                        placeholder="+ Add"
                        aria-label="Add a supply"
                        className="h-8 flex-1 rounded-input border border-default px-2 text-xs"
                      />
                    </form>
                  </div>
                  <button
                    type="button"
                    className="text-center text-xs font-semibold text-danger underline-offset-2 hover:underline"
                    onClick={() => setIssueFor(t.id)}
                  >
                    Report a problem, with photo
                  </button>
                  {issueFor === t.id ? (
                    <IssueForm
                      taskId={t.id}
                      onDone={() => {
                        setIssueFor(null);
                        setStatus("Issue reported");
                      }}
                    />
                  ) : null}
                  <Button
                    className="sticky bottom-3 w-full"
                    variant="primary"
                    size="lg"
                    onClick={() =>
                      void send(t.id, {
                        state: "done",
                        progress: t.progress,
                        photos: t.progress
                          .filter((p) => p.photoRef)
                          .map((p) => ({ ref: p.photoRef!, takenAt: nowIso() })),
                      })
                    }
                    data-testid="done"
                  >
                    {left > 0 ? `Mark clean · ${left} of ${t.checklist.length} left` : "Mark clean"}
                  </Button>
                </>
              ) : null}
              {(t.state === "done" || t.state === "inspected") && needed.length ? (
                <p className="text-xs text-muted">Restock: {needed.join(", ")}</p>
              ) : null}
            </div>
          </section>
        );
      })}
    </main>
  );
}

function IssueForm({ taskId, onDone }: { taskId: string; onDone: () => void }) {
  const [text, setText] = useState("");
  return (
    <form
      className="mt-2 space-y-1"
      onSubmit={(e) => {
        e.preventDefault();
        void import("@/app/(console)/operations/operations.actions")
          .then((m) =>
            m.reportIssueFromTaskAction({ taskId, description: text, severity: "normal" }),
          )
          .then(onDone);
      }}
    >
      <Textarea
        className="w-full rounded border border-border-secondary p-1 text-sm"
        rows={2}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="What is wrong? (photos in 3 taps: attach above)"
        required
      />
      <Button variant="danger" className="w-full bg-danger text-white" data-testid="report-issue">
        Send issue
      </Button>
    </form>
  );
}
