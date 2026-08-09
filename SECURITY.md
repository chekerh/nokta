# Nokta — Security Policy

> Security is a core design principle at Nokta. This document outlines our security practices, known security considerations, and how to report vulnerabilities.

## Reporting Security Vulnerabilities

**Please do not report security issues in public GitHub issues.**

Report vulnerabilities directly to: **security@nokta.ai**

Expected response times:

- **Critical** (RCE, data breach, credential theft): 24 hours
- **High** (authentication bypass, data exposure): 48 hours
- **Medium** (privilege escalation, information disclosure): 5 business days
- **Low** (minor issues, UX): Next release

### What to Include in a Report

1. Description of the vulnerability
2. Steps to reproduce
3. Affected version(s)
4. Potential impact
5. Suggested fix (if any)

### What to Expect

- Acknowledgment within 24 hours
- Regular updates on fix progress
- Credit in release notes (unless you prefer anonymity)
- Thank you gift for critical findings (license, merchandise)

---

## Security Design Principles

### 1. Local-First Data Processing

**Nokta processes everything locally.** Your code, project context, and data never leave your infrastructure by default.

- Compiled context is stored in `.nokta/` on your machine
- Trail files stay in your project directory
- Database (`nokta.db`) is local

### 2. Secrets Never Leave the Machine

**Provider API keys are encrypted and never transmitted.**

- Keys encrypted with AES-256-GCM using a key only you control
- If `NOKTA_ENCRYPTION_KEY` is not set, it's generated locally and stored with `0600` permissions
- We never receive, log, or have access to your API keys

### 3. No Telemetry

**Nokta collects no usage data, crash reports, or analytics.**

- No third-party analytics
- No crash reporting services
- No usage tracking
- Offline-only operation (no network calls except to your configured AI providers)

### 4. Defense in Depth

Multiple security layers:

- Authentication (JWT with scrypt password hashing)
- Authorization (tier-based access control)
- Encryption (AES-256-GCM for stored secrets)
- Rate limiting (per-IP, per-user limits)
- Input validation (Zod schema validation on all inputs)
- SQL parameterization (no SQL injection)
- CORS controls (configurable origin restriction)

---

## Configuration Security

### Required: Encryption Key

```bash
# Generate a secure encryption key
openssl rand -hex 32
```

Set in environment:

```bash
NOKTA_ENCRYPTION_KEY=your-generated-key
```

Without this key, Nokta auto-generates one — but the auto-generated key is stored on the same machine, providing limited protection against disk theft.

### Required: JWT Secret

```bash
# Generate a secure JWT secret
openssl rand -hex 64 | head -c 64
```

Set in environment:

```bash
NOKTA_JWT_SECRET=your-jwt-secret
```

### Required: API Key

Set a server-to-server API key for programmatic access:

```bash
NOKTA_API_KEY=$(openssl rand -hex 32)
```

### Recommended: CORS Origin

Restrict CORS to your frontend domain (not `*`):

```bash
NOKTA_CORS_ORIGIN=https://your-frontend.com
```

---

## Authentication & Authorization

### Password Storage

- Passwords hashed with scrypt (N=16384, r=8, p=1)
- Salt: 16 bytes random per password
- Derived key: 64 bytes
- Format: `salt:hash` (both hex-encoded)

### JWT Tokens

- Algorithm: HS256
- Expiry: Configurable (default 7 days)
- Payload: `{ sub: userId, email, role, iat, exp }`
- Storage: Client-side (localStorage or httpOnly cookie recommended)

### Tier-Based Access Control

| Feature                   | Free | Pro | Enterprise |
| ------------------------- | ---- | --- | ---------- |
| Authenticated access      | Yes  | Yes | Yes        |
| Rate limit (requests/min) | 30   | 300 | 1000       |
| Token budget (daily)      | 100K | 1M  | 5M         |
| Max projects              | 1    | 10  | Unlimited  |

### Rate Limiting

- Per-IP rate limiting on auth endpoints (5 attempts/minute for login)
- Per-user rate limiting based on tier
- Global rate limiting via `NOKTA_RATE_LIMIT`

---

## Known Security Considerations

### 1. Local Storage of Secrets

**Risk:** If an attacker has disk access, they may access `.nokta/` directory.

**Mitigations:**

- Set `NOKTA_ENCRYPTION_KEY` with a key from a secrets manager
- Use file permissions (`chmod 600 .nokta/.encryption-key`)
- Gitignore `.nokta/` directory
- Consider full-disk encryption (FileVault, LUKS)

**Severity:** Medium (requires physical/disk access)

### 2. No Built-in MFA

**Risk:** Stolen credentials allow full account access.

**Mitigation:** Use a strong, unique password. We recommend TOTP-based MFA (roadmap item).

**Severity:** Medium (mitigated by strong password policy)

### 3. API Key in Environment Variables

**Risk:** Environment variables can be exposed via `/proc/<pid>/environ` on some systems.

**Mitigation:**

- Use secrets management (HashiCorp Vault, AWS Secrets Manager)
- Run Nokta as a dedicated user with restricted permissions
- Consider secret rotation

**Severity:** Low (mitigated by environment variable access controls)

### 4. SQLite Database on Shared Filesystem

**Risk:** In multi-instance setups, SQLite on NFS may have locking issues.

**Mitigation:**

- Use local filesystem (recommended)
- Use WAL mode (already enabled)
- For multi-instance: use NFS with `PRAGMA busy_timeout` or migrate to PostgreSQL (roadmap)

**Severity:** Low (architectural limitation, mitigated by deployment choices)

### 5. WebSocket Events

**Risk:** SSE endpoint for agent events could be used for information disclosure.

**Mitigation:**

- Authenticated access required
- Request ID tracked for audit
- Event data scoped to user's authorized resources

**Severity:** Low (properly scoped and authenticated)

---

## Secure Deployment Checklist

Before deploying to production:

- [ ] `NOKTA_ENCRYPTION_KEY` set with a cryptographically random 32-byte hex key
- [ ] `NOKTA_JWT_SECRET` set with at least 32 random characters
- [ ] `NOKTA_API_KEY` set for server-to-server authentication
- [ ] `NOKTA_CORS_ORIGIN` restricted to your frontend domain
- [ ] `NOKTA_LOG_LEVEL` set to `info` or `warn` (not `debug`)
- [ ] Database file permissions set to `600`
- [ ] `.nokta/` directory gitignored
- [ ] Running as non-root user
- [ ] TLS configured for any non-localhost access
- [ ] Rate limiting enabled (default: 100/min)
- [ ] No default passwords
- [ ] Provider API keys set via environment, not in config files
- [ ] Firewall blocks non-localhost access to daemon port

---

## Compliance

### GDPR

Nokta is a local-first application. Your data never touches our servers. GDPR compliance is primarily about:

- Your project data: stored locally by you
- User account data: stored in local SQLite database
- Provider API usage: subject to your AI provider's GDPR compliance

### SOC 2

For SOC 2 compliance with Nokta Enterprise:

- Self-hosted deployment option ensures data never leaves your infrastructure
- Audit logs track all actions with user, timestamp, and request ID
- Encryption at rest with customer-controlled keys
- SSO/SAML integration for enterprise identity management

### HIPAA

For HIPAA-compliant environments:

- Self-hosted deployment is required
- All PHI stays within your network
- Audit logs provide access tracking
- No third-party data sharing

---

## Dependencies

Nokta's production dependencies are kept minimal:

| Package | Purpose          | Security Note            |
| ------- | ---------------- | ------------------------ |
| express | HTTP server      | Use latest 5.x           |
| cors    | CORS control     | Configured restrictively |
| helmet  | Security headers | Defaults are reasonable  |

Run security audits:

```bash
npm audit
npm audit --production
```

---

## Security Updates

Security vulnerabilities are patched in:

- **Critical:** Within 24 hours of report
- **High:** Within 7 days
- **Medium:** Next minor release
- **Low:** Next release

Watch this repository for security releases. Subscribe to notifications at: https://github.com/nokta-ai/nokta/security/advisories

---

## Penetration Testing

External security assessments conducted annually. Last assessment: TBD

If you'd like to conduct your own assessment, contact security@nokta.ai for collaboration guidelines.

---

## Contact

**Security issues:** security@nokta.ai

**General security questions:** security@nokta.ai

**PGP Key:** (available on keyserver)

**HackerOne:** (TBD - Bounty program pending)

---

_Last updated: 2026-06-29_
_Version: 0.3.0_
