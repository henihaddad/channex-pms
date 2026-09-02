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
