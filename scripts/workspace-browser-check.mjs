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
  await page.setViewportSize({ width: 375, height: 812 });
  await page.screenshot({ path: '/tmp/nokta-workspace-mobile.png', fullPage: true });
  assert.equal(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth), true, 'No document overflow on mobile');
  await page.getByRole('button', { name: 'Configure' }).click();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#project-dialog').evaluate(dialog => dialog.open), false);
  assert.deepEqual(errors, []);
  console.log('Browser checks passed: onboarding, invalid models, analysis, Kanban progression, test evidence, review evidence, reload persistence, mobile width, Escape, no page errors.');
  console.log('Screenshots: /tmp/nokta-workspace-desktop.png and /tmp/nokta-workspace-mobile.png');
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  await service.close();
  await fs.rm(directory, { recursive: true, force: true });
}
