import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAgentPrompt } from '../daemon/lib/prompt-builder.mjs';

const BASE = {
  project: { name: 'Portal', rootPath: '/apps/portal', goal: 'Ship the launch-ready dashboard.', checks: [['npm', 'test']], tasks: [] },
  tooling: { primary: { id: 'claude-code', name: 'Claude Code' }, instructionFiles: ['CLAUDE.md'], tools: [] },
  github: { available: false },
};

test('includes the agent address, goal, checks, and guardrails', () => {
  const prompt = buildAgentPrompt(BASE);
  assert.match(prompt, /You are Claude Code/);
  assert.match(prompt, /Ship the launch-ready dashboard/);
  assert.match(prompt, /npm test/);
  assert.match(prompt, /Do not publish, push, deploy/);
});

test('renders GitHub context when available', () => {
  const prompt = buildAgentPrompt({
    ...BASE,
    github: { available: true, url: 'https://github.com/o/r', description: 'The app', defaultBranch: 'main', stars: 5, authenticated: true, recentCommits: [{ sha: 'abc1234', message: 'Add thing', author: 'Dev' }], openPulls: [{ number: 2, title: 'WIP' }], openIssues: [{ number: 1, title: 'Bug' }] },
  });
  assert.match(prompt, /https:\/\/github\.com\/o\/r/);
  assert.match(prompt, /abc1234 Add thing/);
  assert.match(prompt, /#2 WIP/);
  assert.match(prompt, /#1 Bug/);
});

test('lists pending tasks with acceptance criteria and omits done ones', () => {
  const prompt = buildAgentPrompt({
    ...BASE,
    project: { ...BASE.project, tasks: [{ title: 'Add login', description: 'Email + password.', priority: 'P0', status: 'ready', acceptanceCriteria: ['Valid creds sign in', 'Bad creds are rejected'] }, { title: 'Old chore', description: 'x', priority: 'P3', status: 'done', acceptanceCriteria: ['y'] }] },
  });
  assert.match(prompt, /Add login/);
  assert.match(prompt, /Valid creds sign in/);
  assert.ok(!prompt.includes('Old chore'), 'completed tasks must not appear in the hand-off');
});

test('falls back to a generic address when no agent is detected', () => {
  const prompt = buildAgentPrompt({ ...BASE, tooling: { primary: null, tools: [], instructionFiles: [] } });
  assert.match(prompt, /You are a coding agent/);
});

test('mentions the existing instruction file', () => {
  assert.match(buildAgentPrompt(BASE), /CLAUDE\.md/);
});

test('quotes check commands so a pasted prompt runs the same argv Nokta runs', () => {
  const prompt = buildAgentPrompt({ ...BASE, project: { ...BASE.project, checks: [['sh', '-c', 'npm test && npm run lint'], ['node', 'scripts/a b.js']] } });
  assert.match(prompt, /- sh -c "npm test && npm run lint"/, 'shell metacharacters must stay quoted inside one argument');
  assert.match(prompt, /- node "scripts\/a b\.js"/, 'args with spaces must be quoted');
});

test('omits the checks section entirely when no checks are configured', () => {
  const prompt = buildAgentPrompt({ ...BASE, project: { ...BASE.project, checks: [] } });
  assert.ok(!prompt.includes('## Checks'), 'no checks section without checks');
  assert.ok(!prompt.includes('configured checks'), 'must not instruct the agent to run checks that do not exist');
});

test('keeps blocked tasks out of the implement-in-order list', () => {
  const prompt = buildAgentPrompt({
    ...BASE,
    project: {
      ...BASE.project,
      tasks: [
        { title: 'Ready task', description: '', priority: 'P1', status: 'ready', acceptanceCriteria: [] },
        { title: 'Blocked task', description: '', priority: 'P1', status: 'blocked', acceptanceCriteria: [], error: 'review rejected\nstack trace follows' },
      ],
    },
  });
  const planned = prompt.slice(prompt.indexOf('## Planned work'), prompt.indexOf('Blocked —'));
  assert.match(planned, /Ready task/);
  assert.ok(!planned.includes('Blocked task'), 'blocked tasks must not be told to implement in order');
  assert.match(prompt, /Blocked task — review rejected/, 'blocked section names the task and its blocker');
});
