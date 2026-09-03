# ADR-0009: The hosted web app runs on Vercel next to the database; jobs stay on Cloudflare

**Status:** accepted (2026-09-03, supersedes the web-app placement of ADR-0008)

## Context

ADR-0008 put the whole hosted service on Cloudflare. Measured on that deployment, after the
request-scoped connection and the single-statement tenant setup, a JSON API call took about
200 ms and a console page 500 to 900 ms with frequent 1.5 to 2.5 s outliers; login took 2 to
5 s. The Worker's own timings gave the reasons: a cold isolate spends 250 to 500 ms of CPU
evaluating the Next.js bundle before serving its first request, and with little traffic
Cloudflare hands most requests to fresh isolates; every one of the roughly thirty statements a
page runs is a round trip from Virginia to Neon in Ohio; and Argon2id runs in pure JavaScript
because Workers cannot compile WebAssembly at runtime. Smart Placement made the medians worse
(an extra routing hop, cold isolates at the placement site) and was reverted.

None of these are properties of the code. They are properties of running a large Next.js
server on isolates without persistent processes or native modules.

## Decision

1. The web app (`apps/web`) runs on Vercel as a plain Node build (project `otabridge-app`, root
   directory `apps/web`, functions pinned to `cle1`, Ohio, the region of the Neon project).
   Native Argon2, a persistent `pg` pool through Neon's pooled endpoint, no adapter: the same
   build the Docker image and CI run. `apps/web/vercel.json` and `.vercelignore` describe it.
2. The job worker stays `apps/worker-cf` on Cloudflare (Queues, Cron Trigger, Durable Object
   lease), unchanged. The web app has no queue bindings there, so after a write it pokes the
   worker's `POST /outbox/drain` (shared secret `OUTBOX_KICK_SECRET`) through Next's `after()`;
   the worker's minute tick remains the safety net. On Cloudflare the web app keeps draining
   the outbox itself through `waitUntil`; `kickOutbox` picks the path at runtime.
3. `app.otabridge.com` points at Vercel. The Cloudflare copy of the web app stays deployed on
   `workers.dev` as a fallback and as the runtime the Workers end-to-end gate exercises.
4. The landing page stays on Cloudflare Pages.

## Consequences

- Measured from the same vantage point right after the move (Virginia functions, before the
  region pin): login 1.0 s including a cold start, JSON API 230 ms, console pages 340 to 630 ms
  median with a spread of about 150 ms instead of seconds.
- Two hosts instead of one: Vercel for the web app, Cloudflare for jobs, queues, the fallback
  and the landing page. Secrets exist in both places; `docs/install.md` lists them.
- Vercel functions still cold-start, but far less often (Fluid compute keeps instances warm and
  reuses them across requests) and the penalty is a fraction of the Workers one.
- Self-hosting is untouched: `compose.selfhost.yml` remains the reference deployment.
