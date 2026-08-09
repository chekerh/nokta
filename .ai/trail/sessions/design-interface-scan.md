# Session: UI Genius + Dashboard + Skill Scanning

## Objective

Transform Nokta into a "UI genius" by integrating the UI-UX-Pro-Max design knowledge, adding Framer Motion + Three.js + 21st.dev capabilities, building a visual web dashboard, and adding a self-updating repo-scanning feature.

## Design Packs Created

### `packs/design/ui-ux-pro-max.pack.json`

- **Cost**: 280 | **Priority**: 80
- Full UI-UX-Pro-Max design intelligence: 50+ styles, 161 palettes, 57 font pairings, 99 UX guidelines, 25 chart types
- Priority cascade: Accessibility > Touch > Performance > Style > Layout > Typography > Animation > Forms > Navigation > Charts
- WCAG AA, 44x44pt touch targets, SVG-only icons, semantic color tokens, mobile-first responsive
- Source refs to UI-UX-Pro-Max repo CSVs

### `packs/design/framer-motion.pack.json`

- **Cost**: 220 | **Priority**: 78
- Framer Motion animation patterns: page transitions, gesture animations, spring physics, stagger, layout animations
- Variants pattern, AnimatePresence, shared element transitions, scroll animations
- 21st.dev integration for production-ready animated components
- Trigger: framer-motion stack + react/next stacks

### `packs/design/three-js.pack.json`

- **Cost**: 200 | **Priority**: 75
- Three.js r128 CDN rules, GLTF loading, R3F integration, performance optimization
- Disposal patterns, mobile limits, loading states, SEO fallbacks
- Trigger: three/threejs stack + react/next/frontend

### `packs/design/21st-dev.pack.json`

- **Cost**: 140 | **Priority**: 73
- 21st.dev component library patterns, ComponentArray import, customization via className
- Landing page sections, bundle optimization, dark mode

## Designer Agent Created

### `agents/designer.agent.json`

- Role: UI/UX generation with Framer Motion, Three.js, 21st.dev, UI-UX-Pro-Max intelligence
- Scope: design, animation, 3D scenes, design systems, accessibility audits
- Default packs: all 4 design packs + stack.react-next + core.trail-discipline
- Handoff includes design decisions, tokens, animation patterns, known risks

## Compiler Detection Extended

### `compiler/lib/detect.mjs`

- Added `framer-motion` stack detection (package + filename triggers)
- Added `three` / `threejs` stack detection (package triggers: three, @react-three/fiber, @react-three/drei)
- Added `21st-dev` stack detection (package triggers: @21st-dev, @21st, 21st)
- Added `skill-source` stack detection (skills/ or .cursor/skills/ directories)

## Web Dashboard (Nokta UI)

### `daemon/public/index.html`

- Standalone SPA served at `http://localhost:4217/`
- Three.js 3D background (2000-particle system + wireframe torus knot, mouse parallax)
- Framer Motion animation principles via CSS (smooth transitions, spring-like easing, staggered reveals)
- 7 tabs: Dashboard, Providers, Trail, Gates, Compile, Chat, Skills
- Live API communication with all daemon endpoints
- Dark theme with accent color (#6c5ce7), monospace font, card-based layout
- Stats, quick actions, log container, toast notifications

### `daemon/ui.mjs` — `nokta ui` command

- Starts the daemon, waits for ready, opens browser to dashboard
- Handles SIGINT/SIGTERM for clean shutdown

## Auto-Update / Skill Scanning System

### `daemon/routes/skills.mjs` — 4 API endpoints

- `GET /api/v1/skills` — List cached skill sources
- `GET /api/v1/skills/sources` — Same
- `POST /api/v1/skills/scan` — Clone a GitHub repo, analyze structure (skills dirs, agent files, commands, MCP configs, rules)
- `POST /api/v1/skills/import` — Scan + import: copies agent definitions, creates source reference pack in packs/sources/

### `compiler/nokta-skill.mjs` — CLI equivalent

- `nokta skill scan <url>` — Clone and analyze a repo
- `nokta skill import <url>` — Clone, analyze, import agents + create reference pack
- `nokta skill list` — List cached sources

### Daemon static file serving

- `server.mjs`: added `express.static(publicDir)` + root route to serve dashboard
- Dashboard loaded as SPA from daemon at no extra setup cost

## Key Metrics

- **42/42 tests passing** (0 failures)
- **0 lint errors** (full project)
- **20 new files** created or modified
- **4 design packs** integrating UI-UX-Pro-Max knowledge
- **1 new agent** (designer)
- **5 new API endpoints** (skills scan/import/sources)
- **2 new CLI commands** (`nokta skill`, `nokta ui`)
- **1 full web dashboard** with Three.js 3D + animated UI
- **ECC repo scanned**: 286 skills, 64 agents, 84 commands, 104 rules found

## Verification

- `npm test`: 42/42 pass
- `npm run lint`: 0 errors
- `node daemon/index.mjs --port 4219`: starts, serves dashboard, responds to API
- `curl /health`: returns provider status JSON
- `curl /api/v1/skills`: returns empty cached sources
- `nokta skill scan https://github.com/affaan-m/ECC`: finds 286 skills, 64 agents

## Next Action

Deploy `nokta ui` on a real project. Scan more repos (shadcn/ui, framer-motion docs, three.js examples) to enrich the source cache. Start using the designer.agent.json agent for UI generation tasks.
