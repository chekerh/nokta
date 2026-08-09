# Nokta — Pricing Strategy

## Pricing Philosophy

**Principle 1: Value-based, not cost-based**
Price against the value delivered, not the cost of running the service. Nokta saves teams 2-4 hours/week of re-explanation work — at senior developer rates, that's $100-300/week in recovered time. $29/mo is an obvious ROI.

**Principle 2: Free should be complete**
The free tier isn't a trial — it's a complete experience for solo developers. Limits are real use-case limits, not artificial walls. Developers who upgrade should do so because they genuinely need more, not because free is unusable.

**Principle 3: Anchor high, discount smart**
Always show the full tier table. The $99 Enterprise tier makes $29 Pro feel accessible. Annual discounts (20%) reduce churn without devaluing the product.

**Principle 4: Local-first isn't a discount — it's a premium**
Self-hosted, no data leaves the network, fully auditable — these are enterprise-grade requirements that justify higher prices for teams that need them.

---

## Tier Breakdown

### Free — $0/mo

**Positioning:** "Start building. Never explain your project twice."

**Rationale:** Free tier is our acquisition engine. Solo developers who get value will expand within teams. We make money on teams, not on solo devs.

**What it costs us:** Essentially nothing — it's all local processing, no Nokta infrastructure used.

**What they get:** Complete context compilation, 1 project, 3 agents, core packs — enough for any solo developer to get meaningful value.

**Upgrade trigger:** They hit a real limit (more than 1 project) or want a specific Pro feature.

---

### Pro — $29/mo ($290/year)

**Positioning:** "For serious builders."

**Rationale:** This is where most revenue comes from. $29/mo is accessible for solo developers and small teams while being meaningfully profitable at scale.

**Cost to serve:** Minimal — local processing, our infrastructure costs are near zero. Profit margin is high.

**What they get:** 10 projects, 50 agents, all capability packs, advanced gates, sprint management, team context, API access.

**Upgrade triggers:**

- Need more than 1 project (real upgrade trigger)
- Need more than 3 agents (real upgrade trigger)
- Want sprint management (specific feature need)
- Want team context sharing (team adoption)
- Need API access (integration need)

---

### Enterprise — $99/mo starting

**Positioning:** "For teams that need to move fast without breaking things."

**Rationale:** Teams with compliance requirements or scale needs will pay $99/mo for SSO, audit logs, and self-hosted deployment. This is a small market but high-value.

**Cost to serve:** Higher — enterprise deployments require more support, dedicated SLAs, custom integrations. Still profitable at scale.

**What they get:** Everything in Pro + unlimited scale + SSO + audit + self-hosted + dedicated support + SLA + compliance docs.

**Price justification for enterprise:**

- SSO integration saves IT team time
- Audit logs meet compliance requirements
- Self-hosted = no data on third-party servers
- SLA = guaranteed uptime
- Compliance docs = automatic evidence generation

---

## Competitive Pricing Context

| Product                 | Target          | Pricing     |
| ----------------------- | --------------- | ----------- |
| GitHub Copilot Business | Individual/team | $19/user/mo |
| Cursor                  | Individual/team | $20-$100/mo |
| Cline                   | Individual      | Free        |
| Nokta Pro               | Solo/team       | $29/mo      |
| Nokta Enterprise        | Team/enterprise | $99+/mo     |

Nokta's $29/mo Pro tier is positioned against Copilot and Cursor. For teams that use multiple AI tools, Nokta provides value that those tools don't — making it additive, not competing.

---

## Price Testing Evidence

**Current tier prices are starting points based on:**

- Developer willingness to pay for token optimization: $20-50/mo
- Value of saved context-replanation time: 2-4hrs/wk @ $50-150/hr = $400-1200/mo recovered
- Team pricing at 5-10 seats: comparable to Jira at $5-10/user/mo

**Recommended A/B test (when traffic available):**

- Test Pro at $19/mo vs $29/mo — will conversion rate compensate?
- Test Enterprise at $79/mo vs $99/mo — is the lower anchor more compelling?
- Test annual at 25% vs 20% discount — does higher discount increase annual plan uptake?

---

## Enterprise Negotiation Ranges

**Starting price:** $99/mo for teams up to 20 seats
**Scaling:** +$5/seat/month above 20 seats
**Annual commitment:** 20% discount

**Negotiation flexibility:**

- 3+ year commitment: additional 10% off
- Public reference customer: additional 10% off
- Paid onboarding (>$500): built into price
- Custom SLA (99.99%): +$50/mo

---

## Free vs Paid Feature Distribution

| Feature           | Free         | Pro         | Enterprise        |
| ----------------- | ------------ | ----------- | ----------------- |
| Projects          | 1            | 10          | Unlimited         |
| Agents            | 3            | 50          | Unlimited         |
| Token budget      | 100K/day     | 1M/day      | 5M/day            |
| Capability packs  | Core (3)     | All (20+)   | All + custom      |
| Context compiler  | Yes          | Yes         | Yes               |
| Decision engine   | 50 decisions | Unlimited   | Unlimited         |
| Quality gates     | Basic        | Advanced    | Advanced + custom |
| Sprint management | No           | Yes         | Yes               |
| Team context      | No           | Yes         | Yes               |
| API access        | No           | Yes         | Yes               |
| Audit logs        | No           | No          | Yes               |
| SSO               | No           | No          | Yes               |
| Self-hosted       | Yes          | Yes         | Yes               |
| Support           | Community    | Email <24hr | Slack <4hr        |
| SLA               | No           | No          | 99.9%             |

---

## Pricing Page Copy Guidelines

**Headline:** Simple pricing. No surprises.

**Subheadline:** Start free. Upgrade when you need more.

**Tiers:** Always show all three. Free on left, Pro in middle (highlighted), Enterprise on right.

**CTA per tier:** "Start Free" / "Get Pro" / "Contact Sales"

**Trust element below pricing:** "No credit card required for free tier. Cancel anytime on paid tiers."

**FAQ:** "What happens if I exceed my token limit?" → "Token limits are generous daily budgets. If you hit one, your existing AI tools still work — Nokta just temporarily pauses optimization until the next day."

---

## Assumptions Documented

1. Primary target: 2-10 person teams, not massive enterprises (yet)
2. Solo devs will upgrade when they hit real limits (project count, agent count)
3. $29/mo Pro is accessible for developers while being profitable at scale
4. Enterprise at $99/mo will land with teams that have compliance requirements
5. Token limits are generous enough that most users won't hit them regularly
6. Annual discount (20%) will reduce churn without requiring higher LTV math
