# Frontend audit

## Local launch

- Landing: http://localhost:5173 — `npm run dev --prefix landing`
- Console: http://localhost:4217 — `./run_app.sh`
- Both existing servers returned HTTP 200 during this audit.
- Dependencies were already installed. No additional runtime packages were needed.
- Set VITE_CONSOLE_URL before building for deployment; the default uses the current hostname and port 4217.

## Fixed

- Console and API links now reach the daemon instead of reloading the marketing page.
- Added the missing Architecture target; corrected mobile Platform navigation.
- Closed mobile navigation is inert; the toggle exposes expanded state and Escape closes it.
- Clipboard success is reported only after completion; failure has a recovery message.
- Added a main landmark, skip link, keyboard focus styling, and reduced-motion handling.
- Removed delayed typewriter content; background video is omitted for reduced motion.
- Fixed mobile footer wrapping, branded favicon reference, page title, and description.
- Added a local skill toolkit in tools/frontend-skills from /Users/mac/skills/frontend.

## Still missing / needs verification

1. Automated desktop/mobile browser coverage for navigation, keyboard access, clipboard failures, console onboarding, and settings. This pass verifies source/build/lint and HTTP availability, not browser behavior.
2. A documented production hosting arrangement connecting the landing page and console. The Vite bundle is not served by the daemon's existing static directory.
3. Validation of published pricing, agent counts, SLA, and strong security/accuracy claims against actual entitlement enforcement. Existing marketing claims remain unverified.
4. A shared visual system between the standalone React landing and the daemon's HTML console. External font requests and large background media also merit a performance pass.
5. User-facing privacy/terms content and working support/contact destinations validated by the product owner.

## Constraints

The repository already contained extensive uncommitted backend and console edits. Those were preserved. docs/CODEX-NAVIGATION-GUIDE.md referenced by repository instructions is absent. Native/mobile and mutually exclusive style skills were not loaded wholesale; relevant guidance was used on demand to keep token usage small.
