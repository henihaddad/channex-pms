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

  return (
    <main
      className="mx-auto max-w-md space-y-3 p-3 text-sm"
      data-testid="cleaner-app"
      data-online={online ? "1" : "0"}
      data-queued={queue.length}
    >
      <header className="flex items-center justify-between">
        <h1 className="text-lg font-bold">My day</h1>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-8 rounded border border-border-secondary px-1"
          />
          <span
            className={`rounded px-2 py-0.5 text-xs ${online ? "bg-success-soft text-success-soft-foreground" : "bg-warning-soft text-warning-soft-foreground"}`}
            data-testid="online-state"
          >
            {online ? "online" : "offline"}
          </span>
        </div>
      </header>
      {queue.length > 0 ? (
        <p
          className="rounded bg-warning-soft p-2 text-xs text-warning-soft-foreground"
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
      {tasks.length === 0 ? <p className="text-muted">No tasks assigned for this day.</p> : null}
      {tasks.map((t) => (
        <section
          key={t.id}
          className={`rounded-lg border p-3 ${t.isSameDay ? "border-warning/50" : "border-border"}`}
          data-testid="cleaner-task"
          data-state={t.state}
        >
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">
              {t.propertyTitle} · {t.unitName}
            </h2>
            <span className="rounded bg-background px-1.5 text-xs">{t.state}</span>
          </div>
          <p className="text-xs text-muted">
            {t.type}
            {t.isSameDay ? " · SAME-DAY" : ""} · {t.windowFrom}–{t.windowTo}
            {t.arrivalTime ? ` · guest arrives ${t.arrivalTime}` : ""}
          </p>
          {t.address.city ? (
            <a
              className="text-xs underline"
              href={`https://maps.google.com/?q=${encodeURIComponent(Object.values(t.address).join(" "))}`}
            >
              Navigate: {Object.values(t.address).join(", ")}
            </a>
          ) : null}
          {t.notes ? <p className="mt-1 text-xs">{t.notes}</p> : null}
          {t.state === "assigned" ? (
            <Button
              className="mt-2 w-full bg-success text-white"
              onClick={() => void send(t.id, { state: "accepted" })}
              data-testid="accept"
            >
              Accept
            </Button>
          ) : null}
          {t.state === "accepted" ? (
            <Button
              className="mt-2 w-full bg-accent text-white"
              onClick={() => void send(t.id, { state: "on_site" })}
              data-testid="on-site"
            >
              I&apos;m on site
            </Button>
          ) : null}
          {t.state === "on_site" ? (
            <div className="mt-2 space-y-1">
              {t.checklist.map((c) => {
                const p = t.progress.find((x) => x.key === c.key);
                return (
                  <Label key={c.key}>
                    <input
                      type="checkbox"
                      checked={p?.done ?? false}
                      onChange={() => toggle(t, c.key)}
                      data-testid={`item-${c.key}`}
                    />
                    <span className="flex-1">
                      {c.label}
                      {c.requiresPhoto ? " 📷" : ""}
                    </span>
                    {c.requiresPhoto ? (
                      p?.photoRef ? (
                        <span className="text-xs text-success-soft-foreground">photo ✓</span>
                      ) : (
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          className="w-28 text-xs"
                          onChange={(e) => attachPhoto(t, c.key, e.target.files?.[0])}
                          data-testid={`photo-${c.key}`}
                        />
                      )
                    ) : null}
                  </Label>
                );
              })}
              <Button
                className="mt-2 w-full bg-success text-white"
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
                Done
              </Button>
              <Button
                variant="secondary"
                className="w-full border-danger/40 text-danger"
                onClick={() => setIssueFor(t.id)}
              >
                Report issue
              </Button>
            </div>
          ) : null}
          {issueFor === t.id ? (
            <IssueForm
              taskId={t.id}
              onDone={() => {
                setIssueFor(null);
                setStatus("Issue reported");
              }}
            />
          ) : null}
        </section>
      ))}
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
