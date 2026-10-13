# Nokta — Production Deployment Guide

> This guide covers deploying Nokta in production environments. For development setup, see README.md.

## Prerequisites

- Node.js 20+ (LTS recommended)
- npm or yarn
- 512MB RAM minimum (1GB recommended)
- Linux/macOS/Windows (WSL2)

## Quick Production Deploy

### 1. Clone and Install

```bash
git clone https://github.com/nokta-ai/nokta.git
cd nokta
npm install --production
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with production values
```

Required environment variables for production:

```bash
# REQUIRED: Generate with: openssl rand -hex 32
NOKTA_ENCRYPTION_KEY=your-32-byte-hex-key

# REQUIRED: JWT signing secret (at least 32 characters)
NOKTA_JWT_SECRET=your-jwt-secret-at-least-32-chars

# REQUIRED: Server-to-server API key
NOKTA_API_KEY=your-api-key

# RECOMMENDED: Provider API keys
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
OPENROUTER_API_KEY=sk-or-...

# PRODUCTION: Set secure CORS origin (your frontend domain)
NOKTA_CORS_ORIGIN=https://your-frontend.com

# PRODUCTION: Stripe billing (optional)
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

### 3. Generate Required Secrets

```bash
# Generate encryption key
openssl rand -hex 32

# Generate JWT secret
openssl rand -hex 64 | head -c 64

# Generate API key
openssl rand -hex 32
```

### 4. Start the Daemon

#### Development / Single Instance

```bash
node daemon/index.mjs daemon --port 4217
```

#### Production (with process manager)

Using PM2:

```bash
npm install -g pm2
pm2 start daemon/index.mjs --name nokta -- \
  daemon \
  --port 4217 \
  --host 127.0.0.1
pm2 save
pm2 startup
```

Using systemd:

```ini
# /etc/systemd/system/nokta.service
[Unit]
Description=Nokta AI Operating System
After=network.target

[Service]
Type=simple
User=nokta
WorkingDirectory=/opt/nokta
ExecStart=/usr/bin/node daemon/index.mjs daemon --port 4217 --host 127.0.0.1
Restart=on-failure
RestartSec=5
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=nokta
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable nokta
sudo systemctl start nokta
```

### 5. Verify Installation

```bash
curl http://localhost:4217/health
```

Expected response:

```json
{"status":"ok","version":"0.3.0","providers":[...]}
```

---

## Docker Deployment

### Using Docker Compose (Recommended)

```bash
# Start Nokta daemon
docker-compose up -d nokta

# Verify
curl http://localhost:4217/health
```

### Docker Environment Variables

```yaml
# docker-compose.yml (production)
services:
  nokta:
    image: noktaai/nokta:latest
    restart: unless-stopped
    ports:
      - '127.0.0.1:4217:4217'
    environment:
      NODE_ENV: production
      NOKTA_PORT: 4217
      NOKTA_HOST: 0.0.0.0
      NOKTA_CORS_ORIGIN: https://your-frontend.com
      NOKTA_ENCRYPTION_KEY: ${NOKTA_ENCRYPTION_KEY}
      NOKTA_JWT_SECRET: ${NOKTA_JWT_SECRET}
      NOKTA_API_KEY: ${NOKTA_API_KEY}
      OPENAI_API_KEY: ${OPENAI_API_KEY}
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY}
      NOKTA_ACCESS_TOKEN_TTL_SEC: 900
      NOKTA_REFRESH_TOKEN_TTL_SEC: 604800
      STRIPE_SECRET_KEY: ${STRIPE_SECRET_KEY}
      STRIPE_WEBHOOK_SECRET: ${STRIPE_WEBHOOK_SECRET}
    volumes:
      - nokta-data:/opt/nokta/.nokta
    healthcheck:
      test: ['CMD', 'curl', '-f', 'http://localhost:4217/health']
      interval: 30s
      timeout: 10s
      retries: 3

volumes:
  nokta-data:
    driver: local
```

### Build Docker Image

```bash
docker build -t nokta-local .
docker run -d \
  --name nokta \
  -p 127.0.0.1:4217:4217 \
  -v nokta-data:/opt/nokta/.nokta \
  -e NOKTA_ENCRYPTION_KEY=your-key \
  -e NOKTA_JWT_SECRET=your-secret \
  -e NOKTA_API_KEY=your-api-key \
  nokta-local
```

---

## Reverse Proxy Configuration

### Nginx

```nginx
# /etc/nginx/sites-available/nokta
server {
    listen 443 ssl;
    server_name nokta.your-domain.com;

    ssl_certificate /etc/ssl/certs/nokta.crt;
    ssl_certificate_key /etc/ssl/private/nokta.key;

    location / {
        proxy_pass http://127.0.0.1:4217;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # Timeouts for long-running AI requests
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }
}
```

### Caddy

```caddy
nokta.your-domain.com {
    reverse_proxy localhost:4217
}
```

---

## Database Management

Nokta uses SQLite (WAL mode) stored at `.nokta/nokta.db`.

### Backup

```bash
# Backup the database
cp .nokta/nokta.db .nokta/nokta.db.backup-$(date +%Y%m%d)

# Full backup (including all .nokta data)
tar -czf nokta-backup-$(date +%Y%m%d).tar.gz .nokta/
```

### Restore

```bash
# Stop Nokta
pm2 stop nokta

# Restore database
cp .nokta/nokta.db.backup-YYYYMMDD .nokta/nokta.db

# Restart
pm2 restart nokta
```

### Migration

Migrations run automatically on startup. To force-re-run:

```bash
# Delete migrations record and restart
node -e "const {getDb}=import('./daemon/db/connection.mjs'); const db=getDb(); db.exec(\"DELETE FROM migrations\");"
```

---

## Environment Variables Reference

| Variable                | Required    | Default         | Description                     |
| ----------------------- | ----------- | --------------- | ------------------------------- |
| `NOKTA_PORT`            | No          | 4217            | Daemon port                     |
| `NOKTA_HOST`            | No          | 127.0.0.1       | Daemon host                     |
| `NOKTA_ENCRYPTION_KEY`  | Yes         | —               | AES-256-GCM key (32 bytes hex)  |
| `NOKTA_JWT_SECRET`      | Yes         | —               | JWT signing secret              |
| `NOKTA_JWT_PREVIOUS_SECRETS` | No    | (empty)         | Retired secrets accepted for verification during rotation (comma-separated) |
| `NOKTA_API_KEY`         | Recommended | —               | Server-to-server API key        |
| `NOKTA_ACCESS_TOKEN_TTL_SEC` | No     | 900             | Access-token lifetime the client silently refreshes (clamped to 24h) |
| `NOKTA_REFRESH_TOKEN_TTL_SEC` | No    | 604800          | Refresh-token lifetime (7 days) |
| `NOKTA_REFRESH_MAX_SEC`      | No          | 2592000         | Absolute ceiling for a rotating refresh family (30 days) |
| `NOKTA_TRUST_PROXY`      | No          | (false)         | `1` only behind a real reverse proxy; enables X-Forwarded-For trust |
| `NOKTA_CORS_ORIGIN`     | No          | (empty)         | CORS origin (empty=same-origin) |
| `NOKTA_LOG_LEVEL`       | No          | info            | Log verbosity                   |
| `NOKTA_DATA_DIR`        | No          | .nokta          | Data directory                  |
| `NOKTA_RATE_LIMIT`      | No          | 100             | Requests per minute per IP      |
| `OPENAI_API_KEY`        | Recommended | —               | OpenAI API key                  |
| `ANTHROPIC_API_KEY`     | Recommended | —               | Anthropic API key               |
| `OPENROUTER_API_KEY`    | No          | —               | OpenRouter API key              |
| `OLLAMA_HOST`           | No          | localhost:11434 | Ollama server URL               |
| `STRIPE_SECRET_KEY`     | Optional    | —               | Stripe API key                  |
| `STRIPE_WEBHOOK_SECRET` | Optional    | —               | Stripe webhook secret           |

---

## Security Checklist

Before going live, verify:

- [ ] `NOKTA_ENCRYPTION_KEY` is set (32-byte hex)
- [ ] `NOKTA_JWT_SECRET` is set (at least 32 characters)
- [ ] `NOKTA_API_KEY` is set (for server-to-server auth)
- [ ] CORS is restricted to your frontend domain (not `*`)
- [ ] Database file has restricted permissions (600)
- [ ] `.nokta/` directory is gitignored
- [ ] No default passwords in use
- [ ] All provider API keys are encrypted (or using env vars)
- [ ] Running as non-root user in Docker/production
- [ ] TLS configured if exposing outside localhost
- [ ] Rate limiting enabled and configured
- [ ] Log level set to `info` or `warn` (not `debug`)

---

## Health Checks

### Endpoint

```bash
curl http://localhost:4217/health
```

### Docker Health Check

```bash
docker inspect --format='{{.State.Health.Status}}' nokta
```

### PM2 Watch

```bash
pm2 monit
```

---

## Metrics

The daemon exposes application metrics at `GET /metrics` in Prometheus text format:

| Metric                                | Type                | Labels                          |
| ------------------------------------- | ------------------- | ------------------------------- |
| `nokta_http_request_duration_seconds` | histogram           | `method`, `route`, `status_code` |
| `nokta_http_requests_total`           | counter             | `method`, `route`, `status_code` |
| `nokta_http_errors_total`             | counter (status ≥ 400) | `method`, `route`, `status_code` |
| `nokta_active_runs`                   | gauge               | —                               |
| `nokta_queue_length`                  | gauge               | —                               |
| `nokta_llm_tokens_total`              | counter             | `provider`, `direction`         |

Requests are labelled by the matched route *pattern* (e.g. `/api/v1/agents/:id`), so label cardinality stays bounded. `/metrics` is **not** on the auth allowlist: when `NOKTA_API_KEY` is set, scraping must present it (Prometheus `bearer_token_file`) or a valid JWT. `/metrics` alone is exempt from the global rate limiter so scraping never competes with (or consumes) client traffic; `/health` remains rate limited.

> The daemon binds to `127.0.0.1` by default, but the shipped Docker image sets `NOKTA_HOST=0.0.0.0` and publishes the port. In that setup `/metrics` is reachable from anything that can reach the container, so always set `NOKTA_API_KEY` and scrape over the private network (or restrict the port at the proxy).

```yaml
# prometheus.yml
scrape_configs:
  - job_name: nokta
    bearer_token_file: /etc/prometheus/nokta_api_key
    static_configs:
      - targets: ['localhost:4217']
```

---

## Logging

Logs are written to stdout (，适合systemd/docker). To capture to file:

```bash
# With systemd
journalctl -u nokta -f

# With PM2
pm2 logs nokta

# With Docker
docker logs -f nokta
```

Log levels: `debug`, `info`, `warn`, `error`

```bash
NOKTA_LOG_LEVEL=debug node daemon/index.mjs daemon
```

---

## Updating Nokta

### Docker

```bash
docker pull noktaai/nokta:latest
docker-compose down
docker-compose up -d
```

### npm

```bash
npm install nokta-ai@latest
pm2 restart nokta
```

### From Source

```bash
git pull origin main
npm install
pm2 restart nokta
```

**Always test updates in staging first.**

---

## Troubleshooting

### Daemon won't start

```bash
# Check if port is in use
lsof -i :4217

# Check logs
pm2 logs nokta
journalctl -u nokta -n 50
```

### Database locked

```bash
# SQLite WAL mode can lock if not closed properly
# Restart the daemon
pm2 restart nokta
```

### Provider API errors

```bash
# Verify API key is set
echo $OPENAI_API_KEY | head -c 10

# Test provider connectivity
curl https://api.openai.com/models -H "Authorization: Bearer $OPENAI_API_KEY"
```

### High memory usage

```bash
# Check Nokta process
ps aux | grep nokta

# Limit memory in Docker
docker run --memory=512m nokta-local
```

---

## Performance Tuning

### Connection Pooling

SQLite (Nokta's default) handles ~100 concurrent connections well. For higher throughput:

- Use `PRAGMA journal_mode=WAL` (already set)
- Limit concurrent AI requests via rate limiting
- Consider Redis for session storage in multi-instance setups

### Token Optimization

Context compilation happens on startup and on-demand. To reduce startup time:

```bash
# Pre-compile context (run periodically via cron)
node compiler/nokta-compile.mjs --target /path/to/project
```

### Rate Limiting

Default: 100 requests/minute. Adjust via `NOKTA_RATE_LIMIT`:

```bash
NOKTA_RATE_LIMIT=500 node daemon/index.mjs daemon
```

---

## Multi-Instance Deployment

For horizontal scaling, Nokta supports multi-instance deployment with a shared SQLite database or PostgreSQL (future).

### Load Balancer Setup

```nginx
upstream nokta_backend {
    least_conn;
    server 127.0.0.1:4217;
    server 127.0.0.1:4218;
    server 127.0.0.1:4219;
}

server {
    listen 443 ssl;
    location / {
        proxy_pass http://nokta_backend;
    }
}
```

### Session Affinity

WebSocket connections (for agent events) require sticky sessions. Use source IP affinity:

```nginx
ip_hash;
```

---

## Support

- GitHub Issues: https://github.com/nokta-ai/nokta/issues
- Documentation: https://docs.nokta.ai
- Email: support@nokta.ai
