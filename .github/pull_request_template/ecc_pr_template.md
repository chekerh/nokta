## Pull Request Template — ECC Framing

**Please read:** https://nokta.dev/ecc-compliance

### 📋 ECC Triad Requirement
All PRs **must** frame their changes using the ECC triad. Delete this section only if you've completed all three parts.

### ✅ Evidence
**Data, patterns, or benchmarks that support your change:**

- What evidence supports this change? (e.g., "3 of 6 analysis-projects use TF-IDF", "benchmark shows 40% faster", "follows pattern from .graphify_detect.json")
- Link to relevant data or patterns:
- Reference to existing code/patterns:

### ✅ Claims
**The value proposition — what problem does this solve?**

- What problem does this PR solve? 
- Who does it benefit? (contributors, users, the project)
- Why is this the right approach? (compared to alternatives)

### ✅ Conclusions
**The reasoned conclusion — why this change advances Nokta:**

- How does this PR advance Nokta's mission?
- What is the expected outcome? (e.g., "this PR advances Nokta's analysis capability while maintaining the 150/153 test-pass guarantee")
- Any trade-offs or limitations?

---

### 📋 Checklist

- [ ] ECC Triad (Evidence, Claims, Conclusions) completed above
- [ ] Tests pass locally (`npm run test:ci`)
- [ ] Lint passes (`npm run lint`)
- [ ] Graphify patterns aligned (checked `.graphify_detect.json`)
- [ ] Issue label matches category (see `good first <category>` labels)
- [ ] Mentor requested (use `mentor: @username` in description)

### 🏷️ Issue Label

What category does this PR advance?
- `orchestration`
- `analysis`
- `sprint`
- `knowledge`
- `security`
- `deployment`
- `uiux`
- `trust`

### 👥 Mentor

@username — who should review this with ECC framing expertise?
