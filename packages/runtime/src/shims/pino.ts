/**
 * Drop-in for `pino` on Cloudflare Workers: one JSON line per event through
 * `console`, which Workers Logs captures. Same redaction contract as the real
 * logger (PRIV-2): the field names named in `redact.paths` are censored at any depth.
 */
const LEVELS: Record<string, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
  silent: Infinity,
};

interface Options {
  level?: string;
  base?: Record<string, unknown>;
  redact?: { paths: string[]; censor?: string };
}

function fieldNames(paths: string[]): Set<string> {
  return new Set(paths.map((p) => p.split(".").at(-1)!).filter((f) => f !== "*"));
}

function redact(value: unknown, fields: Set<string>, censor: string, depth = 0): unknown {
  if (depth > 4 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, fields, censor, depth + 1));
  if (value instanceof Error) return { name: value.name, message: value.message };
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>))
    out[k] = fields.has(k) ? censor : redact(v, fields, censor, depth + 1);
  return out;
}

function makeLogger(opts: Options, bindings: Record<string, unknown>) {
  const threshold = LEVELS[opts.level ?? "info"] ?? 30;
  const fields = fieldNames(opts.redact?.paths ?? []);
  const censor = opts.redact?.censor ?? "[redacted]";
  const emit =
    (level: string) =>
    (a: unknown, b?: unknown): void => {
      if ((LEVELS[level] ?? 30) < threshold) return;
      const [obj, msg] = typeof a === "string" ? [{}, a] : [a, b];
      const line = {
        level,
        time: new Date().toISOString(),
        ...opts.base,
        ...bindings,
        ...(redact(obj, fields, censor) as object),
        msg: msg === undefined ? undefined : typeof msg === "string" ? msg : JSON.stringify(msg),
      };
      const text = JSON.stringify(line);
      if (level === "error" || level === "fatal") console.error(text);
      else if (level === "warn") console.warn(text);
      else console.log(text);
    };
  return {
    level: opts.level ?? "info",
    trace: emit("trace"),
    debug: emit("debug"),
    info: emit("info"),
    warn: emit("warn"),
    error: emit("error"),
    fatal: emit("fatal"),
    child: (more: Record<string, unknown>) =>
      makeLogger(opts, { ...bindings, ...(redact(more, fields, censor) as object) }),
  };
}

export default function pino(opts: Options = {}) {
  return makeLogger(opts, {});
}

export const stdTimeFunctions = { isoTime: () => `,"time":"${new Date().toISOString()}"` };
pino.stdTimeFunctions = stdTimeFunctions;
