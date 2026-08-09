# Nokta Edge Cases & Unhandled Scenarios: Complete Coverage

## Purpose

This document catalogs every known gap, unhandled edge case, and failure scenario across all engineering domains. It serves as the **definitive reference** for hardening Nokta before production use.

---

## 1. SecOps: Security Edge Cases

### 1.1 Injection & Input Validation

| Gap                                 | Current State                                                                                          | Risk                                                                     | Fix                                                            |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ | -------------------------------------------------------------- |
| **Shell command injection**         | `executor.mjs` passes `step.command` directly to `execSync()` with zero sanitization                   | RCE — AI-generated `"; rm -rf /"` executes                               | Implement command allowlist + sandbox execution                |
| **Path traversal in edit step**     | `executor.mjs` resolves paths via `path.resolve()` but never verifies the path is within `projectRoot` | Arbitrary file write — `file: "../../etc/passwd"` writes outside project | Always validate `resolvedPath.startsWith(projectRoot)`         |
| **PR step command injection**       | `executor.mjs` line 138 interpolates `prTitle` and `prBody` into shell command strings                 | RCE via GitHub — title containing `"; rm -rf /; "`                       | Use `execFileSync` with array args, never string interpolation |
| **`process.env` leaked to workers** | `job-queue.mjs` passes entire `process.env` to spawned workers                                         | Credential theft — `NOKTA_ENCRYPTION_KEY`, `OPENAI_API_KEY` exposed      | Whitelist safe env vars, never pass full env                   |
| **Prompt injection bypass**         | `gate-keeper.mjs` uses regex patterns that are trivially bypassed with encoding                        | Malicious prompts execute code                                           | NLP-based detection + blocklists for encoded variants          |
| **No input validation on API**      | All routes accept arbitrary JSON with no type checking                                                 | Unexpected behavior, crashes                                             | Add Zod/Joi schemas for all endpoints                          |
| **CORS `origin: *`**                | `server.mjs` allows any origin                                                                         | CSRF, data theft                                                         | Restrict to known origins or localhost                         |

### 1.2 Authentication & Authorization

| Gap                                            | Current State                                    | Risk                                    | Fix                                                 |
| ---------------------------------------------- | ------------------------------------------------ | --------------------------------------- | --------------------------------------------------- |
| **No session revocation**                      | JWT tokens valid for 7 days with no blacklist    | Compromised token usable for 7 days     | Implement token blacklist on logout/password change |
| **No login rate limiting**                     | `/auth/login` has no brute-force protection      | Password brute-force                    | Add rate limit: 5 attempts/min per IP               |
| **No account lockout**                         | No lockout after failed login attempts           | Brute-force attack                      | Lock account after 10 failed attempts               |
| **Non-constant-time comparison**               | `auth.mjs` uses `===` for hex comparison         | Token timing attack                     | Use `crypto.timingSafeEqual()`                      |
| **No password complexity**                     | Users can set trivially weak passwords           | Account compromise                      | Enforce min 12 chars, mixed case, numbers           |
| **No session invalidation on password change** | Old JWTs remain valid after password change      | Stale access                            | Invalidate all sessions on password change          |
| **No RBAC enforcement**                        | `users.role` field exists but no route checks it | Privilege escalation                    | Add role checks to admin routes                     |
| **JWT secret never rotated**                   | `.jwt-secret` file generated once, never rotated | All tokens compromised if secret leaked | Auto-rotate every 90 days                           |
| **Helmet CSP disabled**                        | `contentSecurityPolicy: false`                   | XSS attacks                             | Enable CSP with proper directives                   |

### 1.3 Cryptography

| Gap                                | Current State                                               | Risk                           | Fix                                         |
| ---------------------------------- | ----------------------------------------------------------- | ------------------------------ | ------------------------------------------- |
| **Master key on disk unencrypted** | `NOKTA_ENCRYPTION_KEY` stored as raw file                   | All provider keys compromised  | Use OS keychain or hardware security module |
| **No key rotation**                | Encryption key permanent once generated                     | Cannot rotate after compromise | Implement key rotation with re-encryption   |
| **Static salt in key derivation**  | `crypto.mjs` uses hardcoded `'nokta-salt'`                  | Weaker key derivation          | Generate per-user random salt               |
| **API keys held in memory**        | `ProviderManager` holds decrypted keys for process lifetime | Memory dump exposes keys       | Zero buffers after use, decrypt on-demand   |
| **No integrity check on key file** | Bit-flip on key file causes silent failures                 | Corrupted encryption           | Add HMAC integrity check                    |

### 1.4 Data Exposure

| Gap                                | Current State                                 | Risk                      | Fix                              |
| ---------------------------------- | --------------------------------------------- | ------------------------- | -------------------------------- |
| **Cost ledger plaintext**          | `~/.nokta/cost-ledger.json` unencrypted       | Spending patterns exposed | Encrypt at rest                  |
| **Sprint data plaintext**          | Sprint items stored as unencrypted JSON       | Project data exposed      | Encrypt at rest                  |
| **GitHub token in error messages** | `executor.mjs` may log tokens in error output | Token leak                | Sanitize all error messages      |
| **No HTTPS enforcement**           | Server runs on plain HTTP                     | MITM attacks              | TLS termination or reverse proxy |
| **No request size limits**         | Beyond Express 1MB default                    | DoS via large payloads    | Enforce per-endpoint limits      |

### 1.5 Supply Chain Attacks

| Scenario                           | Current State                                 | Risk                            | Fix                                    |
| ---------------------------------- | --------------------------------------------- | ------------------------------- | -------------------------------------- |
| **Malicious npm package**          | No dependency auditing                        | Backdoor in dependencies        | `npm audit` + `snyk` in CI             |
| **Compromised LLM provider**       | No response validation                        | Malicious code in LLM output    | Code signing + review before execution |
| **Poisoned skill files**           | `skills/` directory loaded without validation | Malicious instructions injected | Skill integrity verification           |
| **Man-in-the-middle on LLM calls** | No certificate pinning                        | Response interception           | TLS + certificate pinning              |

### 1.6 Advanced Attack Vectors

| Scenario                           | Description                                                                   | Fix                               |
| ---------------------------------- | ----------------------------------------------------------------------------- | --------------------------------- |
| **Data exfiltration via prompts**  | Attacker crafts prompts that cause LLM to include sensitive data in responses | Monitor output for PII patterns   |
| **Reverse prompt injection**       | Malicious LLM response contains instructions that trick the agent             | Treat LLM output as untrusted     |
| **Timing attacks on rate limiter** | Attacker measures response times to infer rate limit state                    | Constant-time responses           |
| **Unicode confusables**            | `ign0re all prior instructions` in visually similar characters                | Normalize Unicode before matching |
| **Token exhaustion**               | Send requests with maximum context to drain budget                            | Enforce per-request token limits  |

---

## 2. DBOps: Database Edge Cases

### 2.1 Database Connection & Reliability

| Gap                                      | Current State                                        | Risk                      | Fix                                        |
| ---------------------------------------- | ---------------------------------------------------- | ------------------------- | ------------------------------------------ |
| **Synchronous SQLite blocks event loop** | `node:sqlite` DatabaseSync blocks on every operation | Server freezes under load | Worker thread or async wrapper             |
| **No connection health checks**          | No verification DB is alive                          | Silent failures           | Periodic health pings                      |
| **No automatic reconnection**            | DB corruption crashes the process                    | Unrecoverable state       | Reconnection + fallback to backup          |
| **WAL file grows unbounded**             | No checkpoint management                             | Disk exhaustion           | Periodic `PRAGMA wal_checkpoint(TRUNCATE)` |
| **No database backup**                   | No export mechanism                                  | Irrecoverable data loss   | Automated backup to `.nokta/backups/`      |
| **Busy timeout not retried**             | `prepare()` throws on busy timeout                   | Unhandled exceptions      | Retry with exponential backoff             |

### 2.2 Schema & Migrations

| Gap                                              | Current State                                     | Risk                             | Fix                             |
| ------------------------------------------------ | ------------------------------------------------- | -------------------------------- | ------------------------------- |
| **No DOWN migrations**                           | Migrations are non-reversible                     | Cannot rollback broken migration | Implement `down` functions      |
| **No transaction wrapping**                      | Partial migration failure leaves corrupted schema | Schema corruption                | Wrap migrations in transactions |
| **No UNIQUE on (user_id, root_path)**            | Duplicate project registrations possible          | Data duplication                 | Add UNIQUE constraint           |
| **No index on agent_runs.project_root**          | Slow queries by project                           | Performance                      | Add index                       |
| **No index on provider_keys(user_id, provider)** | Slow compound queries                             | Performance                      | Add compound index              |
| **No migration testing**                         | Migrations untested in CI                         | Schema breakage in production    | Add migration test suite        |

### 2.3 Data Integrity

| Gap                              | Current State                                                | Risk                      | Fix                           |
| -------------------------------- | ------------------------------------------------------------ | ------------------------- | ----------------------------- |
| **JSON.parse without try/catch** | `user-brain.mjs` crashes on corrupted JSON                   | Entire brain inaccessible | Graceful fallback to defaults |
| **Non-atomic file writes**       | `sprint-engine.mjs` uses `fs.writeFile()` (truncate + write) | Data corruption on crash  | Write-to-temp + `fs.rename()` |
| **Cost ledger non-atomic**       | Same truncation issue                                        | Cost history corrupted    | Atomic writes                 |
| **Agent runs non-atomic**        | Same issue                                                   | Run history corrupted     | Atomic writes                 |
| **No data validation on read**   | Corrupted data loaded without validation                     | Crashes                   | Schema validation on load     |

### 2.4 Concurrency

| Gap                                      | Current State                       | Risk                       | Fix                        |
| ---------------------------------------- | ----------------------------------- | -------------------------- | -------------------------- |
| **In-memory locks not cross-process**    | `lock.mjs` is process-local         | Data races in cluster mode | File-based or Redis locks  |
| **Lock not released on exception**       | `releaseLock` not in finally block  | Deadlock                   | Wrap in try/finally        |
| **Shared mutable state in SprintEngine** | `this._data` shared across requests | Race conditions            | Request-scoped copies      |
| **Rate limiter not cross-process**       | In-memory Maps                      | Rate limit bypass          | Redis-backed rate limiting |

### 2.5 Cleanup & Retention

| Gap                       | Current State               | Risk                    | Fix                        |
| ------------------------- | --------------------------- | ----------------------- | -------------------------- |
| **No session cleanup**    | Expired sessions accumulate | Disk exhaustion         | Cron job to purge          |
| **No cost log retention** | `cost_logs` grows unbounded | Performance degradation | TTL + archival             |
| **No agent run cleanup**  | Old runs never purged       | Disk exhaustion         | Retention policy (90 days) |
| **No audit log rotation** | Audit events grow unbounded | Memory exhaustion       | Cap + archive              |

### 2.6 Recovery Scenarios

| Scenario                                    | Current Handling            | Fix Needed                  |
| ------------------------------------------- | --------------------------- | --------------------------- |
| **SQLite file corrupted**                   | No recovery                 | Backup + WAL replay         |
| **Disk full during write**                  | Silent failure              | Pre-flight disk space check |
| **Power loss mid-write**                    | Data corruption             | Atomic writes + WAL         |
| **Concurrent writes from multiple daemons** | Data corruption             | File-based locking          |
| **Schema migration failure**                | Partial schema, no rollback | Transactional migrations    |
| **Accidental deletion of .nokta directory** | All data lost               | Automated backups           |

---

## 3. FinOps: Cost Edge Cases

### 3.1 Cost Tracking

| Gap                                         | Current State                                                 | Risk                            | Fix                                  |
| ------------------------------------------- | ------------------------------------------------------------- | ------------------------------- | ------------------------------------ |
| **Estimated vs actual tokens**              | Cost based on character count \* 1.3, not actual API response | 20-40% cost discrepancy         | Use actual token counts from API     |
| **No daily spend tracking**                 | Only monthly aggregation                                      | Cannot detect daily overruns    | Add daily tracking                   |
| **No per-project cost attribution**         | File-based ledger intermingles all users                      | Cannot attribute costs          | Use DB-based cost_logs               |
| **Hardcoded model pricing**                 | `MODEL_PRICING` static                                        | Incorrect when providers change | Fetch pricing from API or config     |
| **Wrong provider attribution**              | Gemini models listed under `openai` provider                  | Incorrect cost tracking         | Fix provider mapping                 |
| **Cost tracking errors silently swallowed** | `.catch(() => {})` in chat-handler                            | Silent failures                 | Log + alert on tracking errors       |
| **No cost prediction**                      | No forecasting                                                | Users surprised by bills        | Linear regression on historical data |

### 3.2 Budget Enforcement

| Gap                               | Current State                                       | Risk                | Fix                                  |
| --------------------------------- | --------------------------------------------------- | ------------------- | ------------------------------------ |
| **No cost cap enforcement**       | `monthly_cost_limit` field exists but never checked | Runaway billing     | Check before each request            |
| **No token budget enforcement**   | `daily_token_limit` field exists but never checked  | Token exhaustion    | Check before each request            |
| **No cost alerts**                | Users not notified when approaching limits          | Unexpected overages | Email/webhook alerts at 80%/90%/100% |
| **No spending anomaly detection** | No monitoring for unusual patterns                  | Fraud/abuse         | Statistical anomaly detection        |

### 3.3 Provider Economics

| Gap                               | Current State                   | Risk                    | Fix                            |
| --------------------------------- | ------------------------------- | ----------------------- | ------------------------------ |
| **No provider cost comparison**   | Single provider per request     | Overpaying              | Multi-provider routing by cost |
| **No batch request optimization** | Individual requests             | Higher per-request cost | Batch similar requests         |
| **No cache for repeated prompts** | Same prompt sent multiple times | Wasted tokens           | Semantic cache                 |
| **No prompt compression**         | Full context every request      | Excessive tokens        | Progressive summarization      |

### 3.4 Cost Scenarios

| Scenario                                  | Current Handling            | Fix Needed                            |
| ----------------------------------------- | --------------------------- | ------------------------------------- |
| **User hits monthly limit mid-request**   | No enforcement              | Pre-flight check + graceful rejection |
| **Provider changes pricing mid-month**    | Silent miscalculation       | Fetch pricing at startup              |
| **Shared provider key, multiple users**   | Shared bucket, no isolation | Per-user quotas                       |
| **LLM returns more tokens than expected** | Cost underestimated         | Post-request reconciliation           |
| **Network timeout after tokens consumed** | Cost logged but no response | Retry with idempotency                |

---

## 4. Autonomous Loop: Execution Edge Cases

### 4.1 Infinite Loops

| Gap                                           | Current State                         | Risk                | Fix                                   |
| --------------------------------------------- | ------------------------------------- | ------------------- | ------------------------------------- |
| **File change → agent → file change → agent** | 30s rate limit only guard             | Infinite loop       | Max iterations per trigger + cooldown |
| **Auto-watcher queue grows unbounded**        | No queue depth limit                  | Memory exhaustion   | Max queue size + backpressure         |
| **No max step count per run**                 | Unlimited steps possible              | Resource exhaustion | Max 100 steps per run                 |
| **No max concurrent runs per user**           | Unlimited runs possible               | Resource exhaustion | Max 5 concurrent runs per user        |
| **Worker timeout doesn't cancel work**        | Promise rejected but work continues   | Resource waste      | Kill worker process on timeout        |
| **`cancelRun` only checks between steps**     | Long-running commands not interrupted | Runaway execution   | Process group kill                    |

### 4.2 Error Recovery

| Gap                                      | Current State            | Risk                           | Fix                              |
| ---------------------------------------- | ------------------------ | ------------------------------ | -------------------------------- |
| **Failed changes not retried**           | Lost permanently         | Incomplete tasks               | Retry queue with backoff         |
| **Stale runs never cleaned up**          | `created` status forever | DB bloat                       | Cron cleanup                     |
| **Worker crash leaves zombie processes** | No wait for exit         | Process leak                   | Wait for exit + SIGKILL fallback |
| **Job queue drops jobs on stop**         | Promises never resolved  | Memory leak                    | Resolve/reject all on stop       |
| **No partial failure handling**          | All-or-nothing execution | Wasted work on partial success | Save intermediate state          |

### 4.3 Concurrency

| Gap                                     | Current State          | Risk             | Fix                             |
| --------------------------------------- | ---------------------- | ---------------- | ------------------------------- |
| **Agent modifies watched files**        | Triggers new agent run | Infinite cascade | Filter self-triggered changes   |
| **Multiple agents edit same file**      | Race condition         | Data corruption  | File-level locking              |
| **Sprint auto-update triggers watcher** | Feedback loop          | Infinite cascade | Skip watcher during auto-update |

### 4.4 Execution Scenarios

| Scenario                                        | Current Handling           | Fix Needed                     |
| ----------------------------------------------- | -------------------------- | ------------------------------ |
| **Agent tries to delete system files**          | No protection              | Path allowlist                 |
| **Agent modifies .git directory**               | No protection              | Git directory protection       |
| **Agent creates files outside project**         | Path traversal possible    | Strict path validation         |
| **Agent runs during database migration**        | Potential conflict         | Migration lock                 |
| **Agent fails mid-way through multi-step task** | Partial state              | Rollback mechanism             |
| **Agent produces code that breaks tests**       | Re-run loop, no escalation | Max retries → human escalation |
| **Agent modifies production config**            | No protection              | Environment detection          |

---

## 5. Multi-Project: Concurrency Edge Cases

### 5.1 Isolation

| Gap                                    | Current State                      | Risk                        | Fix                        |
| -------------------------------------- | ---------------------------------- | --------------------------- | -------------------------- |
| **Same root_path for different users** | Shared SprintEngine                | Data isolation breach       | Key by user_id + root_path |
| **`setActiveProject` is global**       | One user affects all               | Cross-user contamination    | Per-request active project |
| **Shared cost ledger**                 | All users intermingled             | Cost attribution impossible | Per-user cost isolation    |
| **No namespace isolation**             | Projects share `.nokta/` namespace | Name collisions             | User-specific namespaces   |

### 5.2 Resource Management

| Gap                                         | Current State                     | Risk              | Fix                |
| ------------------------------------------- | --------------------------------- | ----------------- | ------------------ |
| **No eviction policy for project services** | Cached forever                    | Memory exhaustion | LRU eviction       |
| **No cleanup on project removal**           | Dead code (bug)                   | Resource leak     | Fix removeProject  |
| **Rate limiter bucket exhaustion**          | Unique model names exhaust memory | DoS               | Cap unique buckets |

### 5.3 Project Lifecycle

| Scenario                                | Current Handling | Fix Needed                |
| --------------------------------------- | ---------------- | ------------------------- |
| **Project moved to different path**     | Stale references | Path validation on access |
| **Project deleted while agent running** | Crash            | Graceful handling         |
| **Project re-registered after removal** | Duplicate data   | Idempotent registration   |
| **Monorepo with shared dependencies**   | No detection     | Dependency graph analysis |
| **Project with circular imports**       | No detection     | Static analysis           |

---

## 6. Semantic Layer: Vector DB Edge Cases

### 6.1 Index Integrity

| Gap                           | Risk                        | Fix                              |
| ----------------------------- | --------------------------- | -------------------------------- |
| **Index corruption**          | Silent search failures      | Checksum + rebuild               |
| **Embedding model update**    | Old embeddings incompatible | Re-index on model change         |
| **Disk full during indexing** | Partial index               | Pre-flight check + atomic writes |
| **Concurrent indexing**       | Race conditions             | Write-ahead log                  |

### 6.2 Privacy

| Gap                                        | Risk                         | Fix                        |
| ------------------------------------------ | ---------------------------- | -------------------------- |
| **Code embeddings contain sensitive data** | Vector DB leak exposes code  | Encrypt embeddings at rest |
| **Embeddings not deletable**               | Cannot remove sensitive code | Deletion support           |
| **Cross-project search leaks data**        | User A sees User B's code    | Strict isolation           |

### 6.3 Quality

| Gap                       | Risk                        | Fix                     |
| ------------------------- | --------------------------- | ----------------------- |
| **Stale embeddings**      | Outdated context injected   | Incremental re-indexing |
| **Poor chunking quality** | Irrelevant context          | AST-aware chunking      |
| **Embedding drift**       | Inconsistent search quality | Regular re-indexing     |

---

## 7. Evolution Layer: Skill Synthesis Edge Cases

### 7.1 Skill Quality

| Gap                                  | Risk                       | Fix                      |
| ------------------------------------ | -------------------------- | ------------------------ |
| **Bad pattern synthesized as skill** | Repeated mistakes          | Human approval gate      |
| **Conflicting skills**               | Contradictory instructions | Skill conflict detection |
| **Skill versioning conflicts**       | Old skills override new    | Semantic versioning      |
| **Skill degradation over time**      | Outdated patterns          | Usage-based pruning      |

### 7.2 Skill Management

| Gap                            | Risk             | Fix                               |
| ------------------------------ | ---------------- | --------------------------------- |
| **Too many skills**            | Context bloat    | Skill pruning + relevance ranking |
| **Skill format inconsistency** | Parsing failures | Strict schema validation          |
| **Skill metadata corruption**  | Broken skills    | Integrity checks                  |

---

## 8. Sandbox Layer: Isolation Edge Cases

### 8.1 Container Security

| Gap                      | Risk                  | Fix                                |
| ------------------------ | --------------------- | ---------------------------------- |
| **Container escape**     | Host compromise       | Non-root + seccomp + AppArmor      |
| **Resource exhaustion**  | DoS                   | CPU/RAM limits + OOM kill          |
| **Network exfiltration** | Data theft            | network_mode: none                 |
| **Volume escape**        | Arbitrary file access | Read-only mounts + path validation |

### 8.2 Execution

| Gap                           | Risk                        | Fix                            |
| ----------------------------- | --------------------------- | ------------------------------ |
| **Container startup timeout** | Stuck execution             | 30s startup timeout            |
| **Zombie containers**         | Resource leak               | Auto-cleanup after execution   |
| **Docker daemon unavailable** | Fallback to local execution | Graceful fallback with warning |
| **WASM runtime limitations**  | Feature gaps                | Detect capabilities at startup |

---

## 9. Cross-Cutting Concerns

### 9.1 Graceful Shutdown

| Gap                       | Current State                  | Fix                           |
| ------------------------- | ------------------------------ | ----------------------------- |
| **No SIGTERM handler**    | Process killed without cleanup | Signal handler + drain period |
| **No request draining**   | In-flight requests killed      | 30s drain period              |
| **Workers not waited on** | Zombie processes               | Wait for worker exit          |
| **DB not closed**         | Potential corruption           | Close DB in shutdown handler  |
| **Watchers not stopped**  | File events after shutdown     | Stop all watchers             |

### 9.2 Logging & Observability

| Gap                       | Current State                | Fix                           |
| ------------------------- | ---------------------------- | ----------------------------- |
| **No request tracing**    | Cannot correlate logs        | Add request ID propagation    |
| **No metrics**            | Cannot monitor performance   | Prometheus/StatsD integration |
| **No health check depth** | Shallow health check         | Check DB, disk, memory        |
| **No log shipping**       | Logs only local              | ELK/Datadog integration       |
| **No audit trail**        | Cannot investigate incidents | Structured audit logging      |

### 9.3 Configuration

| Gap                            | Current State           | Fix                          |
| ------------------------------ | ----------------------- | ---------------------------- |
| **No .env support**            | Manual env vars         | dotenv integration           |
| **No config validation**       | Silent misconfiguration | JSON Schema validation       |
| **No runtime reconfiguration** | Requires restart        | Hot-reload for safe settings |
| **Hardcoded limits**           | Not configurable        | External config file         |

### 9.4 Testing

| Gap                           | Current State              | Fix                      |
| ----------------------------- | -------------------------- | ------------------------ |
| **No input validation tests** | Untested edge cases        | Fuzz testing             |
| **No security tests**         | Untested vulnerabilities   | OWASP ZAP integration    |
| **No load tests**             | Unknown performance limits | k6/Artillery load tests  |
| **No chaos testing**          | Unknown failure modes      | Chaos Monkey integration |

---

## 10. Operational Scenarios (What-If Matrix)

### 10.1 Developer Workflow Scenarios

| Scenario                                     | Current Handling           | Required Fix                        |
| -------------------------------------------- | -------------------------- | ----------------------------------- |
| Developer edits AI code → AI reverts edit    | Loop detected, but slow    | Immediate pattern learning          |
| Developer works on 2 projects simultaneously | Context switching possible | Per-request project isolation       |
| Developer uses multiple IDEs at once         | Supported                  | Stateless proxy                     |
| Developer switches from Cursor to VS Code    | User brain persists        | Cross-IDE consistency               |
| Developer has slow internet                  | Proxy adds latency         | Offline mode + local models         |
| Developer's API key expires mid-session      | Error returned             | Graceful degradation + notification |
| Developer exceeds daily limit                | No enforcement             | Hard stop + notification            |

### 10.2 Code Quality Scenarios

| Scenario                                             | Current Handling              | Required Fix              |
| ---------------------------------------------------- | ----------------------------- | ------------------------- |
| AI generates code with security vulnerability        | GateKeeper scans, but limited | Full OWASP scan           |
| AI generates code that passes tests but is slow      | No performance gate           | Performance profiling     |
| AI generates code that is correct but unreadable     | No style gate                 | Style guide enforcement   |
| AI generates code with correct logic, wrong types    | Partial type checking         | Full type analysis        |
| AI generates code that works locally but fails in CI | No CI simulation              | CI environment simulation |
| AI generates duplicate code across files             | No deduplication              | Cross-file dedup check    |

### 10.3 Infrastructure Scenarios

| Scenario                     | Current Handling    | Required Fix                 |
| ---------------------------- | ------------------- | ---------------------------- |
| SQLite file corrupted        | No recovery         | Backup + WAL replay          |
| Disk full                    | Silent failure      | Pre-flight check + alert     |
| Process killed (OOM, manual) | Data loss           | Crash-safe writes + recovery |
| Multiple daemons running     | Data corruption     | File-based instance lock     |
| Clock skew between processes | Rate limiter bypass | NTP sync + tolerance         |
| DNS resolution failure       | LLM calls fail      | Offline mode + cache         |
| Provider API down            | Error returned      | Fallback providers + queue   |

### 10.4 Developer Experience Scenarios

| Scenario                                                  | Current Handling     | Required Fix                   |
| --------------------------------------------------------- | -------------------- | ------------------------------ |
| Developer uses Nokta behind corporate proxy               | No proxy support     | HTTP_PROXY/HTTPS_PROXY support |
| Developer uses Nokta with VPN                             | No VPN detection     | Auto-detect VPN interface      |
| Developer has multiple monitors, different IDEs           | Supported            | Cross-IDE context sync         |
| Developer works from two machines                         | No sync              | Optional cloud sync            |
| Developer wants to share learned patterns with team       | No sharing mechanism | Export/import brain            |
| Developer wants to see what AI is injecting               | No visibility        | Context visualization panel    |
| Developer wants to customize AI behavior per project      | Global only          | Project-specific overrides     |
| Developer wants to preview changes before AI applies them | No preview           | Dry-run mode                   |
| Developer wants to undo all AI changes                    | No undo              | AI change tracking + undo      |
| Developer wants to teach AI new patterns manually         | No manual teaching   | Pattern editor UI              |

### 10.5 Team & Collaboration Scenarios

| Scenario                                         | Current Handling      | Required Fix                                  |
| ------------------------------------------------ | --------------------- | --------------------------------------------- |
| Multiple developers on same project              | No multi-user support | Shared project brain with conflict resolution |
| Developer leaves team, new developer joins       | No onboarding         | Knowledge transfer mechanism                  |
| Team has coding standards document               | No document parsing   | Parse and enforce standards                   |
| Team uses different IDEs                         | Supported             | Cross-IDE consistency                         |
| Team wants to review AI suggestions before apply | No review mechanism   | Review queue + approval                       |
| Team wants to track AI contribution metrics      | No tracking           | AI contribution dashboard                     |
| Team wants to share skills across projects       | No sharing            | Skill registry + import/export                |
| Team wants to audit AI decisions                 | No audit              | Decision log + replay                         |

### 10.6 Compliance & Governance Scenarios

| Scenario                                    | Current Handling    | Required Fix                     |
| ------------------------------------------- | ------------------- | -------------------------------- |
| Company requires data residency (EU only)   | No region selection | Region-aware deployment          |
| Company requires SOC2 compliance            | No compliance       | SOC2 controls implementation     |
| Company requires GDPR compliance            | No GDPR             | Data export + deletion + consent |
| Company requires HIPAA compliance           | No HIPAA            | PHI detection + encryption       |
| Company requires audit trails               | No audit            | Comprehensive audit logging      |
| Company requires code review for AI changes | No review gate      | Mandatory human review           |
| Company requires IP assignment tracking     | No tracking         | Contribution tracking            |
| Company requires license compliance         | No checking         | License scanning                 |

### 10.7 Performance & Scale Scenarios

| Scenario                             | Current Handling  | Required Fix                       |
| ------------------------------------ | ----------------- | ---------------------------------- |
| Developer has 50+ projects           | Memory exhaustion | LRU eviction + lazy loading        |
| Developer has 100K+ files in project | Slow indexing     | Parallel indexing + prioritization |
| Developer makes 100+ changes/minute  | Queue overflow    | Backpressure + prioritization      |
| LLM provider has 10s latency         | User waits        | Async + streaming                  |
| Database has 1M+ cost logs           | Slow queries      | Partitioning + archival            |
| Agent run has 1000+ steps            | Memory exhaustion | Chunked execution                  |
| Multiple users share provider key    | Bucket exhaustion | Per-user quotas                    |

### 10.8 Migration & Upgrade Scenarios

| Scenario                          | Current Handling       | Required Fix                        |
| --------------------------------- | ---------------------- | ----------------------------------- |
| Upgrade Nokta version             | Manual                 | Automatic migration + rollback      |
| Migrate from SQLite to PostgreSQL | No migration           | Migration tooling                   |
| Switch LLM providers              | Manual reconfiguration | Provider migration wizard           |
| Import data from another tool     | No import              | Import from common formats          |
| Export data for migration         | No export              | Full data export                    |
| Downgrade version                 | No downgrade           | Version compatibility matrix        |
| Schema migration fails            | No rollback            | Transactional migrations + rollback |
| Config file format changes        | Breaking change        | Config migration tool               |

### 10.9 Disaster Recovery Scenarios

| Scenario                       | Current Handling    | Required Fix                         |
| ------------------------------ | ------------------- | ------------------------------------ |
| Hard drive failure             | Data loss           | Automated backup to external storage |
| Accidental deletion of .nokta  | Data loss           | Git-tracked config + backup          |
| Ransomware encrypts data       | Data loss           | Offline backup + encryption          |
| Natural disaster (data center) | Data loss           | Cloud backup option                  |
| Developer forgets password     | Account lockout     | Password reset mechanism             |
| API key provider breaches      | Key compromised     | Key rotation + emergency protocol    |
| LLM provider goes down         | Service unavailable | Multi-provider failover              |
| Internet outage                | No LLM access       | Offline mode + local models          |

### 10.10 Ethical & Safety Scenarios

| Scenario                             | Current Handling       | Required Fix                |
| ------------------------------------ | ---------------------- | --------------------------- |
| AI generates harmful code            | Basic scanning         | Enhanced content filtering  |
| AI generates biased code             | No detection           | Bias detection in output    |
| AI copies copyrighted code           | No detection           | Plagiarism detection        |
| AI leaks proprietary code            | No protection          | Code fingerprinting         |
| AI generates non-compliant code      | Basic gate             | Regulatory compliance check |
| AI makes unauthorized external calls | No restriction         | Network allowlist           |
| AI accesses files outside project    | Path traversal (fixed) | Strict sandboxing           |
| AI generates self-modifying code     | No detection           | Code mutation detection     |

| Scenario                    | Current Handling            | Required Fix                |
| --------------------------- | --------------------------- | --------------------------- |
| User cancels subscription   | No cleanup                  | Revoke access + export data |
| User requests data export   | No mechanism                | GDPR-compliant export       |
| User requests data deletion | No mechanism                | Hard delete all user data   |
| User disputes a charge      | No audit trail              | Detailed usage logs         |
| User shares account         | No detection                | Device fingerprinting       |
| User upgrades tier          | Immediate effect            | Tier migration logic        |
| User downgrades tier        | Active resources may exceed | Grace period + cleanup      |

---

## 11. Priority Matrix

### P0 — Critical (Must Fix Before Production)

1. Shell command injection in executor.mjs
2. Path traversal in executor.mjs edit step
3. `process.env` leaked to worker processes
4. PR step command injection
5. No session revocation
6. No atomic file writes (sprint, agent, cost data)
7. `removeProject` dead code (resource leak)
8. No cost cap enforcement
9. No login rate limiting
10. Non-constant-time JWT comparison

### P1 — High (Fix Before Beta)

11. No RBAC enforcement
12. No migration rollback
13. No session cleanup cron
14. CORS `origin: *`
15. No HTTPS enforcement
16. No backup/export mechanism
17. No graceful shutdown
18. No infinite loop protection
19. No max concurrent runs per user
20. JWT secret never rotated

### P2 — Medium (Fix Before v1.0)

21. Hardcoded model pricing
22. No structured logging
23. No request tracing
24. No cost prediction
25. No health check depth
26. In-memory locks not cross-process
27. No .env support
28. No config validation
29. No supply chain auditing
30. No performance profiling

### P3 — Low (Post-v1.0)

31. No log shipping
32. No metrics integration
33. No chaos testing
34. No load testing
35. No multi-modal intelligence
36. No team collaboration features
37. No enterprise SSO
38. No compliance frameworks

---

## 12. Recovery Playbooks

### 12.1 Database Corruption

```
1. Stop daemon
2. Check WAL integrity: sqlite3 nokta.db "PRAGMA integrity_check;"
3. If WAL corrupted: copy nokta.db to backup, then:
   - sqlite3 nokta.db ".dump" > backup.sql
   - rm nokta.db nokta.db-wal nokta.db-shm
   - sqlite3 nokta.db < backup.sql
4. Restart daemon
5. Verify all tables accessible
```

### 12.2 Cost Ledger Corruption

```
1. Stop daemon
2. Backup corrupted ledger: cp ~/.nokta/cost-ledger.json ~/.nokta/cost-ledger.json.corrupted
3. Reconstruct from cost_logs table:
   - sqlite3 nokta.db "SELECT * FROM cost_logs" > cost_logs.csv
4. Delete corrupted ledger (will be recreated on next save)
5. Restart daemon
```

### 12.3 Sprint Data Loss

```
1. Check .nokta/sprints/ for backup files
2. If items.json corrupted:
   - Check for items.json.bak (if atomic writes implemented)
   - Reconstruct from agent_runs table (if available)
   - Manual re-entry as last resort
3. Restart daemon
```

### 12.4 Encryption Key Compromise

```
1. STOP all services immediately
2. Rotate NOKTA_ENCRYPTION_KEY in environment
3. Re-encrypt all provider_keys with new key
   - Decrypt with old key, encrypt with new key
4. Rotate NOKTA_JWT_SECRET
5. Invalidate all sessions: DELETE FROM sessions
6. Notify all users to re-authenticate
7. Audit access logs for unauthorized access
```

### 12.5 Infinite Loop Recovery

```
1. Identify the trigger (file change, agent run, etc.)
2. Kill the daemon process
3. Clear the agent run queue: DELETE FROM agent_runs WHERE status = 'running'
4. Stop all watchers
5. Investigate the loop cause
6. Implement fix (cooldown, max iterations, etc.)
7. Restart daemon
```

### 12.6 Container Escape Recovery

```
1. STOP all sandbox containers
2. Kill the daemon process
3. Audit host filesystem for unauthorized changes
4. Check for installed backdoors
5. Rotate all credentials
6. Investigate the escape vector
7. Patch the vulnerability
8. Restart with enhanced isolation
```

---

## 13. Monitoring & Alerting Requirements

### 13.1 Critical Alerts

| Alert                         | Threshold | Action                        |
| ----------------------------- | --------- | ----------------------------- |
| Cost exceeds 80% of limit     | Warning   | Email notification            |
| Cost exceeds 95% of limit     | Critical  | Hard stop + notification      |
| Agent run fails 3+ times      | Warning   | Pause autonomous execution    |
| Agent run fails 5+ times      | Critical  | Halt all autonomous execution |
| Database connection fails     | Critical  | Restart daemon                |
| Disk space < 10%              | Critical  | Stop non-essential processes  |
| Memory usage > 80%            | Warning   | Evict caches                  |
| Memory usage > 95%            | Critical  | Restart daemon                |
| Failed login attempts > 5/min | Critical  | Block IP for 1 hour           |
| Infinite loop detected        | Critical  | Halt + notify developer       |

### 13.2 Metrics to Track

| Metric                          | Purpose                |
| ------------------------------- | ---------------------- |
| Request latency (P50, P95, P99) | Performance monitoring |
| Error rate by endpoint          | Reliability monitoring |
| Token usage by user/project     | Cost attribution       |
| Agent success rate              | Quality monitoring     |
| Database query latency          | Performance monitoring |
| File watcher event rate         | System load            |
| Memory usage over time          | Resource planning      |
| Disk usage over time            | Capacity planning      |
