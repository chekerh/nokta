// Isolated UI smoke test. Uses temporary repositories and no paid AI calls.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WorkspaceService } from '../daemon/workspace/service.mjs';
import { createWorkspaceApp } from '../daemon/workspace/server.mjs';

const { chromium } = await import(process.env.NOKTA_PLAYWRIGHT_MODULE || 'playwright');
const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'nokta-browser-'));
const rootPath = path.join(directory, 'sample-project');
await fs.mkdir(rootPath);
const runner = {
  available: async () => ({ installed: true, version: 'Test runner' }),
  run: async ({ phase }) => {
    if (phase === 'analyze') return { summary: 'Sample project needs one change.', tasks: [{ title: 'Handle empty project state', description: 'Show a useful empty state.', priority: 'P1', acceptanceCriteria: ['Empty state is visible'] }] };
    if (phase === 'execute') return { completed: true, summary: 'Implementation fixture completed.' };
    return { approved: true, summary: 'Independent fixture review passed.', issues: [] };
  },
};
const service = new WorkspaceService({ dataDir: path.join(directory, 'state'), runner, skills: { root: '/local/skills', inventory: async () => [{ name: 'testing' }], select: async () => [] }, command: async () => ({ code: 0, output: 'Fixture checks passed', error: null }) });
await service.load();
const server = createWorkspaceApp(service).listen(0, '127.0.0.1');
await once(server, 'listening');
let browser;
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.getByRole('button', { name: 'Add your first project' }).waitFor();
  await page.getByRole('button', { name: 'Add your first project' }).click();
  await page.getByLabel('Project name', { exact: true }).fill('UI test project');
  await page.getByLabel('Repository folder').fill(rootPath);
  await page.getByLabel('What should Nokta achieve?').fill('Handle empty projects and test the result.');
  await page.getByLabel('Implementation model').fill('author-test');
  await page.getByLabel('Independent review model').fill('author-test');
  await page.getByLabel('Checks to run').fill('[["node", "--test"]]');
  await page.getByRole('button', { name: 'Save project' }).click();
  await page.getByText('Choose different execution and verification models').waitFor();
  await page.getByLabel('Independent review model').fill('reviewer-test');
  await page.getByRole('button', { name: 'Save project' }).click();
  await page.locator('#project-dialog').waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: 'Analyze needs' }).click();
  await page.getByRole('button', { name: 'Handle empty project state, Ready', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Start autopilot' }).click();
  await page.getByRole('button', { name: 'Handle empty project state, Done', exact: true }).waitFor();
  await page.screenshot({ path: '/tmp/nokta-workspace-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Handle empty project state, Done', exact: true }).click();
  await page.getByText('Independent fixture review passed.', { exact: false }).waitFor();
  await page.getByRole('button', { name: 'Close task details' }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Handle empty project state, Done', exact: true }).waitFor();
  // Agent-awareness panels: real content renders (not a stuck busy state), the
  // prompt is keyed per project, and switching back re-renders from cache.
  await page.getByText('No coding agent detected in this project yet.').waitFor();
  await page.locator('#generated-prompt', { hasText: 'Handle empty projects and test the result.' }).waitFor();
  assert.equal(await page.locator('#copy-prompt').isEnabled(), true, 'copy is enabled once a prompt exists');
  const secondRoot = path.join(directory, 'second-project');
  await fs.mkdir(secondRoot);
  // Give project 2 tool-specific evidence so its agent panel (Cursor primary)
  // is distinguishable from project 1's ("no coding agent detected").
  await fs.writeFile(path.join(secondRoot, '.cursorrules'), 'Use the project conventions.\n');
  // Hold project 2's context response in flight so the switch-back race is
  // deterministic instead of a timing accident.
  let releaseContext;
  const contextGate = new Promise(resolve => { releaseContext = resolve; });
  let heldContextUrl;
  await page.route('**/api/workspace/projects/*/context', async route => {
    heldContextUrl = route.request().url();
    await contextGate;
    await route.continue();
  });
  await page.locator('#add-project').click();
  await page.getByLabel('Project name', { exact: true }).fill('Second panel project');
  await page.getByLabel('Repository folder').fill(secondRoot);
  await page.getByLabel('What should Nokta achieve?').fill('Second goal for panel keying.');
  await page.getByLabel('Implementation model').fill('author-test');
  await page.getByLabel('Independent review model').fill('reviewer-test');
  await page.getByLabel('Checks to run').fill('[]');
  await page.getByRole('button', { name: 'Save project' }).click();
  await page.locator('#project-dialog').waitFor({ state: 'hidden' });
  // The heading flip proves render() ran for the new selection, and loadContext
  // writes its busy state synchronously before that — so project 2's panels are
  // now overwriting project 1's, mid-flight.
  await page.getByRole('heading', { name: 'Second panel project' }).waitFor();
  assert.ok(heldContextUrl, 'project 2 issued a context request while the gate is held');
  await page.getByRole('button', { name: 'UI test project' }).click();
  // Switching back mid-flight must re-render project 1's cached context and
  // prompt; leaving project 2's busy state here was the stale-panel bug.
  await page.locator('#agent-tool', { hasText: 'No coding agent detected in this project yet.' }).waitFor();
  await page.locator('#generated-prompt', { hasText: 'Handle empty projects and test the result.' }).waitFor();
  assert.equal(await page.locator('#copy-prompt').isEnabled(), true, 'copy is enabled for the re-rendered project 1 prompt');
  // Release project 2's response: it lands while project 1 is selected and must
  // be cached without painting over project 1's panels.
  releaseContext();
  const held = await page.waitForResponse(response => response.url() === heldContextUrl);
  assert.equal(held.status(), 200);
  await page.waitForTimeout(200);
  await page.unroute('**/api/workspace/projects/*/context');
  assert.equal(await page.locator('#agent-tool', { hasText: 'Cursor' }).count(), 0, 'a late response must not paint over the selected project');
  await page.getByRole('button', { name: 'Second panel project' }).click();
  await page.locator('#agent-tool', { hasText: 'Cursor' }).waitFor();
  await page.locator('#generated-prompt', { hasText: 'Second goal for panel keying.' }).waitFor();
  assert.equal(await page.locator('#copy-prompt').isEnabled(), true, 'copy re-enabled for the selected project prompt');
  // Discovery: a folder scanned from the configured roots can pre-fill the form.
  const discoveryRoot = path.join(directory, 'discovery-app');
  await fs.mkdir(path.join(discoveryRoot, '.git'), { recursive: true });
  await fs.writeFile(path.join(discoveryRoot, 'package.json'), '{}\n');
  process.env.NOKTA_APP_DISCOVERY_ROOTS = directory;
  await page.getByRole('button', { name: 'Detect apps' }).click();
  const candidate = page.locator('.discover-item', { hasText: 'discovery-app' });
  await candidate.waitFor();
  await candidate.getByRole('button', { name: 'Add' }).click();
  await page.getByLabel('Repository folder').waitFor();
  assert.equal(await page.getByLabel('Repository folder').inputValue(), await fs.realpath(discoveryRoot), 'the discovered folder pre-fills the project form');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.locator('#project-dialog').waitFor({ state: 'hidden' });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.screenshot({ path: '/tmp/nokta-workspace-mobile.png', fullPage: true });
  assert.equal(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth), true, 'No document overflow on mobile');
  await page.getByRole('button', { name: 'Configure' }).click();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#project-dialog').evaluate(dialog => dialog.open), false);
  assert.deepEqual(errors, []);
  console.log('Browser checks passed: onboarding, invalid models, analysis, Kanban progression, test evidence, review evidence, reload persistence, agent/prompt panels, per-project prompt keying, app discovery, mobile width, Escape, no page errors.');
  console.log('Screenshots: /tmp/nokta-workspace-desktop.png and /tmp/nokta-workspace-mobile.png');
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  await service.close();
  await fs.rm(directory, { recursive: true, force: true });
}
