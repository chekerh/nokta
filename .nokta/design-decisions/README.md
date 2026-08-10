# Design Decisions

> This directory contains Architecture Decision Records (ADRs) and design decision logs for the Nokta AI Operating System. Decisions are tracked using the [MADR (Markdown Archival Decision Records)](https://adr.github.io/) format.

## Structure

Each decision is a separate file named `NNN-decision-title.md` where `NNN` is a sequential number.

## Template

When creating a new decision record, use:

1. **Title**: short noun-verb phrase, kebab-case
2. **Status**: Proposed → Accepted → Depricated/Superseded
3. **Context**: what's the issue, constraints
4. **Decision**: what we chose
5. **Consequences**: positive/negative impacts

## Index

| #                             | Title | Status | Date |
| ----------------------------- | ----- | ------ | ---- |
| _(add as decisions are made)_ |       |        |      |

## Decision Engine Integration

Decisions feed into `daemon/lib/sprint-engine.mjs` via:

- `.nokta/learned/patterns.json` — conventions and accepted patterns
- Sprint recommendations are filtered by recorded decisions
- PR review gates check against accepted conventions

To add a new decision:

1. Copy `template.md` to `NNN-short-title.md`
2. Fill in the sections
3. Set status to "Proposed"
4. When accepted, run `cli.mjs` to record the convention (if applicable)
