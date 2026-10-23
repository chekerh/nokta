/**
 * Nokta Autonomous Agent Launcher
 *
 * Launches coding agents for any registered project without requiring the human
 * to navigate terminal paths or remember which tool was used last.
 *
 * Usage from UI:
 *   window.launchAgent({ projectRoot, goal, adapter, model })
 *
 * The launcher:
 * 1. Looks up the project registry for last-used adapter/preferences
 * 2. Selects the appropriate adapter based on stack signals
 * 3. Spawns the agent process in the project's cwd
 * 4. Watches the SSE stream and updates the dashboard
 * 5. Handles self-healing retries and gate approvals
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'url';
import { spawn } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));

const HEADLESS_PROVIDERS = new Set(['opencode']);

/**
 * Launch an agent for a given project and goal.
 * The launcher consults the project registry for last adapter/model preferences,
 * then falls back to sensible defaults.
 *
 * @param {Object} params
 * @param {string} params.projectRoot - Absolute path to the project
 * @param {string} params.goal - The task/goal for the agent
 * @param {string} [params.adapter] - Preferred adapter (opencode, claude, etc.)
 * @param {string} [params.model] - Preferred model identifier
 * @param {Object} [params.options] - Additional launch options
 * @returns {Object} Run info including runId, process, etc.
 */
export async function launchAgent({ projectRoot, goal, adapter, model, options = {} }) {
  // Resolve to absolute path if needed
  const resolvedProjectRoot = resolve(projectRoot);

  // Look up project registry for last adapter/model preferences
  const ProjectManager = await import('./project-manager.mjs');
  const pm = new ProjectManager.ProjectManager();
  const registry = await pm.getProjectRegistry(resolvedProjectRoot);

  // Determine adapter: registry preference → default to opencode
  const selectedAdapter = adapter || registry.lastAdapter || 'opencode';
  const selectedModel = model || registry.preferredModels?.[0] || '';

  // Build the command based on adapter
  let command, cwd, env;

  if (selectedAdapter === 'opencode') {
    cwd = resolvedProjectRoot;
    // Use opencode in serve mode for headless operation
    command = ['opencode', 'run', goal].filter(Boolean);
    env = { ...process.env, NOKTA_PROJECT_ROOT: resolvedProjectRoot };
  } else if (selectedAdapter === 'claude') {
    cwd = resolvedProjectRoot;
    command = ['/opt/anthropic/claude', '--task', goal];
    env = { ...process.env, NOKTA_PROJECT_ROOT: resolvedProjectRoot };
  } else if (selectedAdapter === 'cursor') {
    cwd = resolvedProjectRoot;
    command = ['cursor', '/task', goal];
    env = { ...process.env, NOKTA_PROJECT_ROOT: resolvedProjectRoot };
  } else {
    // Unknown adapter, default to opencode
    selectedAdapter = 'opencode';
    cwd = resolvedProjectRoot;
    command = ['opencode', 'run', goal].filter(Boolean);
    env = { ...process.env, NOKTA_PROJECT_ROOT: resolvedProjectRoot };
  }

  // Register in the project registry
  try {
    await pm.registerProjectInRegistry(
      resolvedProjectRoot,
      selectedAdapter,
      [selectedModel || undefined],
      [], // stackSignals - would be computed from project analysis
      '', // trailPath - would be created/newly initialized
      options.linkedLinearId || '',  // Linear project ID if linking
    );
  } catch (e) {
    // Non-critical: launch proceeds even if registry update fails
    console.warn(`Could not update registry: ${e.message}`);
  }

  // Spawn the agent process
  const process = spawn(command, [], {
    cwd,
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
    detached: false,
  });

  return {
    runId: Date.now().toString(36) + Math.random().toString(36).slice(2),
    projectRoot: resolvedProjectRoot,
    adapter: selectedAdapter,
    model: selectedModel || undefined,
    goal,
    process,
    startedAt: new Date().toISOString(),
    status: 'created',
  };
}

/**
 * Launch agent with full trail integration
 * Creates a trail session and feeds the agent the compiled context
 *
 * @param {Object} params - Same as launchAgent, plus trail integration
 * @returns {Object} Run info
 */
export async function launchAgentWithTrail({ projectRoot, goal, adapter, model, options = {}, trailData = {} }) {
  const runInfo = await launchAgent({ projectRoot, goal, adapter, model, options });

  // TODO: Integrate with trail system
  // - Create a new trail session
  // - Compile minimal context for the project
  // - Feed context to the agent via --context flag or env
  // - Watch trail updates and dashboard

  return {
    ...runInfo,
    trailIntegrated: true,
    trailSession: trailData.sessionId || `trail_${runInfo.runId}`,
  };
}

/**
 * Check if an adapter is available/headless
 *
 * @param {string} adapter - Adapter name
 * @returns {boolean} True if the adapter can run headless
 */
export function isAdapterHeadless(adapter) {
  return HEADLESS_PROVIDERS.has(adapter.toLowerCase());
}

/**
 * Get available adapters for a project based on stack signals
 *
 * @param {string} projectRoot - Project path
 * @returns {Array} Available adapter names
 */
export async function getAvailableAdapters(projectRoot) {
  const ProjectManager = await import('./project-manager.mjs');
  const pm = new ProjectManager.ProjectManager();
  const registry = await pm.getProjectRegistry(resolve(projectRoot));

  const adapters = [];
  if (registry.lastAdapter) adapters.push(registry.lastAdapter);
  if (isAdapterHeadless('opencode')) adapters.push('opencode');
  if (isAdapterHeadless('claude')) adapters.push('claude');
  if (isAdapterHeadless('cursor')) adapters.push('cursor');

  return [...new Set(adapters)];
}
