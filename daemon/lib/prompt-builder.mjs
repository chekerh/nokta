// Turns "what this app is + what tool builds it + what GitHub shows + what we
// planned" into one paste-ready prompt for the detected coding agent. The user
// planned the work; this renders that plan as instructions the tool executes,
// instead of the user re-explaining context by hand every time.

// Short, tool-agnostic guardrails carried into every generated prompt. They
// mirror the workspace runner's own boundaries (local edits + checks only; no
// publish/push/deploy/credentials) so a hand-off prompt cannot ask the agent to
// do more than Nokta itself would.
const BASE_GUARDRAILS = [
  'Work only inside this repository.',
  'Do not publish, push, deploy, purchase, or modify credentials.',
  'Preserve existing uncommitted user edits; never reset unrelated work.',
  'Read source before making claims. Report blockers honestly instead of guessing.',
];

// How each tool likes to be addressed. Kept minimal and factual — the point is
// a prompt that reads naturally in that tool, not a personality gimmick. The
// "run the checks" instruction is deliberately not here: it belongs to the
// Checks section below, which only exists when checks are configured.
const TOOL_STYLE = {
  'claude-code': { address: 'Claude Code', conventions: 'Follow CLAUDE.md conventions. Use your tool set to inspect files before editing.' },
  codex: { address: 'Codex CLI', conventions: 'Follow AGENTS.md conventions. Use your tool set to inspect files before editing.' },
  cursor: { address: 'Cursor', conventions: 'Follow .cursorrules. Use Cursor agent mode to inspect files before editing.' },
  windsurf: { address: 'Windsurf', conventions: 'Follow .windsurfrules. Use Cascade to inspect files before editing.' },
  copilot: { address: 'GitHub Copilot', conventions: 'Follow .github/copilot-instructions.md. Use agent mode to inspect files before editing.' },
  opencode: { address: 'OpenCode', conventions: 'Follow AGENTS.md conventions. Use your tool set to inspect files before editing.' },
  aider: { address: 'Aider', conventions: 'Follow repo conventions. Use Aider to apply edits.' },
  gemini: { address: 'Gemini CLI', conventions: 'Follow GEMINI.md conventions. Use your tool set to inspect files before editing.' },
  continue: { address: 'Continue', conventions: 'Follow repo conventions. Use Continue to apply edits.' },
};

const GENERIC_STYLE = { address: 'a coding agent', conventions: 'Inspect the repository before editing.' };

function bullets(lines) {
  return lines.map(line => `- ${line}`).join('\n');
}

// Checks run as spawn argv in the workspace, but a pasted prompt runs through a
// shell. Quote anything a shell would reinterpret so `["sh", "-c", "a && b"]`
// pastes as the same command Nokta runs.
function quoteArg(arg) {
  const value = String(arg);
  return /^[\w@%+=:,./-]+$/.test(value) ? value : JSON.stringify(value);
}

function formatCheck(args) {
  return Array.isArray(args) ? args.map(quoteArg).join(' ') : quoteArg(args);
}

function formatTask(task, index) {
  const criteria = Array.isArray(task.acceptanceCriteria) ? task.acceptanceCriteria : [];
  return [`${index}. [${task.priority || 'P1'}] ${task.title}`, `   ${task.description || ''}`.trim(), ...(criteria.length ? ['   Done when:', ...criteria.map(criterion => `   - ${criterion}`)] : [])].join('\n');
}

// context: { project: {name, rootPath, goal, checks, tasks}, tooling: detectProjectTools result, github: fetchRepoContext result }
export function buildAgentPrompt(context = {}) {
  const project = context.project || {};
  const tooling = context.tooling || {};
  const github = context.github || {};
  const style = (tooling.primary && TOOL_STYLE[tooling.primary.id]) || GENERIC_STYLE;

  const lines = [];
  lines.push(`You are ${style.address}, working in ${project.rootPath || 'this repository'}.`);
  lines.push(style.conventions);
  lines.push('');

  lines.push('## Goal');
  lines.push(project.goal || 'No goal recorded yet.');
  lines.push('');

  if (github?.available) {
    lines.push('## Repository on GitHub');
    lines.push(`${github.url} — ${github.description || 'no description'} · default branch ${github.defaultBranch} · ${github.stars} stars`);
    if (github.recentCommits?.length) {
      lines.push('Recent commits:');
      lines.push(bullets(github.recentCommits.map(commit => `${commit.sha} ${commit.message} (${commit.author})`)));
    }
    if (github.openPulls?.length) lines.push(`Open pull requests: ${github.openPulls.map(pr => `#${pr.number} ${pr.title}`).join('; ')}`);
    if (github.openIssues?.length) lines.push(`Open issues: ${github.openIssues.map(issue => `#${issue.number} ${issue.title}`).join('; ')}`);
    lines.push('');
  }

  const tasks = Array.isArray(project.tasks) ? project.tasks : [];
  const pending = tasks.filter(task => task.status !== 'done');
  const active = pending.filter(task => task.status !== 'blocked');
  const blocked = pending.filter(task => task.status === 'blocked');
  if (active.length) {
    lines.push('## Planned work');
    lines.push('Implement these tasks in order. Do not expand scope beyond them.');
    lines.push(active.map((task, index) => formatTask(task, index + 1)).join('\n\n'));
    lines.push('');
  }
  if (blocked.length) {
    lines.push('Blocked — do not start these until the blocker is cleared:');
    lines.push(bullets(blocked.map(task => `${task.title}${task.error ? ` — ${String(task.error).split('\n')[0]}` : ''}`)));
    lines.push('');
  }

  const checks = Array.isArray(project.checks) ? project.checks : [];
  if (checks.length) {
    lines.push('## Checks');
    lines.push('Run these after editing and iterate until they pass:');
    lines.push(bullets(checks.map(formatCheck)));
    lines.push('');
  }

  if (tooling.instructionFiles?.length) {
    lines.push(`Respect the existing instruction file(s) in this repo: ${tooling.instructionFiles.join(', ')}.`);
    lines.push('');
  }

  lines.push('## Guardrails');
  lines.push(bullets(BASE_GUARDRAILS));

  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
}


