# Nokta — Project Intelligence OS: Implementation Plan

## Phase 0 — Foundation Prep

1. Fix 5 bugs (gates route, tokensInEst streaming, provider/model overrides dropped, cost-tracker misattribution, provider config persistence)
2. Extend compiler/lib/detect.mjs — universal stack detection (lockfile + convention + framework heuristics)
3. Add self-learning detection patterns store (.nokta/detection-patterns.json)
4. Extend daemon/routes/search.mjs — fuzzy match, symbol search, search scoping, cross-stack indexing, search history

## Phase 1 — Sprint Engine Core

5. Create daemon/lib/sprint-engine.mjs — data model (Initiative/Epic/Story/Task/Bug), CRUD, storage (.nokta/sprints/items.json)
6. Build brainstorm function — AI reads project context → generates prioritized sprint items with evidence and related files
7. Build estimate function with user-override learning
8. Build auto-prioritize function (dependencies + deadlines + code health + user history)
9. Create daemon/routes/planner.mjs — REST endpoints for all sprint engine operations
10. Register planner routes in daemon

## Phase 2 — Planner UI

11. Create daemon/public/pages/planner.html — kanban board, backlog, sprint selector, detail panel
12. Create daemon/public/lib/planner.js — state management, drag-and-drop, API calls
13. Create daemon/public/lib/kanban.js — kanban component, card rendering
14. Add Planner panel to daemon/public/index.html panel system
15. Create brainstorm button + modal in UI

## Phase 3 — Design Intelligence Integration (NEW)

16. Enhance brainstorm function with UI/UX Pro Max integration for design-aware suggestions
17. Implement design decision tracking system (.nokta/design-decisions/)
18. Create context-aware design recommendation engine
19. Add design validation to review process (WCAG, responsiveness, accessibility checks)
20. Implement design system persistence (Master + Overrides pattern)

## Phase 4 — Architectural Intelligence (NEW)

21. Implement architectural decision record (ADR) generation from implemented solutions
22. Create pattern recognition system for successful architectural choices
23. Build context-aware architectural recommendation engine
24. Add technology radar for suggesting updates and migrations
25. Implement cross-pattern analysis (privacy-preserving)

## Phase 5 — Auto-Update + File Watcher

26. Create daemon/lib/watcher.mjs — recursive fs.watch with debounce, file-change events
27. Integrate watcher with sprint-engine auto-update — detect file changes → diff analysis → task status suggestions
28. Wire watcher into daemon startup

## Phase 6 — PR Review

29. Build review engine in sprint-engine — compare PR diff against conventions, patterns, linked tasks
30. Build convention checking (from learned patterns)
31. Build PR review output formatter (inline comments + summary)
32. Create CLI commands (nokta review-pr, nokta review-branch)
33. Create UI for PR review results
34. **Enhance PR review with design feedback** (visual regression hints, accessibility checks)

## Phase 7 — Reports

35. Build sprint report generator (burn-up/down, velocity, completion rate, new vs planned, code health delta)
36. Create daemon/public/lib/reports.js — lightweight chart rendering (Canvas, no dependencies)
37. Create Reports view in planner UI
38. **Add design quality metrics to reports** (contrast ratios, accessibility compliance, responsiveness scores)
39. **Add architectural health indicators** to sprint reports

## Phase 8 — Self-Learning

40. Build tracking: which auto-generated items accepted/rejected/edited
41. Build tracking: search query patterns
42. Build tracking: detection overrides
43. Build .nokta/learned/patterns.json — recurring code conventions extracted from analysis
44. Build .nokta/learned/decisions.json — ADRs from user corrections
45. Build .nokta/learned/design-patterns.json — successful UI/UX patterns from implementations
46. Build .nokta/learned/architecture-patterns.json — successful architectural decisions
47. Wire learning into brainstorm, estimate, and auto-prioritize functions
48. **Enhance learning with design outcome correlation** (which designs led to better user satisfaction)

## Phase 9 — Polish & Advanced Features

49. Remove Three.js CDN dependency (replace with lightweight or inline)
50. Add sprint duration config
51. Add acceptance criteria editor in UI
52. Add dependency graph visualization (simple SVG, not Three.js)
53. Write integration tests for sprint engine + planner routes
54. Write tests for universal detection
55. Run full lint + 42+ test suite, fix any regressions
56. **Implement prompt template system** for consistent, high-quality agent instructions
57. **Build design pattern library** with reusable UI components and patterns
58. **Create architectural decision templates** for common system patterns
59. Add natural language interface for architectural queries ("How should I handle authentication?")
60. Implement "design mode" vs "development mode" toggles in UI

## Phase 10 — Ecosystem & Extensibility (Future)

61. Create plugin architecture for domain-specific knowledge
62. Build marketplace for community-contributed skills and templates
63. Develop analytics dashboard for engineering insights
64. Integrate with external design tools (Figma, Sketch, etc.) for bidirectional sync
65. Implement team collaboration features with role-based access
66. Add AI pair programming mode with contextual awareness
