# Nokta AI Operating System

[![CI/CD](https://github.com/chekerh/nokta/actions/workflows/ci.yml/badge.svg)](https://github.com/chekerh/nokta/actions/workflows/ci.yml)
[![Security](https://img.shields.io/badge/security-0%20vulns-00c853)](https://github.com/chekerh/nokta/security)
[![License](https://img.shields.io/badge/license-MIT-00c853)](LICENSE)

Nokta is a best-practice operating system for AI software agents. It gives Codex,
Claude, Cursor, Sahara, and future tools a shared way to work like disciplined
senior engineers: evidence first, token efficient, security aware, test driven,
and always resumable through file-backed trails.

Nokta is not a personal coding-style notebook. Its defaults are broad software
engineering practices, with optional local overlays added later when a project
needs them.

## What Nokta Provides

- A context compiler that scans a target project and selects only the relevant
  operating rules, stack packs, and agent instructions.
- A trail-file protocol so every agent can resume from durable project state
  instead of relying on hidden chat history.
- Hard gates for preflight, evidence, mutation, token budget, security,
  verification, and handoff.
- Adapters for Codex, Claude, Cursor, and Sahara.
- A fork-and-modify path for ECC, keeping upstream strengths while adding Nokta's
  stricter trail and gate model.

## Quick Start

Run the test suite:

```bash
npm test
```

Compile context for a project:

```bash
node compiler/nokta-compile.mjs --target /path/to/project --adapter codex --task "fix failing tests"
```

Write compiled context into a project:

```bash
node compiler/nokta-compile.mjs --target /path/to/project --adapter codex --out /path/to/project/.ai/compiled-context.md
```

Check trail gates for a project:

```bash
node compiler/nokta-gates.mjs --target /path/to/project
```

## Core Workflow

Every agent follows:

```text
Orient -> Plan -> Act -> Verify -> Record -> Handoff
```

"Think" means leaving concise, useful engineering notes in the trail:
hypotheses, evidence, decisions, risks, validation, and next actions. It does
not require exposing hidden chain-of-thought.

## Repository Map

- `OPERATING-SYSTEM.md` defines universal agent behavior.
- `schemas/` contains JSON schemas for packs, agents, trails, compiled context,
  and gates.
- `packs/` contains curated rules and capability packs.
- `agents/` defines agent roles and handoff contracts.
- `compiler/` scans a project, selects packs, emits compact context, and checks
  trail gates.
- `adapters/` contains target-tool instructions.
- `trail-template/` contains reusable trail files for downstream projects.
- `.ai/trail/` is this repo's own live trail.
- `sources/` records upstream references and import policy.
- `upstream/ecc/` is reserved for a later ECC fork or vendor import.

## Upstream Inspiration

Nokta intentionally learns from ECC's skills, agents, token economics, and
security posture, but does not load the full ECC corpus by default. The compiler
selects only what the current project and task need.
