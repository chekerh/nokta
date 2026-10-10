# Authentication & Security Audit

**Generated**: 2026-09-28  
**Scope**: `daemon/lib/auth.mjs`, `daemon/lib/token-blacklist.mjs`, route protection

---

## Current Implementation

### JWT Token System (`auth.mjs`)

**Algorithm**: HS256 (HMAC-SHA256)  
**Token Structure**: `header.body.signature` (base64url encoded)  
**Claims**: `sub` (user id), `jti` (unique token id), `iat`, `exp`  
**Expiry**: `NOKTA_TOKEN_TTL_SEC` (default 7 days = 604800 sec)  
**Secret**: `NOKTA_JWT_SECRET` env var, or auto-generated file in `.nokta/.jwt-secret`

### Password Hashing
- **Algorithm**: scrypt (N=16384, r=8, p=1) - **Strong**
- **Salt**: 16 bytes random
- **Format**: `salt:key` (hex)

### Password Policy (validatePassword)
- Min 8 characters
- Uppercase, lowercase, number, special char required
- **Good**: Reasonable baseline

### Token Blacklist (`token-blacklist.mjs`)
- SQLite table `token_blacklist` (jti, expires_at)
- Checked on every token verification
- Cleanup: manual or via `startBlacklistCleanup()` (runs every hour)

### Auth Middleware (`authMiddleware(required)`)
- Optional (`required=false`) or Required (`required=true`)
- Extracts Bearer token from Authorization header
- Verifies token, checks blacklist, loads user from DB
- Attaches `req.user` (id, email, name, role, tier)

### Role-Based Access
- `requireRole(role)` middleware
- Only checks exact role match (no hierarchy)

---

## Security Assessment

### ✅ Strengths

| Area | Implementation | Rating |
|------|----------------|--------|
| Password Hashing | scrypt with high cost params | **Excellent** |
| Timing-safe comparison | `crypto.timingSafeEqual` | **Excellent** |
| Token blacklist | DB-backed, checked on verify | **Good** |
| JWT expiry validation | Checked on every verify | **Good** |
| Password policy | Enforced on registration | **Good** |
| Secret generation | Auto-generates secure random in dev | **Good** |
| Production secret enforcement | Throws if not set in production | **Good** |

### ❌ Vulnerabilities & Issues

#### Critical

| Issue | Location | Impact | Fix |
|-------|----------|--------|-----|
| **No JWT secret rotation** | `getSecret()` | If secret compromised, all tokens valid until expiry | Implement key rotation with key ID (kid) in header |
| **Single secret for all tokens** | `getSecret()` | No way to revoke all tokens without changing secret | Multiple keys with rotation schedule |
| **Blacklist in SQLite only** | `token-blacklist.mjs` | Not replicated, lost on DB corruption | Redis or persistent replicated store |
| **No refresh token mechanism** | - | Long-lived access tokens (7 days) = higher risk | Implement refresh token flow |
| **No rate limiting on login** | `auth.mjs` routes | Brute force possible | Add login-specific rate limit (login-rate-limit.mjs exists but unused) |

#### High

| Issue | Location | Impact | Fix |
|-------|----------|--------|-----|
| **HS256 only (no RS256)** | `auth.mjs` | Symmetric key - any service with secret can mint tokens | Consider RS256 for multi-service |
| **No token binding to client** | - | Token replay possible if stolen | Add device fingerprint / IP binding |
| **Role check is exact match** | `requireRole()` | No role hierarchy (admin > user) | Implement role hierarchy |
| **No MFA support** | - | Single factor only | Add TOTP/WebAuthn |
| **Session table unused** | `sessions` table | JWT is stateless, sessions table orphaned | Remove or implement session tracking |

#### Medium

| Issue | Location | Impact | Fix |
|-------|----------|--------|-----|
| **Token expiry hardcoded default** | `TOKEN_EXPIRY_SEC` | 7 days may be too long for sensitive ops | Configurable per-role/operation |
| **No password history** | - | Reuse of compromised passwords possible | Track last N hashes |
| **No account lockout** | - | Brute force on login | Implement failed attempt tracking |
| **Email not verified** | `auth.mjs` register | Fake accounts possible | Add email verification flow |
| **No password reset** | - | Account recovery impossible | Add secure reset flow |

#### Low

| Issue | Location | Impact | Fix |
|-------|----------|--------|-----|
| **JWT `sub` is user ID** | `createToken()` | Predictable, info leak | Use opaque identifier |
| **No audience/issuer claims** | - | Token misuse across services | Add `aud`, `iss` claims |
| **No CORS on auth endpoints** | server.mjs | - | Already handled by global CORS |

---

## Route Protection Analysis

### Public Endpoints (No Auth)
| Endpoint | Method | Protection |
|----------|--------|------------|
| `/health` | GET | None |
| `/api/v1/health` | GET | None |
| `/api/v1/auth/login` | POST | None |
| `/api/v1/auth/register` | POST | None |
| `/api/v1/openapi.json` | GET | None |
| `/api/v1/docs` | GET | None |
| `/api/v1/billing/config` | GET | None |
| `/api/v1/docs` | GET | None |
| `/` (static) | GET | None |
| `/index.html` | GET | None |
| `/settings.html` | GET | None |
| `/lib/*` | GET | None |
| `/assets/*` | GET | None |

### Protected Endpoints (Auth Required)
All other routes use `authMiddleware(true)` either globally or per-route.

### Admin Endpoints
- `/api/v1/admin/*` - Uses `requireRole('admin')` (need to verify)

---

## Attack Surface Analysis

### Authentication Bypass Vectors
1. **JWT algorithm confusion** - Not applicable (HS256 only, no `alg` header parsing)
2. **Weak secret** - Auto-generated 32-byte hex (256 bits) - **Strong**
3. **Token replay** - Possible within 7-day window if token stolen
4. **Blacklist race condition** - Token verified, then blacklisted, then used again before next check - **Low risk**

### Injection Vectors
1. **SQL Injection** - All queries parameterized ✓
2. **Command Injection** - `shell` step in executor uses `execFileSync` with array args ✓
3. **Path Traversal** - `scope-enforcer.mjs` validates paths ✓
4. **XSS** - API returns JSON, no HTML rendering ✓

### Data Exposure
1. **Provider API keys** - Encrypted in DB (AES-GCM) ✓
2. **User passwords** - scrypt hashed ✓
3. **JWT tokens** - Only in Authorization header, not logged ✓

---

## Compliance Gaps

| Standard | Requirement | Status |
|----------|-------------|--------|
| OWASP ASVS 2.1 | Password strength | ✅ |
| OWASP ASVS 2.2 | Password storage (scrypt) | ✅ |
| OWASP ASVS 2.3 | Multi-factor auth | ❌ |
| OWASP ASVS 2.4 | Password reset | ❌ |
| OWASP ASVS 3.1 | Session timeout | ⚠️ (7 days) |
| OWASP ASVS 3.2 | Token revocation | ✅ (blacklist) |
| OWASP ASVS 3.4 | Secure token storage | ✅ (HttpOnly not applicable for API) |
| GDPR | Right to erasure | ⚠️ (CASCADE delete but no API) |
| GDPR | Data portability | ❌ |

---

## Recommendations Priority

### Immediate (Before Production)
1. [ ] Implement login rate limiting (use `login-rate-limit.mjs`)
2. [ ] Add refresh token flow (short access + long refresh)
3. [ ] Implement JWT key rotation (kid in header, multiple keys in DB)
4. [ ] Add password reset flow
5. [ ] Add email verification on registration

### Short-term
6. [ ] Migrate to RS256 for multi-service readiness
7. [ ] Add account lockout after failed attempts
8. [ ] Implement password history (last 5)
9. [ ] Add MFA support (TOTP)
10. [ ] Reduce default token expiry (1-2 hours for access tokens)

### Medium-term
11. [ ] Add device fingerprinting / IP binding for tokens
12. [ ] Implement session tracking (use `sessions` table)
13. [ ] Add audit logging for auth events
14. [ ] Implement role hierarchy (admin > manager > user)
15. [ ] Add GDPR erasure/portability endpoints

### Code Quality
16. [ ] Extract token verification to separate module for testing
17. [ ] Add unit tests for all auth functions
18. [ ] Add integration tests for auth flows