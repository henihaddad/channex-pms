import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { HttpRequest, HttpResponse, HttpTransport } from "./http.js";
import { queryString } from "./http.js";

/**
 * Fixture format. `source: "docs"` fixtures are hand-authored from docs.channex.io;
 * `source: "recorded"` fixtures were captured against staging by RecordTransport.
 */
export interface Fixture {
  meta: { source: "docs" | "recorded"; note?: string; recordedAt?: string };
  request: { method: HttpRequest["method"]; path: string; query?: Record<string, string> };
  response: { status: number; headers?: Record<string, string>; body: unknown };
}

const keyOf = (r: { method: string; path: string; query?: Record<string, string> }): string =>
  `${r.method} ${r.path}${queryString(r.query)}`;

export function loadFixtures(dir: string): Map<string, Fixture> {
  const out = new Map<string, Fixture>();
  for (const f of readdirSync(dir)
    .filter((n) => n.endsWith(".json"))
    .sort()) {
    const fx = JSON.parse(readFileSync(join(dir, f), "utf8")) as Fixture;
    out.set(keyOf(fx.request), fx);
  }
  return out;
}

/** Answers from fixtures; an unknown request is a contract gap and throws loudly. */
export class ReplayTransport implements HttpTransport {
  readonly calls: HttpRequest[] = [];
  constructor(private readonly fixtures: Map<string, Fixture>) {}

  async request(req: HttpRequest): Promise<HttpResponse> {
    this.calls.push(req);
    const fx = this.fixtures.get(keyOf(req));
    if (!fx) throw new Error(`No fixture for ${keyOf(req)}`);
    return {
      status: fx.response.status,
      headers: fx.response.headers ?? {},
      body: fx.response.body,
    };
  }
}

/** Wraps a live transport and writes every exchange as a `recorded` fixture, redacting nothing but the API key (never in the body). */
export class RecordTransport implements HttpTransport {
  constructor(
    private readonly inner: HttpTransport,
    private readonly dir: string,
  ) {
    mkdirSync(dir, { recursive: true });
  }

  async request(req: HttpRequest): Promise<HttpResponse> {
    const res = await this.inner.request(req);
    const name = `${req.method.toLowerCase()}_${req.path.replace(/^\/api\/v1\//, "").replace(/[^a-z0-9]+/gi, "_")}_${String(res.status)}.json`;
    const fx: Fixture = {
      meta: { source: "recorded", recordedAt: new Date().toISOString() },
      request: { method: req.method, path: req.path, ...(req.query ? { query: req.query } : {}) },
      response: { status: res.status, body: res.body },
    };
    writeFileSync(join(this.dir, name), JSON.stringify(fx, null, 2) + "\n");
    return res;
  }
}
