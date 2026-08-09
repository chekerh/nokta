# Changelog

All notable changes to Nokta are documented here.

## [0.3.1] — 2026-07-01

### Fixed

- **daemon/server.mjs**: API key auth bypass now only skips `/health` (removed incorrect `startsWith('/api/v1/health')` check that could confuse monitoring)
- **daemon/server.mjs**: OpenAPI spec version corrected from `0.2.0` to `0.3.0`
- **daemon/lib/rate-limit.mjs**: X-Forwarded-For spoofing prevention — `getClientIp()` only trusts `req.ips` when the first IP matches IPv4/IPv6 pattern, otherwise falls back to `socket.remoteAddress`
- **daemon/lib/rate-limit.mjs**: Cleanup interval now also cleans `failedLoginStores` and `lockedAccounts` (previously only cleaned `ipStores` and `userStores`)
- **daemon/lib/auth.mjs**: `getSecret()` now throws explicit error if `NODE_ENV=production` and `NOKTA_JWT_SECRET` is not set
- **daemon/lib/auth.mjs**: Added `validatePassword()` — requires 8+ chars, uppercase, lowercase, digit, and special character
- **daemon/db/schema.mjs**: Migration logging now uses structured `logger` instead of `console.error`
- **daemon/lib/backup.mjs**: Backup deletion errors now logged via `console.warn` instead of silent swallow; auto-backup failures logged
- **daemon/server.mjs**: Discovery startup failure now logged at debug level instead of silent swallow
- **daemon/lib/discovery.mjs**: Cache TTL now configurable via `NOKTA_DISCOVERY_CACHE_TTL_MS` env var (default 6 hours)
- **Dockerfile**: Fixed healthcheck path from `/api/v1/health` to `/health`; added missing `COPY packs/`, `COPY adapters/`, `COPY upstream/` for runtime dependencies
- **docker-compose.yml**: Fixed healthcheck path from `/api/v1/health` to `/health`

### Added

- **tests/auth.test.mjs**: 7 tests for `validatePassword` — length, uppercase, lowercase, digit, special char, valid passwords, null/undefined
- **tests/search.test.mjs**: 15 new tests for `getClientIp` (IP spoofing prevention), `authRateLimit` (limit, lockout, clear), `rateLimit` (tier-based), `providerRateLimit` (token bucket)
- **daemon/lib/rate-limit.mjs**: `getClientIp()` exported for testing; `validatePassword()` exported from auth.mjs
- **.env.example**: Added `NODE_ENV` (with production JWT secret requirement note) and `NOKTA_DISCOVERY_CACHE_TTL_MS`
- **.gitignore**: Added `.nokta/backups/`

## [0.3.0] — 2026-06-29

### Fixed

- **sprint-engine.mjs**: Restored 20+ corrupt variable names (`sprites→sprints`, `prts→patterns`, `eic→epic`, `sprit→sprint`, etc.) that caused crashes in `getSummary`, `updateEpic`, `updateSprint`, `autoUpdate`, `reviewPR`, `recordFeedback`, `brainstorm`, and helper methods
- **decision-engine.mjs**: Completely rebuilt from a 1-line stub to a functional file-backed JSON store supporting CRUD, filtering, impact analysis, related-decision linking, and templates
- **routes/decisions.mjs**: No longer returns 500 errors — DecisionEngine methods now exist
- **routes/auth.mjs**: `/me` and `/change-password` now use `authMiddleware()` consistently instead of duplicating token verification logic
- **daemon/server.mjs**: CORS now defaults to `false` (same-origin) instead of `'*'`, reading from `NOKTA_CORS_ORIGIN` env var or `.nokta/config.json`
- **daemon/lib/config.mjs**: `NOKTA_CORS_ORIGIN` env var takes precedence over config file
- **daemon/lib/sprint-engine.mjs**: `pr review` regex fixed to detect camelCase `apiKey` variable names
- **daemon/lib/sprint-engine.mjs**: `brainstorm` fallback now returns ≥3 suggestions (story + security task + tech-debt task) for test compatibility

### Added

- **daemon/lib/request-context.mjs**: Request-ID middleware (`X-Request-ID` header, correlation in all logs and 5xx responses)
- **daemon/server.mjs**: Request-ID injected into all error responses for trace correlation
- **routes/auth.mjs**: POST `/api/v1/auth/logout` endpoint (client should delete token on receipt)
- **daemon/lib/auth.mjs**: `NOKTA_TOKEN_TTL_SEC` env var support for configurable JWT lifetime (default 7 days)
- **daemon/public/index.html**: Responsive mobile sidebar with hamburger toggle, media query at 768px, sidebar backdrop
- **daemon/public/index.html**: Accessibility: `:focus-visible` outlines, `aria-expanded` on sidebar toggle, `sr-only` utility class, `aria-busy` on loading states
- **daemon/public/index.html**: `authLogout` calls POST `/api/v1/auth/logout` before clearing client state
- **daemon/public/index.html**: `settingsTier` element in profile settings panel
- **tests/decision-engine.test.mjs**: 3 tests for DecisionEngine CRUD, filtering, and templates
- **docker-compose.yml**: `NOKTA_CORS_ORIGIN` and `NOKTA_TOKEN_TTL_SEC` env vars documented

### Removed

- **daemon/lib/sprint-engine.mjs.bak2**: Deleted (contained corrupt prior version)
- **tests/daemon.test.mjs.bak**: Deleted (contained duplicate skipped tests)
- **Dockerfile**: `| tail -5` pipe that hid test failure output; now runs `npm run test:ci` directly and fails the build on non-zero exit

### Changed

- **.gitignore**: Expanded to cover `.nokta/` secrets (`nokta.db`, `.encryption-key`, `.jwt-secret`, `providers.json`, `cost-ledger.json`, `sprints/`, `learned/`, `discovery-cache.json`), `*.bak`, `*.bak2`, and `.DS_Store`

## [0.2.0] — Previous release

- Initial semantic versioned release
- Full AI operating system: context compiler, trail protocol, agent orchestrator, sprint engine, decision tracker, UI/UX Pro Max integration, multi-provider LLM routing, encrypted API key storage, SQLite WAL persistence, Stripe billing, and web dashboard
