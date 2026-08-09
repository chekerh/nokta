# Nokta Use Cases & User Stories

## Scenario 1: The "Sleep Loop" (Autonomous Development)

**Goal**: The developer wants Nokta to handle boring, repetitive, or long-running tasks while they sleep.

- **Action**: Developer creates a task in the Sprint Board: _"Refactor the auth service to use JWT and add unit tests for each edge case"_.
- **Nokta's Flow**:
  1. **Trigger**: The task is moved to "In Progress".
  2. **Planning**: Nokta generates a plan (Analyze $\rightarrow$ Edit $\rightarrow$ Test $\rightarrow$ Review).
  3. **Execution**: Nokta edits files, writes tests, and runs them.
  4. **Self-Correction**: If tests fail, Nokta reads the error, modifies the code, and retries.
  5. **Completion**: Nokta creates a new git branch, pushes changes, and opens a PR.
- **Result**: Developer wakes up to a "Ready for Review" PR with passing tests.

## Scenario 2: The "Global Brain" (Cross-Project Intelligence)

**Goal**: Avoid repeating the same mistakes across 10 different projects.

- **Action**: Developer fixes a complex race condition in Project A (a Rust backend).
- **Nokta's Flow**:
  1. **Extraction**: Nokta detects a "Fixed Bug" pattern.
  2. **Learning**: Nokta saves the "Root Cause $\rightarrow$ Fix" pattern into the **User Brain**.
  3. **Trigger**: Weeks later, the developer starts Project B (a Go backend) and writes similar code.
  4. **Injection**: Nokta's Gateway detects the pattern and injects a warning: _"Warning: In Project A, this pattern led to a race condition. Consider using [X] instead."_
- **Result**: The developer avoids the bug before it's even written.

## Scenario 3: The "Ultimate Design Intelligence" (UI/UX Pro Max)

**Goal**: Create high-end, professional interfaces without being a designer.

- **Action**: Developer prompts: _"Build a landing page for a luxury skincare brand"_.
- **Nokta's Flow**:
  1. **Intelligence Query**: Nokta calls the `ui-ux-pro-max` search engine.
  2. **System Generation**: It generates a full design system (Colors: Soft Pink/Gold, Typography: Cormorant Garamond, Pattern: Hero-Centric).
  3. **Context Injection**: This design system is injected into the AI's prompt.
  4. **Code Generation**: The AI generates HTML/CSS that strictly follows the generated specs.
- **Result**: A professional, luxury-feeling UI that avoids "AI generic" styles.

## Scenario 4: The "Multi-Project Orchestrator" (Scaling to 10+ Projects)

**Goal**: Manage a portfolio of apps without port conflicts or context switching.

- **Action**: Developer opens Project A (Port 4217) and Project B (Port 4218).
- **Nokta's Flow**:
  1. **Dynamic Port Assignment**: Nokta automatically assigns available ports to each project daemon.
  2. **Context Switching**: Switching projects in the Nokta UI instantly swaps the active `SprintEngine` and `AutoWatcher` instance.
  3. **Portfolio Overview**: The Dashboard shows a consolidated view of cost, activity, and active agents across all 10 projects.
- **Result**: Zero port conflicts and a unified view of all engineering activity.
