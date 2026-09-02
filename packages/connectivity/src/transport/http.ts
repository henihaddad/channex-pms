/** Minimal HTTP port so the Channex client can be replayed from fixtures and recorded against staging. */
export interface HttpRequest {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  query?: Record<string, string>;
  body?: unknown;
  headers?: Record<string, string>;
  timeoutMs?: number;
}

export interface HttpResponse {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}

export interface HttpTransport {
  request(req: HttpRequest): Promise<HttpResponse>;
}

export function queryString(q?: Record<string, string>): string {
  if (!q || Object.keys(q).length === 0) return "";
  return (
    "?" +
    Object.entries(q)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join("&")
  );
}

export class FetchTransport implements HttpTransport {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async request(req: HttpRequest): Promise<HttpResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), req.timeoutMs ?? 30_000);
    try {
      const init: RequestInit = {
        method: req.method,
        headers: {
          "content-type": "application/json",
          "user-api-key": this.apiKey,
          ...req.headers,
        },
        signal: controller.signal,
      };
      if (req.body !== undefined) init.body = JSON.stringify(req.body);
      const res = await this.fetchImpl(`${this.baseUrl}${req.path}${queryString(req.query)}`, init);
      const text = await res.text();
      let body: unknown = null;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        body = text;
      }
      return { status: res.status, headers: Object.fromEntries(res.headers.entries()), body };
    } finally {
      clearTimeout(timer);
    }
  }
}
