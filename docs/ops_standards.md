# Nokta Operational Standards (SecOps, FinOps, DBOps)

This document defines the mandatory standards for all code changes and architectural decisions within the Nokta ecosystem.

## 1. DBOps (Database Operations)

- **Storage**: All persistent data must reside in SQLite via `node:sqlite`.
- **Performance**:
  - Always enable **WAL (Write-Ahead Logging)** mode to allow concurrent readers and writers.
  - Always enable **Foreign Key** constraints to ensure referential integrity.
  - Set a **Busy Timeout** (5000ms) to prevent "database is locked" errors during concurrent agent execution.
- **Migrations**:
  - Never modify the database schema manually.
  - All changes must be implemented as versioned migrations in `daemon/db/schema.mjs`.
  - Every migration must be idempotent.

## 2. SecOps (Security Operations)

- **Credential Isolation**:
- Provider API keys must NEVER be stored in plaintext.
- All keys must be encrypted using **AES-256-GCM** with a unique nonce and authentication tag.
- The master encryption key must be provided via `NOKTA_ENCRYPTION_KEY` env var or a restricted-permission file (`0o600`).
- **Authentication**:
- All non-public endpoints must require a valid **JWT (JSON Web Token)**.
- Tokens must have a fixed expiry (7 days) and be signed with a strong secret.
- **Input Validation**:
- All user-provided input to shell commands must be strictly sanitized to prevent command injection.
- Use parameterized queries for all SQL operations.

## 3. FinOps (Financial Operations)

- **Token Accounting**:
- Every LLM request must be logged in the `cost_logs` table.
- Log input tokens, output tokens, and the exact provider/model used.
- **Budget Enforcement**:
- Implement a "hard cap" on daily token usage per user tier.
- If the limit is reached, the API must return a `429 Too Many Requests` with a `retryAfter` header.
- **Efficiency**:
- Maximize token efficiency by utilizing the `compiler` to strip redundant context.
- Prefer smaller, faster models for routing/classification and larger models only for final execution.

## 4. Code Quality (General Standards)

- **Runtime**: Node.js v22 (ES Modules).
- **Style**: Minimalist, functional, and modular. Prefer pure functions over complex classes.
- **Testing**: Every new feature must have a corresponding test in `tests/*.test.mjs`.
- **Documentation**: All new routes and core services must be documented in the `docs/` folder.
