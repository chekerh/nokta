# Nokta — Offer Structure

## Core Offer Tiers

### Free — "Start Building"

**Price:** $0/mo forever
**Target:** Solo developers, hobbyists, first-time users

**Included:**

- 1 project
- 3 autonomous agents
- 100K provider tokens/day (OpenAI/Anthropic/Ollama)
- Core capability packs (React, Node.js, Python foundations)
- Context compiler (stack detection, pattern extraction)
- Basic trail files (session persistence)
- Community support (GitHub issues, Discord)
- Local deployment (no cloud dependency)
- Full decision engine (up to 50 decisions)

**Purpose:** Get developers to experience value, not to upsell aggressively. The free tier should feel complete, not crippled.

**Limits:** Not artificial — genuine use cases hit these limits (more than 1 project, more than 3 agents, etc.)

---

### Pro — "For Serious Builders"

**Price:** $29/mo (or $290/year — save $58)
**Target:** Solo developers with multiple projects, small teams (2-10)

**Everything in Free, plus:**

- 10 projects
- 50 autonomous agents
- 1M provider tokens/day
- All capability packs (20+ stacks including Cloud, Security, Mobile, Data, etc.)
- Advanced quality gates (security scanning, pattern enforcement, token budgets)
- Full decision engine (unlimited decisions)
- Sprint management (backlog, sprints, story points, reporting)
- Priority support (email, <24hr response)
- Team context sharing (shared `.ai/trail/` across team)
- API access (for integrations)
- Usage analytics (per-project token usage, cost breakdown)

**Purpose:** This is the main revenue tier. Should feel like a clear upgrade for anyone using Nokta with multiple projects or working with a team.

**Typical user:** Solo dev with 3-4 projects, small team of 3-5 engineers

---

### Enterprise — "For Teams That Move Fast"

**Price:** $99/mo (starts at; scales with team size)
**Target:** Engineering teams 10+, compliance-required environments

**Everything in Pro, plus:**

- Unlimited projects
- Unlimited agents
- 5M provider tokens/day
- SSO / SAML integration (Okta, Azure AD, Google Workspace)
- Full audit logs (every action, every decision, every gate result)
- Self-hosted deployment option (no Nokta cloud dependency)
- Custom capability packs (your proprietary patterns as a pack)
- Compliance documentation engine (auto-generate audit reports)
- Dedicated support (slack channel, <4hr response)
- Onboarding support (3 sessions included)
- Custom integrations (CI/CD, Jira, GitHub Enterprise, Linear)
- Service level agreement (99.9% uptime)

**Purpose:** High-margin revenue from teams with compliance requirements or scale needs.

**Typical user:** 15-person engineering team at a Series A startup, 50-person team at established company

---

## Additional Purchase Options

### One-Time Add-Ons (Pro/Enterprise)

1. **Custom Capability Pack Creation** — $499 one-time
   - We create a bespoke pack from your team's existing patterns
   - Delivered as a `.ai/capability-pack.json` you own
   - 2 rounds of revisions included

2. **Technical Onboarding Session** — $299/session
   - 90-minute video call with a Nokta engineer
   - Architecture review, setup optimization, advanced patterns

3. **Compliance Report Generation** — $199/report
   - We generate a full audit report for a specific time period
   - Includes all decisions, gate results, and action logs

---

## Pricing Psychology

### Anchoring

Pro at $29/mo feels reasonable when Enterprise is $99/mo. Always show all three tiers.

### Annual Discount

20% off for annual payment ($290 vs $348) — reduces churn, increases LTV.

### Free Tier as Loss Leader

Free tier users who hit limits don't feel pushed — they naturally upgrade when they genuinely need more. Don't create artificial walls.

### Enterprise as Value Anchor

Having Enterprise at $99/mo makes Pro at $29 feel accessible. Enterprise buyers get a lot — but the real goal is Pro.

---

## Offer Flow (Customer Journey)

### Stage 1: Discovery

- Developer sees a post about Nokta's context compilation or token optimization
- Lands on landing page, reads "5-minute setup" and "local-first"
- Signs up with email to download / start free

### Stage 2: Activation

- Installs Nokta (`npm install nokta-ai; nokta init`)
- Experiences immediate value: compiled context in first session
- First "aha moment" — AI that knows their project patterns

### Stage 3: Regular Use (Week 1-2)

- Uses Nokta daily across all AI sessions
- Builds up trail files and first decisions
- Hears about Pro features in-product (toast notifications, upgrade prompts)

### Stage 4: Upgrade Consideration

- Hits a free tier limit (3rd project, 4th agent)
- OR has a specific need (sprint management, advanced gates)
- Upgrades to Pro with clear ROI in mind

### Stage 5: Expansion

- Recommends to team lead
- Team adopts Nokta (shared context, team capability packs)
- Upgrades to Pro for team OR starts enterprise evaluation

### Stage 6: Enterprise

- Security review initiated
- Compliance documentation needed
- SSO required for team >10
- Custom pack for proprietary patterns
- Becomes Enterprise customer

---

## What NOT to Offer

1. **A "trial" that requires credit card** — free means free
2. **Feature-gated basic features** — context compilation is free, not a trial
3. **Per-seat pricing for solo devs** — Pro is per-user, but a solo dev with 5 projects pays the same as one with 1 project
4. **Usage-based pricing for individuals** — token limits are generous, not artificial
5. **"Contact us for pricing" on public pricing** — give starting prices, even for enterprise
