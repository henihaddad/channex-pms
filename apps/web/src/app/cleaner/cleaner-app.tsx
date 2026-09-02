"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

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
      setTasks(day.tasks);
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

  const flush = useCallback(async () => {
    const q = load<Queued[]>(KEY_QUEUE, []);
    if (q.length === 0 || !navigator.onLine) return;
    const remaining: Queued[] = [];
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
      } catch {
        remaining.push(item);
      }
    }
    save(KEY_QUEUE, remaining);
    setQueue(remaining);
    if (remaining.length === 0) await refresh();
  }, [refresh]);

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
            className="h-8 rounded border border-slate-300 px-1"
          />
          <span
            className={`rounded px-2 py-0.5 text-xs ${online ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}
            data-testid="online-state"
          >
            {online ? "online" : "offline"}
          </span>
        </div>
      </header>
      {queue.length > 0 ? (
        <p className="rounded bg-amber-50 p-2 text-xs text-amber-800" data-testid="pending-sync">
          {queue.length} update(s) waiting to sync{online ? "…" : " (will send when back online)"}
        </p>
      ) : null}
      {status ? (
        <p className="text-xs text-slate-600" role="status">
          {status}
        </p>
      ) : null}
      {tasks.length === 0 ? (
        <p className="text-slate-500">No tasks assigned for this day.</p>
      ) : null}
      {tasks.map((t) => (
        <section
          key={t.id}
          className={`rounded-lg border p-3 ${t.isSameDay ? "border-amber-300" : "border-slate-200"}`}
          data-testid="cleaner-task"
          data-state={t.state}
        >
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">
              {t.propertyTitle} · {t.unitName}
            </h2>
            <span className="rounded bg-slate-100 px-1.5 text-[10px]">{t.state}</span>
          </div>
          <p className="text-xs text-slate-600">
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
            <button
              className="mt-2 w-full rounded bg-emerald-600 py-2 text-white"
              onClick={() => void send(t.id, { state: "accepted" })}
              data-testid="accept"
            >
              Accept
            </button>
          ) : null}
          {t.state === "accepted" ? (
            <button
              className="mt-2 w-full rounded bg-sky-600 py-2 text-white"
              onClick={() => void send(t.id, { state: "on_site" })}
              data-testid="on-site"
            >
              I&apos;m on site
            </button>
          ) : null}
          {t.state === "on_site" ? (
            <div className="mt-2 space-y-1">
              {t.checklist.map((c) => {
                const p = t.progress.find((x) => x.key === c.key);
                return (
                  <label key={c.key} className="flex items-center gap-2 text-sm">
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
                        <span className="text-xs text-emerald-700">photo ✓</span>
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
                  </label>
                );
              })}
              <button
                className="mt-2 w-full rounded bg-emerald-700 py-2 text-white"
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
              </button>
              <button
                className="w-full rounded border border-rose-300 py-2 text-rose-700"
                onClick={() => setIssueFor(t.id)}
              >
                Report issue
              </button>
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
      <textarea
        className="w-full rounded border border-slate-300 p-1 text-sm"
        rows={2}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="What is wrong? (photos in 3 taps: attach above)"
        required
      />
      <button className="w-full rounded bg-rose-600 py-1 text-white" data-testid="report-issue">
        Send issue
      </button>
    </form>
  );
}
