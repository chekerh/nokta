# Nokta — Customer Journey

## Journey Overview

The Nokta customer journey is designed to:

1. **Reduce time-to-value** — first "aha moment" in 5 minutes or less
2. **Build habit progressively** — value deepens over weeks, not days
3. **Create natural upgrade triggers** — users upgrade when they hit real limits
4. **Enable team adoption** — individual success leads to team expansion

---

## Journey Stage 1: Discovery

### Touchpoints

- Twitter/X post about context debt
- Hacker News mention of Nokta
- Word of mouth from a developer friend
- GitHub issue or PR reference
- Reddit discussion of AI tool pain points

### What the User Feels

- Recognition: "That's EXACTLY my problem"
- Curiosity: "Is this for real? Does this actually work?"
- Skepticism: "I've tried tools like this before and they were overhyped"

### What We Need to Deliver

- Clear, specific problem statement they recognize
- Quick credibility signal (real users, real results)
- Low barrier to try (5-minute install, no credit card)

### User Actions

- Click through to landing page
- Scan the README
- Sign up / download

---

## Journey Stage 2: First-Time Setup (Onboarding)

### Touchpoints

- Landing page quick start section
- npm install + nokta init
- First auto-detection of stack
- First compiled context generated

### What the User Feels

- Impressed: "That was fast"
- Curious: "Okay, what just happened? Let me see what it compiled"
- Anticipation: "This might actually work"

### What We Need to Deliver

- Painless install (works on first try)
- Visible progress (clear feedback at each step)
- Quick first win (compiled context visible within 1-2 minutes)

### Onboarding Checklist (In-App)

- [ ] Install Nokta
- [ ] Run `nokta init` on a project
- [ ] Open `.ai/trail/index.md` — see compiled context
- [ ] Make one AI request with Nokta context
- [ ] Notice the difference in AI response quality
- [ ] Create first decision record
- [ ] Trigger first quality gate

### Time to First Value: <10 minutes

---

## Journey Stage 3: Early Value (Days 1-7)

### Touchpoints

- Daily AI sessions with Nokta context
- Trail file growth
- First decision recorded
- First quality gate triggered
- Dashboard views (projects, decisions, sprints)

### What the User Feels

- Validation: "The AI is actually using the context I compiled"
- Surprise: "Wait, it remembered my Redux migration from 3 months ago"
- Curiosity: "What else can I set up?"

### What We Need to Deliver

- Consistent quality improvement in AI responses
- Clear evidence that compiled context is working
- Progressive discovery of new features

### Key Behaviors to Encourage

- Add first capability pack (team standards)
- Record first architectural decision
- Run first quality gate on a PR
- Set up first autonomous agent

### Time to Habit: 7-14 days

---

## Journey Stage 4: Regular Use (Weeks 2-8)

### Touchpoints

- Daily morning standup from trail files
- AI sessions that remember previous context
- Sprint board updates
- Decision tracking for new architectural choices
- Quality gate reports

### What the User Feels

- Reliability: "Nokta just works every day"
- Trust: "The AI suggestions are actually better with context"
- Ownership: "This is MY project's knowledge, not a vendor's"

### What We Need to Deliver

- No friction in daily workflow
- Continuous improvement in context quality
- Occasional "wow" moments (AI remembers something unexpected)

### Key Features for Habit Formation

1. **Morning standup from trail** — 2-minute recap, always current
2. **AI suggestions that make sense** — patterns it remembers, not generic advice
3. **Decision search** — find why a decision was made in seconds
4. **Quality gate catching something** — proof the gates are working

---

## Journey Stage 5: Team Sharing (Months 2-3)

### Touchpoints

- Invite team member to Nokta project
- Shared `.ai/trail/` directory
- Shared capability packs
- Team-wide quality gates
- Shared decision database

### What the User Feels

- Pride: "I introduced my team to this"
- Relief: "Now we all have the same context"
- Momentum: "We should formalize more of our standards"

### What We Need to Deliver

- Easy team onboarding (shared config, not per-machine)
- Clear visibility into team AI usage
- Simple capability pack sharing

### Upgrade Triggers

- Need to share with second team member → Pro
- Need team context → Pro
- Need more than 1 project → Pro
- Need advanced gates → Pro

---

## Journey Stage 6: Enterprise Evaluation (Months 3-6)

### Touchpoints

- Security review initiated
- Compliance documentation request
- SSO integration discussion
- Audit log review
- Proof-of-concept deployment

### What the User Feels

- Pressure: "I need to justify this to my manager/legal/security"
- Advocacy: "I'm championing this internally"
- Need for support: "We need help getting this approved"

### What We Need to Deliver

- Security documentation (what data is stored where)
- Compliance documentation (audit reports, data flows)
- Technical deep-dive support
- References from similar companies

### Key Stakeholders to Satisfy

1. **Developer:** Nokta works, saves time, improves quality
2. **Engineering Manager:** team productivity improvement, measurable
3. **Security:** data never leaves network, API keys encrypted, no telemetry
4. **Legal/Compliance:** audit trail, data handling documentation
5. **Finance:** clear ROI, competitive pricing

---

## Friction Points and Mitigations

| Stage        | Common Friction                                  | Mitigation                                       |
| ------------ | ------------------------------------------------ | ------------------------------------------------ |
| Discovery    | "This sounds complicated"                        | 5-minute demo video, simple messaging            |
| Onboarding   | Install fails on Windows                         | Test on Windows, WSL docs, fast fixes            |
| Early Value  | "What does compiled context actually look like?" | Show real `.ai/trail/` file, before/after        |
| Regular Use  | "I don't see the value every day"                | In-app notifications when gate catches something |
| Team Sharing | "How do I get my team to use this?"              | Team onboarding guide, champion kit              |
| Enterprise   | "We need SSO and audit logs"                     | Enterprise tier exists with these features       |

---

## Key Metrics by Journey Stage

| Stage        | Key Metric              | Target                |
| ------------ | ----------------------- | --------------------- |
| Discovery    | Landing page conversion | >5% sign up           |
| Onboarding   | Time to first value     | <10 minutes           |
| Early Value  | Activation rate         | >80% run init         |
| Regular Use  | Weekly active rate      | >50% return weekly    |
| Team Sharing | Team upgrade rate       | >20% share with team  |
| Enterprise   | Enterprise inquiry rate | >5% of team adoptions |

---

## Assumptions

1. The 5-minute setup is critical — any friction kills momentum
2. The first "aha moment" must come from seeing AI use compiled context correctly
3. Daily habit is built around the morning standup from trail files
4. Team adoption is driven by individual champions, not top-down mandates
5. Enterprise requires human support through the security review process
