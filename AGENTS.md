# Nokta — AI Operating System

## What Is Nokta

Nokta is a reusable autonomous AI company operating system. It takes a project, understands the business and source code, creates a virtual company around that project, discovers useful work, delegates work to specialist agents, verifies results with independent agents, persists state, updates documentation, and continues working without requiring human prompting.

## Architecture

```
NOKTA AI COMPANY OS
├── canonical policies
│   ├── source-driven-development
│   ├── doubt-driven-verification
│   ├── context-engineering
│   ├── loop-engineering
│   └── concise-output
├── company roles (25 agents)
│   ├── Executive: CEO, Chief of Staff
│   ├── Business: Product, Strategy, Finance, Growth, Investor, Legal
│   ├── Engineering: CTO, Frontend, Backend, Database, DevOps, Cloud, Performance, AI/Data, Release
│   ├── Quality: QA, Security, Reviewer
│   └── Support: Tech Writer, Repo Archaeologist
├── task protocol (structured packets)
├── loop protocol (discover→plan→execute→verify→document→persist)
├── state protocol (persistent company state)
└── adapters
    └── opencode (current harness)
```

## Skills

| Skill | Purpose |
|-------|---------|
| loop-engineering | Autonomous loop with discover→plan→execute→verify cycles |
| source-driven-development | Verify from source before making claims |
| doubt-driven-verification | Challenge every claim with structured doubt |
| context-engineering | Optimize context flow to each agent |
| concise-output | Minimize token usage — no preamble, no postamble |

## Agent Model Routing

| Tier | Model | Use For |
|------|-------|---------|
| Orchestrator | mimo-v2.5-free | CEO, Chief of Staff |
| Senior Architecture | nemotron-3-ultra-free | CTO, Security, Database, Reviewer, Cloud |
| Implementation | deepseek-v4-flash-free | Frontend, Backend, QA, DevOps, Performance |
| Fast Worker | north-mini-code-free | Repo Archaeologist, Tech Writer |

## Separation of Duties

The executor and verifier MUST use different models. No model can author and independently certify the same change.

## Loop States

```
TRIGGERED → DISCOVERING → TRIAGING → SPECIFYING → RESEARCHING
→ PLANNING → DELEGATING → EXECUTING → VERIFYING → REVIEWING
→ RECONCILING → DOCUMENTING → PERSISTING → SELECTING_NEXT

Terminal: DONE, BLOCKED_*, WAITING_*, RATE_LIMITED, BUDGET_EXHAUSTED, PAUSED, CANCELLED
```

## Terminal Conditions

The loop stops when:
- No unblocked useful work remains
- User explicitly stopped
- System safety requires termination
- All required providers unavailable
- Budget exhausted

## File Locations

- Agents: `~/.config/opencode/agents/`
- Skills: `~/.config/opencode/skills/`
- Loop state: `docs/loop/COMPANY_STATE.md`
- Task log: `docs/loop/TASK_LOG.md`
- Blockers: `docs/loop/BLOCKERS.md`
- Model routing: `docs/company/MODEL_ROUTING.md`
- Org chart: `docs/company/ORG_CHART.md`
- Task packets: `docs/agents/TASK_PACKET.md`
- Cross-model review: `docs/agents/CROSS_MODEL_REVIEW.md`

## Running

```bash
# Start the Nokta daemon
./run_app.sh

# Start in dev mode (lint + tests first)
./run_app.sh --dev

# Run tests only
./run_app.sh --test

# Check daemon status
./run_app.sh --status

# Stop daemon
./run_app.sh --stop

# Docker mode
./run_app.sh --docker
```
