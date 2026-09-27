# Nokta Delivery Plan

Where the system actually stands, what is done, and what is next — in priority
order, with the evidence behind each claim. Written against commit `abad165`
plus the agent-pack execution work.

## The constraint that shapes everything

Nokta is a system that lets a model edit a real repository. Three failure modes
are structural rather than bugs to be patched later, and they set the order of
work below.

1. **A run can destroy the system executing it.** This happened. A run asked to
   add a `/health` endpoint rewrote `daemon/server.mjs` from 256 lines to 7 and
   `daemon/index.mjs` from 84 to 3. The port conflict that looked like the cause
   was the _symptom_ of a dead daemon.

   The enabler was `daemon/lib/scope-enforcer.mjs`, which treats three separate
   cases as "allow": no scope declared, empty `allowedDirs`, and empty
   `allowedFiles`. And the enforcer is only attached to a run when a plan happens
   to include a `scope` step.

2. **A run can confidently describe things that do not exist.** A prompt step has
   no tools, so it answers from whatever text it was given. Real deliverables
   cited `src/loop.ts` in a plain-JavaScript repo, marked a non-existent
   `docs/LOOP-DESIGN.md` as "Status: Found", and claimed to have run tests.

3. **A run cannot read the repository.** Everything above follows from this. A
   prompt step receives text and returns text; it cannot open a file.

## Done and verified

| Area                        | State   | Evidence                                                            |
| --------------------------- | ------- | ------------------------------------------------------------------- |
| Authenticated run execution | working | 245 tests; `tests/agent-run-db.test.mjs`                            |
| Run loop repairs            | working | `1a3d2c8` — 217/223 tests green at commit                           |
| Planner grounding           | working | `18f2390` — real repo structure + curated skills in the prompt      |
| Run isolation               | working | `abad165` — replayed the destructive goal; live tree byte-identical |
| Agent pack execution        | working | `POST /api/v1/agents/:id/execute`, 267 packs, deliverable persisted |
| Read-only evidence step     | working | `inspect` with a command allowlist, 22 accept/refuse cases pinned   |
| Citation auditing           | working | invented paths detected and flagged on the run                      |
| Curated skill index         | working | 351 skills; `graphify` and ECC skills resolve and rank              |
| Agent catalog               | working | 267 packs, all resolvable by id, title slug, and filename           |

### Isolation model

Every run executes in `.nokta/worktrees/<run-id>` on branch `nokta/<run-id>`.
The execution context's `projectRoot` points there, so `edit`, `shell`, `scope`
and the production gate are all contained without changing their logic. The
branch and path are recorded in run metadata, so the result is reviewable with
ordinary git and survives the process.

Isolation is on by default. `NOKTA_RUN_ISOLATION=false` opts out process-wide
and `{ isolation: false }` does so per orchestrator. `NOKTA_REQUIRE_ISOLATION=true`
turns "cannot isolate" into a hard failure rather than a silent fallback to
in-place edits.

Known trade-off: **worktrees branch from HEAD, so uncommitted work is not visible
to a run.** That is deliberate — a reproducible base is worth more than scratch
work, and copying a dirty tree in would reintroduce the risk isolation removes.

### Agent pack execution

`POST /api/v1/agents/:id/execute` runs one of the 267 packs. The pack's persona
becomes the system prompt, its skills are selected from the curated index, and
the deliverable is persisted on the run under `metadata.deliverable`.

Three fixed steps per run — `inspect`, then a research prompt, then a deliverable
prompt. A pack run never receives an `edit` step, so it cannot write to the
repository and the fail-open enforcer is never consulted. Steps are fixed by the
pack rather than planned, because a planner inventing steps for a known agent
reintroduces failure mode 1.

## Next, in priority order

### 1. ~~Make `ScopeEnforcer` fail closed~~ — done

The enforcer was close to dead code, and not because of the `validateMutation`
logic that looked permissive. Three separate holes stacked:

1. **Enforcement was conditional on a `scope` step existing.** The `edit` case
   read `if (context.scopeEnforcer)`, and the enforcer was only ever constructed
   inside the `scope` case. No planner output reliably emits a scope step, so
   most runs had **no enforcer at all** and every edit was unrestricted. This was
   the actual cause of the destructive run.
2. **A scope that named nothing permitted everything.** The planner prompt
   described `scope` as "Read project scope/context. Fields: none required", so
   a model emitting one produced empty allow-lists — and the enforcer read an
   empty allow-list as "no restriction".
3. **A missing scope was explicitly allowed:** `if (!scope) return { allowed:
true, reason: 'no scope declared' }`.

All three now fail closed. An allow-list that lists nothing allows nothing, an
edit in a run with no scope is refused, `.git` / `node_modules` / `.env` are
blocked additively (so `blockedDirs: []` can no longer unlock them), and the
`edit` case always enforces and always records.

Two further bugs surfaced while writing the tests:

- `allowedDirs: ['daemon/']` matched **nothing**, because the comparison built
  `dir + '/'` unconditionally and compared against `'daemon//'`. A scope that
  looked correct silently denied every edit under it. Directory comparison is
  now slash-agnostic, and `.` means the repository root.
- `matchesPattern` interpolated the pattern straight into a `RegExp`, so `.`
  matched any character and a pattern containing `(` or `[` threw a
  `SyntaxError`. The pattern is escaped now, with `*` and `?` as the only
  wildcards.

The planner prompt now requires a scope step before any edit, and states that an
over-broad scope is a security defect rather than a shortcut.

#### Breaking change

Any plan that edits without declaring a scope now fails at execution instead of
silently proceeding. To migrate, insert a scope step before the first edit:

```json
{ "type": "scope", "allowedFiles": ["daemon/server.mjs"] }
{ "type": "scope", "allowedDirs": ["daemon/"] }
```

Use `allowedDirs: ['.']` for an intentionally repository-wide scope; the
critical directories stay blocked regardless. Plans with no `edit` step — which
is most of them, including every agent pack — are unaffected, as is the
no-chat fallback plan.

### 2. Fix the `review` step crash — P1

Found while verifying the above. A planner output of `['scope', 'edit',
'review']` completes the first two and then fails the run with
`Cannot read properties of null (reading 'reviewPR')`: the `review` case reads
`context.sprintEngine`, which is null on this path. Every plan that includes a
review step fails, so the crash is on a common shape rather than an edge case.
A one-line guard, but it belongs in its own change.

### 3. `POST /api/v1/agent-runs` creates a run and does not start it — P1

The endpoint generates steps, creates the run, and returns 201 — and the run then
sits in `created` indefinitely, because enqueueing only happens on the separate
`/execute` route. Reading the primary create endpoint, the natural expectation is
that a run begins. Either enqueue here or make the response say plainly that
execution is a separate call.

### 4. Replace prompt-only evidence with a tool-calling run — P1

`inspect` returns a fixed bundle: the file listing, recent history, and the
manifest. That is enough to stop a model inventing file paths, and not enough to
write a deep architectural summary. Deliverables are still noticeably generic
because the model has names, not contents.

The fix is a real tool loop — let the model call `read_file` and `search` and
iterate. This is the single largest quality lever left, and it is the reason
deliverables read like skill summaries rather than code analysis.

Until it exists, treat pack deliverables as **analysis from a bounded snapshot**,
not as verified architectural review. The citation audit is the safety net, and
it should be read before trusting a deliverable.

### 5. Surface isolation, deliverables and audits in the dashboard — P1

The UI does not yet show the worktree path or branch, the deliverable, or the
citation audit. The data is all on the run; nothing renders it. Until this ships,
isolation is invisible to an operator, which means a run that produced a large
diff is easy to miss.

### 6. Worktree lifecycle management — P2

Worktrees accumulate. `removeRunWorktree` works and refuses paths outside the
base directory, but there is no route or UI for it, and no retention policy.
Six accumulated during this session's testing and had to be pruned by hand.

Also needs: a review/merge path, and a decision on whether a run's branch is
auto-merged, left for review, or discarded.

### 7. Credential rotation in unreachable Git objects — P2

`origin/main` predates the `.env` ignore rule, so a credential is in local Git
history. It is not on the current branch tip. Rotation of the exposed credential
is still undone and needs a deliberate decision.

### 8. The 26 pre-existing Prettier violations — P3

Left alone deliberately; they are unrelated files and would bury the diff.

## Verification rules for this repo

- A change is not done until `npm test`, `npm run lint`, and a targeted
  `npx prettier --check` on touched files all pass.
- `npm test` must leave zero worktrees. Tests that use `process.cwd()` as the
  project root must pass `{ isolation: false }` or they will litter the repo.
- Any run that executes a model against this repository must go through a
  worktree. `NOKTA_AUTO_WATCHER=false` keeps the daemon from reacting to manual
  edits.
- Claims about model output are checked mechanically where possible. The
  citation audit exists because a prompt telling a model not to invent paths did
  not stop it.
