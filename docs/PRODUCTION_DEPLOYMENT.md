# BlueCollar Production Deployment Guide

This guide covers production deployment for the API, frontend, PostgreSQL database, TLS, monitoring, logging, and disaster recovery.

## 1. Production Topology

Recommended baseline:

- 1 reverse-proxy host (Nginx + Certbot)
- 1 app host running containers for:
- API (Express)
- App (Next.js)
- PostgreSQL

For higher availability, run PostgreSQL on a managed service (RDS, Cloud SQL, Neon, Supabase) and keep API/App stateless.

## 2. Environment Setup

## 2.1 API Environment Variables

Create `packages/api/.env.production` from `packages/api/.env.example`.

Required by API startup:

- `DATABASE_URL`
- `JWT_SECRET`
- `PORT`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `MAIL_HOST`
- `MAIL_PORT`
- `MAIL_USER`
- `MAIL_PASS`
- `APP_URL`

Recommended production values:

```env
NODE_ENV=production
PORT=3000
APP_URL=https://app.bluekollar.com
ALLOWED_ORIGINS=https://app.bluekollar.com
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=100
LOG_LEVEL=info
UPLOAD_DIR=storage/uploads
MAX_FILE_SIZE=5242880
```

Secret management recommendations:

- Store secrets in your cloud secret manager (AWS Secrets Manager, GCP Secret Manager, Vault).
- Inject secrets at runtime, not in source control.
- Rotate `JWT_SECRET`, OAuth, SMTP, and VAPID credentials on a fixed schedule.

## 2.2 Frontend Environment Variables

Create `packages/app/.env.production` from `packages/app/.env.example`.

```env
NEXT_PUBLIC_API_URL=https://api.bluekollar.com/api
NEXT_PUBLIC_STELLAR_NETWORK=MAINNET
NEXT_PUBLIC_MARKET_CONTRACT_ID=<mainnet-market-contract-id>
NEXT_PUBLIC_REGISTRY_CONTRACT_ID=<mainnet-registry-contract-id>
NEXT_PUBLIC_VAPID_PUBLIC_KEY=<public-vapid-key>
```

Frontend notes:

- Only `NEXT_PUBLIC_*` values are exposed to browser bundles.
- Keep private keys and backend credentials out of the app package.

## 2.3 Database Setup

Use PostgreSQL 16+ and enforce least privilege:

1. Create a dedicated application user.
2. Grant only required privileges on the BlueCollar database.
3. Restrict network access to API hosts and admin IPs.
4. Enforce SSL at the database layer where supported.

Example:

```sql
CREATE USER bluecollar_app WITH ENCRYPTED PASSWORD '<strong-password>';
CREATE DATABASE bluecollar OWNER bluecollar_app;
GRANT ALL PRIVILEGES ON DATABASE bluecollar TO bluecollar_app;
```

Use a production-safe connection string in `DATABASE_URL`:

```env
DATABASE_URL=postgresql://bluecollar_app:<password>@db-host:5432/bluecollar?sslmode=require
```

## 2.4 PgBouncer Connection Pooling

In production, route all API connections through PgBouncer to cap the number of real PostgreSQL connections and handle high concurrency efficiently.

**Why PgBouncer?**
- PostgreSQL forks a process per connection — without pooling, a spike in API instances exhausts `max_connections` quickly.
- PgBouncer in **transaction mode** multiplexes many short-lived application connections onto a small pool of real server connections.
- Prisma is compatible with transaction mode when `?pgbouncer=true&connection_limit=1` is appended to `DATABASE_URL`.

**Docker Compose setup** (already included in `docker-compose.yml`):

```yaml
pgbouncer:
  image: bitnami/pgbouncer:1.22.1
  environment:
    POSTGRESQL_HOST: db
    POSTGRESQL_PORT: 5432
    POSTGRESQL_USERNAME: bluecollar
    POSTGRESQL_PASSWORD: <password>
    POSTGRESQL_DATABASE: bluecollar
    PGBOUNCER_DATABASE: bluecollar
    PGBOUNCER_POOL_MODE: transaction
    PGBOUNCER_MAX_CLIENT_CONN: 1000
    PGBOUNCER_DEFAULT_POOL_SIZE: 25
    PGBOUNCER_MIN_POOL_SIZE: 5
    PGBOUNCER_RESERVE_POOL_SIZE: 5
    PGBOUNCER_IGNORE_STARTUP_PARAMETERS: extra_float_digits
  ports:
    - "5433:5432"
```

**DATABASE_URL for Prisma via PgBouncer:**

```env
DATABASE_URL=postgresql://bluecollar_app:<password>@pgbouncer:5432/bluecollar?pgbouncer=true&connection_limit=1&sslmode=require
```

Key parameters:
- `pgbouncer=true` — disables Prisma's prepared-statement cache (not supported in transaction mode).
- `connection_limit=1` — each API process holds at most one server connection; PgBouncer handles the rest.

**Recommended pool sizing:**

| Parameter | Value | Notes |
|---|---|---|
| `PGBOUNCER_MAX_CLIENT_CONN` | 1000 | Max simultaneous app connections |
| `PGBOUNCER_DEFAULT_POOL_SIZE` | 25 | Real PostgreSQL connections per database/user pair |
| `PGBOUNCER_RESERVE_POOL_SIZE` | 5 | Extra connections for bursts |

Tune `DEFAULT_POOL_SIZE` to stay well below PostgreSQL's `max_connections` (default 100). A safe rule: `pool_size × number_of_api_replicas < max_connections × 0.8`.

**Prisma migration note:** Run migrations directly against PostgreSQL (port 5432), not through PgBouncer, because `prisma migrate deploy` uses DDL statements that require session mode:

```bash
# Run migrations directly against Postgres, not PgBouncer
DATABASE_URL=postgresql://bluecollar_app:<password>@db:5432/bluecollar npx prisma migrate deploy
```

## 3. Docker Production Configuration

A production-ready example compose file is provided at `docker-compose.prod.example.yml`.

Deploy steps:

```bash
cp docker-compose.prod.example.yml docker-compose.prod.yml
cp packages/api/.env.example packages/api/.env.production
cp packages/app/.env.example packages/app/.env.production

# Edit env files with production values before starting.
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d --build
```

Apply migrations after deploy:

```bash
docker compose -f docker-compose.prod.yml exec api npx prisma migrate deploy
```

Health check validation:

```bash
curl -f https://api.bluekollar.com/health
```

## 4. SSL/TLS Setup (Nginx + Let's Encrypt)

An Nginx vhost example is provided at `deploy/nginx/bluecollar.conf.example`.

Steps:

1. Point DNS records:

- `app.bluekollar.com` -> reverse proxy IP
- `api.bluekollar.com` -> reverse proxy IP

2. Install Nginx and Certbot.
3. Copy vhost config and update domain names.
4. Request certs:

```bash
sudo certbot --nginx -d app.bluekollar.com -d api.bluekollar.com
```

5. Validate renewal:

```bash
sudo certbot renew --dry-run
```

TLS hardening checklist:

- Redirect HTTP to HTTPS.
- Disable TLS 1.0/1.1.
- Enable HSTS after verifying HTTPS stability.
- Restrict CORS to known frontend origins.

## 5. Monitoring and Logging

## 5.1 Application Monitoring

Minimum metrics to track:

- API availability and latency (`/health`)
- 4xx/5xx rates
- PostgreSQL connections and slow queries
- Container CPU/memory/disk usage

Recommended stack:

- Prometheus + Grafana for metrics
- Uptime checks (Uptime Kuma, Pingdom, Better Stack)

## 5.2 Structured Logging

API uses structured logs via Pino. In production:

- Collect stdout/stderr from containers.
- Forward logs to ELK, Loki, Datadog, or CloudWatch.
- Add alerting for repeated 5xx bursts and auth failures.

Example Docker logging options (already included in compose example):

- `json-file` driver
- `max-size=10m`
- `max-file=5`

## 5.3 Alerting

Create alerts for:

- API error rate > 5% over 5 minutes
- Database storage > 80%
- Failed backups
- TLS cert expiry < 15 days

## 6. Backup and Disaster Recovery

## 6.1 Backup Policy

Recommended schedule:

- Daily logical backups (`pg_dump`)
- Weekly restore test
- 30-day retention (minimum)
- Off-site copy in object storage (S3/GCS/Azure Blob)

Example backup command:

```bash
pg_dump "$DATABASE_URL" --format=custom --file="bluecollar-$(date +%F).dump"
```

Example restore command:

```bash
createdb bluecollar_restore
pg_restore --no-owner --role=bluecollar_app --dbname=bluecollar_restore bluecollar-2026-04-23.dump
```

## 6.2 Disaster Recovery Runbook

Define and publish RTO/RPO before launch:

- Target RPO: 24h (or better)
- Target RTO: 2h (or better)

Recovery sequence:

1. Provision replacement PostgreSQL instance.
2. Restore latest verified backup.
3. Deploy API/App containers with production env files.
4. Run `npx prisma migrate deploy`.
5. Validate critical paths: login, worker listing, contract actions.
6. Cut traffic to recovered stack and monitor.

## 6.3 Incident Readiness Checklist

- Backup jobs monitored with alerting
- Restore steps tested and documented
- On-call owners listed for API/DB/infra
- Rollback path defined for every release

## 7. Production Release Checklist

- Env files updated in secret manager
- Database backups green
- Migrations reviewed and tested
- TLS certs valid and auto-renew enabled
- Health checks and alerts active
- Rollback plan confirmed

This deployment guide should be updated whenever infrastructure, contract IDs, or traffic architecture changes.
