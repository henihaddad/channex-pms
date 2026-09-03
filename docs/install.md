# Install (self-hosted)

Sixty minutes from `docker compose up` to the first OTA booking on screen is the target; the
steps below are everything that stands between you and it.

## Requirements

- A Linux host with Docker 24+ and Compose v2, 4 vCPU and 8 GB for the reference load
  (200 properties, spec 13 §13.7), a public hostname with DNS pointing at it.
- A Channex account and API key (production or staging).
- Outbound HTTPS to `channex.io`, your mail transport and, if you use it, Stripe.

## Steps

```sh
git clone https://github.com/henihaddad/channex-pms.git && cd channex-pms
cp .env.example .env
# set PMS_MASTER_KEY (64 hex), PMS_SESSION_KEY (32+ chars), CHANNEX_API_KEY, CHANNEX_ENV,
# PUBLIC_URL (https://pms.example) and PUBLIC_HOST (pms.example) in .env
docker compose -f compose.selfhost.yml up -d
```

The `migrate` service runs every migration once and exits; `web` and `worker` start when it
has finished; Caddy obtains a certificate for `PUBLIC_HOST`. Open `https://pms.example/signup`,
create the organization, add a property, connect a channel. The onboarding checklist on the
console tracks the five steps to the first pushed rate.

## Environment reference

| Variable                         | Purpose                                                                                             |
| -------------------------------- | --------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`, `REDIS_URL`      | Postgres 16 and Redis 7 (set by Compose)                                                            |
| `PMS_MASTER_KEY`                 | Wraps every tenant's data-encryption key (PRIV-1). Losing it loses the data. Back it up separately. |
| `PMS_SESSION_KEY`                | Signs access tokens                                                                                 |
| `CHANNEX_API_KEY`, `CHANNEX_ENV` | Provider credentials; without a key the in-memory FakeProvider runs (development only)              |
| `NEXT_PUBLIC_APP_URL`            | Public base URL used in mails and the booking widget                                                |
| `MAIL_TRANSPORT`, `SMTP_URL`     | `console` or `smtp`                                                                                 |
| `STRIPE_SECRET_KEY`              | Enables Stripe for guest payments, owner payouts and (hosted mode) billing                          |
| `PMS_MODE`                       | `hosted` turns on plans, quotas and billing; unset means self-hosted with everything included       |
| `PMS_SELLER_COUNTRY`             | Hosted mode: the operator's VAT country                                                             |

## Hosted on Cloudflare (ADR-0008)

The hosted service runs the same code on Cloudflare Workers: `apps/web` through
`@opennextjs/cloudflare`, the job worker as `apps/worker-cf` on Queues and a Cron Trigger, and
Postgres on Neon behind Hyperdrive. Nothing here changes self-hosting.

1. Create the resources once: a Hyperdrive config pointing at the Neon database (caching
   disabled), the queues named in `apps/worker-cf/wrangler.jsonc` (`otabridge-*` plus
   `otabridge-dlq`), and the custom domain on the zone. Put the Hyperdrive id in both
   `wrangler.jsonc` files.
2. Migrate from a machine that can reach Neon (CI or a laptop):
   `NEON_DIRECT_URL=… pnpm --filter @pms/db db:migrate:neon`. The script speaks the wire protocol
   over a WebSocket, so it also works behind an HTTPS proxy; it grants `pms_app` to the connecting
   role on first run.
3. Secrets, per Worker (`wrangler secret put <NAME>` in `apps/web` and `apps/worker-cf`):
   `PMS_MASTER_KEY` and `PMS_SESSION_KEY` (the same values in both; the boot check requires them),
   `CHANNEX_API_KEY`, `RESEND_API_KEY` (mail), optionally `STRIPE_SECRET_KEY`. Plain settings live
   in the `vars` block of each `wrangler.jsonc`.
4. Build and deploy: `pnpm --filter @pms/web build:cf && pnpm --filter @pms/web deploy:cf` and
   `pnpm --filter @pms/worker-cf deploy`. `.github/workflows/deploy-cloudflare.yml` does the same
   from `main` once CI is green, when the `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` and
   `NEON_DIRECT_URL` repository secrets exist.
5. Local run on the real runtime: start a Postgres on `127.0.0.1:5433` (the Hyperdrive
   `localConnectionString`), migrate it, put development values in `apps/web/.dev.vars`, then
   `pnpm --filter @pms/web build:cf && pnpm --filter @pms/web exec wrangler dev --port 8787 --host localhost:8787`.
   The end-to-end suite runs against it with `E2E_BASE_URL=http://localhost:8787`. Start
   `wrangler dev` with `CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV=false` (wrangler otherwise loads the
   repository `.env`, and a real `CHANNEX_API_KEY` would put the fake-provider suite on staging).

Operational differences from the compose deployment: jobs scheduled more often than a minute run
once a minute; the realtime grid polls (no Redis); the mail transport is Resend over HTTPS; the
outbox is published by the request that wrote it and by the worker's minute tick.

## First operator (hosted mode only)

```sh
docker compose -f compose.selfhost.yml exec web pnpm --filter @pms/db operator:grant you@example.com
```

## Backups

`scripts/backup.sh` writes a `pg_dump` custom-format archive to `backups/`; `scripts/restore.sh`
restores one into an empty database. Run the backup nightly from cron and keep 35 days
(spec 13 §13.4). Object storage (MinIO) holds attachments and exports: back up its volume
alongside. The restore drill runs in CI on every push (`.github/workflows/drills.yml`) so the
procedure is known to work with the current schema.

## Upgrades

Releases are tagged. `docs/runbooks/upgrade-and-rollback.md` is the procedure; every release
notes its migration duration in the CHANGELOG.
