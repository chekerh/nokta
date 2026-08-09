# Nokta — FAQ

## Product Questions

### What exactly is Nokta?

Nokta is a local-first AI operating system that compiles your project's context — architecture patterns, team standards, architectural decisions, recent changes — into compact, optimized knowledge that every AI tool can read. It runs entirely on your machine and works with any AI tool that supports the `.ai/trail/` protocol.

### How is Nokta different from just writing good prompts?

Prompt engineering works within a single session. Nokta works across sessions, across tools, and across time. When you close your laptop Friday at 6pm, your prompt is gone. Nokta's context is still there Monday morning. When you switch from Claude to Cursor, your prompts don't transfer. Nokta's compiled context does. When you need to understand a decision from 6 months ago, prompts don't help. Nokta's decision database does.

### Does Nokta work with my current AI tools?

Yes. Nokta's `.ai/trail/` protocol is designed to be read by any AI coding tool. Currently, Cursor, Claude Code, and Codex can read `.ai/trail/` files. If your specific tool doesn't support it yet, Nokta provides a context compiler that injects compiled context into any AI workflow — clipboard integration, prompt templates, or direct API calls.

### What do you mean by "context compilation"?

Context compilation is Nokta's process of scanning your project, extracting relevant information (stack, patterns, decisions, recent changes), and encoding it into a compact format optimized for AI consumption. Compiled context is typically 50-70% smaller than the raw project context with better signal-to-noise ratio.

### Is this only for teams?

No. Solo developers get enormous value from Nokta — especially the decision tracking and context compilation. When you're the only person working on 3-4 projects, Nokta ensures every AI session continues where the last one left off.

### What's the difference between Nokta and GitHub Copilot / Cursor / Claude Code?

Copilot, Cursor, and Claude Code are AI coding tools. Nokta is the infrastructure layer that makes all of them better. Think of it like the difference between having a fast car (AI tools) and having a good road system (Nokta). The car matters, but the road determines how efficiently you reach your destination.

---

## Technical Questions

### How does Nokta compile context?

Nokta runs during your project's idle time (or on-demand). It scans your codebase, git history, and decision database. It extracts:

- Stack detection (what languages, frameworks, libraries you use)
- Pattern identification (how you structure components, handle errors, write tests)
- Decision extraction (architectural choices from git commits and documented ADRs)
- Recent changes (what changed recently and why)

This is encoded into a compiled context file in `.ai/trail/` that every compatible AI tool reads.

### What happens to my code?

Your code stays on your machine. Nokta scans it to extract patterns (it reads files, it doesn't modify them) and compiles context from it. Nothing is sent to any server.

### How does the quality gate system work?

Quality gates are checks that run before AI-suggested changes are committed. You configure which gates are active:

- **Pattern gate:** Does the suggested code match your established patterns?
- **Security gate:** Does the suggested code contain obvious security issues?
- **Token budget gate:** Is this suggestion within the allocated token budget?
- **Evidence gate:** Does the suggestion include rationale/evidence?

Gates run locally and can be configured per-project. Violations don't block the AI — they flag the suggestion for review before it ships.

### What's the `.ai/trail/` protocol?

The `.ai/trail/` protocol is Nokta's way of storing project knowledge in a universal format that AI tools can read. It consists of:

- `index.md` — project overview and current status
- `context.md` — compiled context from the compiler
- `decisions/` — structured architectural decision records
- `sessions/` — individual session summaries
- `gates/` — gate configuration and results

The spec is open and any AI tool can read `.ai/trail/` files.

### Does Nokta work offline?

Yes. Once installed, Nokta runs entirely offline. The context compiler, quality gates, decision engine, and trail file management all run locally. No internet connection required.

---

## Pricing & Plans

### What's included in the free tier?

The free tier includes: 1 project, 3 autonomous agents, core capability packs (React, Node.js, Python foundations), context compiler, basic trail files, and decision tracking (up to 50 decisions). It's genuinely complete for solo developers working on a single project.

### When should I upgrade from free to Pro?

Upgrade when you:

- Need more than 1 project
- Need more than 3 autonomous agents
- Want access to all capability packs (20+ stacks)
- Need advanced quality gates (security scanning, pattern enforcement)
- Want sprint management and team context sharing
- Need API access for integrations

### What's the difference between Pro and Enterprise?

Pro ($29/mo) covers individual developers and small teams (up to 10 projects, 50 agents). Enterprise ($99+/mo) adds: SSO/SAML, full audit logs, unlimited scale, self-hosted deployment, custom capability packs, compliance documentation, and dedicated support.

### Is there a trial period?

The free tier is the trial. It has no time limit and no feature restrictions beyond the generous scale limits. When you hit a limit and need more, that's when you upgrade.

### How do I cancel?

Cancel anytime from your account settings. Your data remains accessible (you own your `.nokta/` directory). No cancellation fees.

---

## Security & Privacy

### Is my code safe? Is it sent to your servers?

Your code never leaves your machine. Nokta runs locally. It scans your files to extract patterns (read-only) and compiles context locally. Nothing is sent to Nokta's servers unless you explicitly configure cloud integration (which is disabled by default and opt-in).

### Where is my data stored?

All data is stored locally in your project's `.nokta/` directory. This includes compiled context, decision records, trail files, and user configuration. This directory is gitignored by default — you control where it goes.

### How are my API keys handled?

Provider API keys (OpenAI, Anthropic, etc.) are encrypted with AES-256-GCM using a key you control. If you set `NOKTA_ENCRYPTION_KEY`, it uses that. If you don't, it's generated locally and stored with restricted file permissions. We never see your API keys.

### Can I self-host Nokta?

Yes. Enterprise tier includes self-hosted deployment. Even on the free/Pro tiers, the core Nokta service runs locally — there's nothing to self-host because there's no cloud component by default.

### Does Nokta collect telemetry?

No. Nokta does not collect any usage telemetry, crash reports, or analytics. It's fully local-first. The only network calls are to your configured AI providers (OpenAI, Anthropic, etc.) when you explicitly make AI requests.

---

## Setup & Support

### How do I get started?

```
npm install -g nokta-ai
nokta init
```

That's it. Nokta will detect your stack, compile initial context, and you're ready.

### What do I need before installing?

- Node.js 20 or higher
- npm or yarn
- One or more AI providers configured (OpenAI, Anthropic, Ollama, or OpenRouter — at least one)

### How long does setup take?

Five minutes on a typical project. Larger projects may take a bit longer as Nokta scans the codebase.

### How do I get help if I'm stuck?

- GitHub Issues: https://github.com/nokta-ai/nokta/issues
- Discord: (link in README)
- Email: support@nokta.ai

### Where can I read the documentation?

https://docs.nokta.ai (or the `/docs/` directory in the repository)

---

## Technical Compatibility

### Which AI providers does Nokta support?

- OpenAI (GPT-4, GPT-4o, GPT-3.5)
- Anthropic (Claude 3.5, Claude 3)
- Ollama (any local model)
- OpenRouter (multi-provider routing)

### Which IDEs/tools work with Nokta?

Any tool that reads `.ai/trail/` files is compatible. Currently: Cursor, Claude Code, Codex. Support for more tools is in progress.

### Does Nokta work with Windows?

We test primarily on macOS and Linux. Windows should work via WSL2 or Git Bash. If you hit Windows-specific issues, please report them — we'll fix them.

### Does Nokta work with monorepos?

Yes. Nokta can be configured to focus on specific sub-packages or the entire monorepo. Context compilation is aware of monorepo structure.

---

## Business & Licensing

### What's the license?

Nokta is open-core. Core features are MIT licensed (free forever). Enterprise features are commercial.

### Can I use Nokta at my company?

Yes. The free tier for personal projects. Pro for teams. Enterprise for organizations with compliance or scale needs.

### Do you offer refunds?

Monthly plans: refund within 14 days, no questions asked.
Annual plans: refund within 30 days, no questions asked.
After that, cancel before your next billing cycle and you won't be charged again.

### How do I report a security vulnerability?

See `SECURITY.md` in the repository. Please don't report security issues in public GitHub issues. Email security@nokta.ai directly.
