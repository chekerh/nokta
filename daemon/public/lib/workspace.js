const $ = id => document.getElementById(id);
let projects = [];
let selected = localStorage.getItem('nokta-workspace-project');
let editing = null;
let loading = false;
let selectedTask = null;
let promptText = '';
const columns = [['ready', 'Ready'], ['in-progress', 'Implementing'], ['testing', 'Testing'], ['review', 'Review'], ['done', 'Done'], ['blocked', 'Blocked']];
const busy = project => ['queued', 'analyzing', 'running'].includes(project.status);

async function api(path = '', method = 'GET', body) {
  const response = await fetch(`/api/workspace${path}`, { method, headers: { 'X-Nokta-Workspace': '1', ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `Request failed (${response.status})`);
  return result;
}
function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function notice(message) { $('notice').textContent = message; $('notice').hidden = !message; }
function current() { return projects.find(project => project.id === selected); }

async function refresh() {
  if (loading) return;
  loading = true;
  try {
    const result = await api();
    projects = result.projects;
    if (!projects.some(project => project.id === selected)) selected = projects[0]?.id || null;
    $('connection').textContent = 'Connected';
    if (result.error) notice(result.error);
    render();
  } catch (error) {
    $('connection').textContent = 'Disconnected';
    notice(`${error.message}. Retrying automatically.`);
    for (const id of ['start', 'analyze', 'pause']) $(id).disabled = true;
  } finally { loading = false; }
}
function render() {
  // Avoid removing a keyboard-focused button during background polling.
  const focusedProject = document.activeElement?.dataset.projectId;
  const focusedTask = document.activeElement?.dataset.taskId;
  const activeId = document.activeElement?.id;
  $('project-count').textContent = projects.length;
  $('project-list').replaceChildren();
  for (const project of projects) {
    const button = element('button', undefined, 'project-nav');
    button.dataset.projectId = project.id;
    button.setAttribute('aria-current', String(selected === project.id));
    button.append(element('span', project.name), element('small', `${project.status} · ${project.tasks.filter(task => task.status === 'done').length}/${project.tasks.length} done`));
    button.addEventListener('click', () => { selected = project.id; localStorage.setItem('nokta-workspace-project', selected); render(); });
    $('project-list').append(button);
  }
  const project = current();
  $('welcome').hidden = Boolean(project);
  $('project-view').hidden = !project;
  if (!project) return;
  loadContext(project.id);
  loadPrompt(project.id);
  $('project-name').textContent = project.name;
  $('project-path').textContent = project.rootPath;
  $('project-goal').textContent = project.goal;
  $('project-state').textContent = project.status;
  $('project-message').textContent = project.message || 'Ready to analyze this project.';
  $('model-summary').textContent = `Codex CLI · Implement: ${project.executionModel} · Verify: ${project.verificationModel}`;
  $('budget-summary').textContent = `${project.taskLimit} tasks per run · ${project.checks.length} checks per task`;
  $('task-summary').textContent = `${project.tasks.filter(task => task.status === 'done').length} of ${project.tasks.length} verified`;
  for (const id of ['start', 'analyze', 'edit-project']) $(id).disabled = busy(project);
  $('pause').disabled = !busy(project);
  $('board-empty').hidden = project.tasks.length > 0;
  $('board').replaceChildren();
  for (const [status, title] of columns) {
    const tasks = project.tasks.filter(task => task.status === status);
    const column = element('section', undefined, 'column');
    column.dataset.status = status;
    const heading = element('h3', title, 'column-heading');
    heading.append(element('span', tasks.length));
    column.append(heading);
    for (const task of tasks) {
      const button = element('button', undefined, 'task');
      button.dataset.taskId = task.id;
      button.setAttribute('aria-label', `${task.title}, ${title}`);
      button.append(element('h3', task.title));
      const meta = element('div', undefined, 'task-meta');
      meta.append(element('span', task.priority), element('span', `${task.attempts.length} attempts`));
      button.append(meta);
      button.addEventListener('click', () => showTask(task.id));
      column.append(button);
    }
    if (!tasks.length) column.append(element('p', 'No tasks', 'empty-column'));
    $('board').append(column);
  }
  $('activity-list').replaceChildren();
  for (const event of project.activity.slice(0, 12)) {
    const li = element('li', event.message);
    const time = element('time', new Date(event.at).toLocaleString());
    time.dateTime = event.at;
    li.append(time);
    $('activity-list').append(li);
  }
  if (!project.activity.length) $('activity-list').append(element('li', 'Analysis and run results will appear here.'));
  $('analysis-summary').textContent = project.analysis || 'Nokta will inspect this repository before planning changes.';
  $('selected-skills').replaceChildren();
  for (const skill of project.selectedSkills || []) {
    const item = element('li', skill.name);
    item.title = skill.path;
    $('selected-skills').append(item);
  }
  if (!project.selectedSkills?.length) $('selected-skills').append(element('li', 'Relevant skills are selected for each task.'));
  $('runner-log').textContent = project.log || 'No run yet.';
  if ($('task-dialog').open && selectedTask) renderTask(selectedTask);
  if (focusedProject) document.querySelector(`[data-project-id="${focusedProject}"]`)?.focus({ preventScroll: true });
  if (focusedTask) document.querySelector(`[data-task-id="${focusedTask}"]`)?.focus({ preventScroll: true });
  if (activeId && document.getElementById(activeId)) document.getElementById(activeId).focus({ preventScroll: true });
}

function badge(tool) {
  const wrap = element('div', undefined, 'tool-badge');
  wrap.append(element('span', tool.name || tool.id, 'tool-name'));
  if (tool.primary) wrap.append(element('span', 'primary', 'tool-tag'));
  return wrap;
}

// Panels are owned per project: every async write is keyed by project id and
// only applied when that project is still selected. Without this, switching
// projects mid-flight lets a slow response overwrite the wrong project's panels.
const contextCache = new Map();
const promptCache = new Map();
const inFlight = new Set();
const failures = new Map();
const generations = new Map();
const shown = { context: null, prompt: null };
const RETRY_MS = 60000;

// The prompt caches the task list it was built from; when the list moves on
// (an autopilot cycle finishing, a repair landing) the cached prompt is stale
// and must be rebuilt even though nobody invalidated it explicitly. The status
// histogram is exact for every state the prompt's task list can reflect.
function projectFingerprint(project) {
  return project ? `${project.status}:${project.tasks.map(task => task.status).sort().join(',')}` : '';
}

function fingerprintOf(id) {
  return projectFingerprint(projects.find(project => project.id === id));
}

function panelsBusy(message) {
  $('agent-tool').replaceChildren(element('p', message, 'muted'));
  $('installed-agents').replaceChildren(element('li', 'Loading…', 'muted'));
  $('github-context').replaceChildren(element('p', message, 'muted'));
}

function panelError(message) {
  $('agent-tool').replaceChildren(element('p', message, 'muted'));
  $('installed-agents').replaceChildren(element('li', 'Unavailable while the context fails to load.', 'muted'));
  $('github-context').replaceChildren(element('p', message, 'muted'));
}

function promptBusy(id) {
  shown.prompt = id;
  promptText = '';
  $('copy-prompt').disabled = true;
  $('generated-prompt').textContent = 'Generating prompt…';
}

function promptError(id, message) {
  shown.prompt = id;
  promptText = '';
  $('generated-prompt').textContent = message;
  $('copy-prompt').disabled = true;
}

async function loadContext(id) {
  const key = `ctx:${id}`;
  if (contextCache.has(id)) {
    if (shown.context !== id) renderContext(id, contextCache.get(id));
    return;
  }
  // The user switched away and back while this project's request is still in
  // flight: the panels currently show another project, so re-assert this
  // project's busy state instead of leaving the mismatch on screen.
  if (inFlight.has(key)) {
    if (shown.context !== id) { shown.context = id; panelsBusy('Loading agent and GitHub context…'); }
    return;
  }
  // A recent failure stays visible (and is not retried on every 3s poll) until
  // it expires; if the user switches back to the failed project, show its error
  // rather than leaving the previous project's panels on screen.
  const failure = failures.get(key);
  if (failure && Date.now() - failure.at < RETRY_MS) {
    if (shown.context !== id) { shown.context = id; panelError(failure.message); }
    return;
  }
  inFlight.add(key);
  // The marker must move with the DOM write, or a later cache hit for another
  // project sees "already shown" and skips its re-render (stuck busy panels).
  if (shown.context !== id) { shown.context = id; panelsBusy('Loading agent and GitHub context…'); }
  const generation = generations.get(id) || 0;
  try {
    const result = await api(`/projects/${id}/context`);
    if ((generations.get(id) || 0) === generation) contextCache.set(id, result);
    failures.delete(key);
    if (selected === id) renderContext(id, result);
  } catch (error) {
    // A failure from before an invalidation belongs to a superseded request and
    // must not impose its backoff on the project the user just acted on.
    if ((generations.get(id) || 0) === generation) {
      failures.set(key, { at: Date.now(), message: error.message });
      if (selected === id) { shown.context = id; panelError(error.message); }
    }
  } finally { inFlight.delete(key); }
}

function renderContext(id, { tooling, github }) {
  shown.context = id;
  const toolBox = $('agent-tool');
  toolBox.replaceChildren();
  if (tooling.primary) toolBox.append(badge({ ...tooling.primary, primary: true }));
  else if (tooling.tools?.length) toolBox.append(element('p', 'Shared agent conventions only — no tool-specific evidence in this project.', 'muted'));
  else toolBox.append(element('p', 'No coding agent detected in this project yet.', 'muted'));
  for (const tool of tooling.tools || []) if (!tooling.primary || tool.id !== tooling.primary.id) toolBox.append(badge(tool));
  const installedList = $('installed-agents');
  installedList.replaceChildren();
  const installed = tooling.installed || [];
  for (const tool of installed) {
    const name = tooling.tools.find(candidate => candidate.id === tool.id)?.name || tool.id;
    installedList.append(element('li', `${name}${tool.inProject ? ' · in this project' : ''}`));
  }
  if (!installed.length) installedList.append(element('li', 'No agents detected on this machine.', 'muted'));

  const box = $('github-context');
  box.replaceChildren();
  if (github.available) {
    const link = element('a', github.url);
    link.href = github.url;
    link.target = '_blank';
    link.rel = 'noreferrer noopener';
    box.append(link);
    if (github.description) box.append(element('p', github.description, 'muted'));
    box.append(element('p', `Default branch ${github.defaultBranch} · ${github.stars} stars · ${github.authenticated ? 'authenticated' : 'public (unauthenticated)'}`, 'caption'));
    const partial = github.partial || {};
    if (partial.pulls) box.append(element('p', `Open PRs: unavailable (${partial.pulls}).`, 'muted'));
    else if (github.openPulls?.length) box.append(element('p', `Open PRs: ${github.openPulls.map(pr => `#${pr.number} ${pr.title}`).join('; ')}`, 'muted'));
    else if (Array.isArray(github.openPulls)) box.append(element('p', 'No open pull requests.', 'muted'));
    if (partial.issues) box.append(element('p', `Open issues: unavailable (${partial.issues}).`, 'muted'));
    else if (github.openIssues?.length) box.append(element('p', `Open issues: ${github.openIssues.map(issue => `#${issue.number} ${issue.title}`).join('; ')}`, 'muted'));
    else if (Array.isArray(github.openIssues)) box.append(element('p', 'No open issues.', 'muted'));
    if (partial.commits) box.append(element('p', `Recent commits: unavailable (${partial.commits}).`, 'muted'));
    else if (github.recentCommits?.length) {
      const list = element('ul', undefined, 'plain-list');
      for (const commit of github.recentCommits) list.append(element('li', `${commit.sha} ${commit.message}`));
      box.append(list);
    } else if (Array.isArray(github.recentCommits)) {
      box.append(element('p', 'No recent commits.', 'muted'));
    }
  } else {
    box.append(element('p', `No GitHub context: ${github.reason || 'unavailable'}.`, 'muted'));
  }
}

async function loadPrompt(id) {
  const key = `pr:${id}`;
  if (promptCache.has(id)) {
    const entry = promptCache.get(id);
    if (entry.fingerprint === fingerprintOf(id)) {
      if (shown.prompt !== id) renderPrompt(id, entry.text);
      return;
    }
    promptCache.delete(id); // the task list moved on; this prompt is stale
  }
  // Switched away and back mid-flight: never leave another project's prompt
  // visible (and copyable) under this project — re-assert the busy state.
  if (inFlight.has(key)) {
    if (shown.prompt !== id) promptBusy(id);
    return;
  }
  const failure = failures.get(key);
  if (failure && Date.now() - failure.at < RETRY_MS) {
    if (shown.prompt !== id) promptError(id, `Could not generate prompt: ${failure.message}`);
    return;
  }
  inFlight.add(key);
  const fingerprint = fingerprintOf(id);
  const generation = generations.get(id) || 0;
  // A same-project refresh keeps its (still valid) prompt on screen instead of
  // flashing the busy state; the cross-project case always has a stale marker.
  if (shown.prompt !== id) promptBusy(id);
  try {
    const result = await api(`/projects/${id}/prompt`);
    if ((generations.get(id) || 0) === generation) promptCache.set(id, { text: result.prompt, fingerprint });
    failures.delete(key);
    if (selected === id) renderPrompt(id, result.prompt);
  } catch (error) {
    // A failure from before an invalidation belongs to a superseded request.
    if ((generations.get(id) || 0) === generation) {
      failures.set(key, { at: Date.now(), message: error.message });
      if (selected === id) promptError(id, `Could not generate prompt: ${error.message}`);
    }
  } finally { inFlight.delete(key); }
}

function renderPrompt(id, text) {
  shown.prompt = id;
  promptText = text;
  $('generated-prompt').textContent = text || 'No prompt available for this project yet.';
  $('copy-prompt').disabled = !text;
}

$('copy-prompt').addEventListener('click', async () => {
  if (!promptText) { notice('No prompt to copy yet. Generate one first.'); return; }
  try {
    await navigator.clipboard.writeText(promptText);
    notice('Prompt copied to clipboard.');
  } catch { notice('Could not copy. Select the prompt text and copy manually.'); }
});
$('regen-prompt').addEventListener('click', () => {
  if (!selected) return;
  promptCache.delete(selected);
  failures.delete(`pr:${selected}`);
  shown.prompt = null;
  loadPrompt(selected);
});
function invalidateContext(id) {
  // Bump the generation so an in-flight response started before this
  // invalidation cannot resurrect the pre-invalidation cache entry.
  generations.set(id, (generations.get(id) || 0) + 1);
  contextCache.delete(id);
  promptCache.delete(id);
  failures.delete(`ctx:${id}`);
  failures.delete(`pr:${id}`);
}

// Discovery: scan the configured roots for app folders, then pre-fill the
// project form from a candidate so a repository never has to be typed by hand.
$('detect-apps').addEventListener('click', async () => {
  if ($('discover-dialog').open) return;
  $('discover-dialog').showModal();
  $('discover-roots').textContent = '';
  const list = $('discover-list');
  list.replaceChildren(element('li', 'Scanning for apps…', 'muted'));
  try {
    const { roots, candidates } = await api('/discover');
    $('discover-roots').textContent = `Scanned ${roots.join(', ')}`;
    list.replaceChildren();
    if (!candidates.length) { list.append(element('li', 'No apps found. Add a project manually, or point NOKTA_DISCOVERY_ROOTS at your code folders.', 'muted')); return; }
    for (const candidate of candidates) list.append(candidateRow(candidate));
  } catch (error) {
    list.replaceChildren(element('li', `Could not scan: ${error.message}`, 'muted'));
  }
});

function candidateRow(candidate) {
  const row = element('li', undefined, 'discover-item');
  const meta = element('div');
  meta.append(element('strong', candidate.name));
  meta.append(element('p', candidate.path, 'path'));
  const evidence = [candidate.hasGit ? 'git' : null, ...candidate.manifests, candidate.agent].filter(Boolean);
  if (evidence.length) meta.append(element('p', evidence.join(' · '), 'caption'));
  row.append(meta);
  if (candidate.added) row.append(element('span', 'Already added', 'local-tag'));
  else {
    const button = element('button', 'Add', 'button secondary');
    button.addEventListener('click', () => { $('discover-dialog').close(); openForm({ name: candidate.name, rootPath: candidate.path }); });
    row.append(button);
  }
  return row;
}

function openForm(project = null) {
  // A discovery candidate has no id: it pre-fills a new project rather than
  // editing an existing one.
  const existing = Boolean(project?.id);
  editing = project?.id || null;
  $('project-form').reset();
  $('form-title').textContent = existing ? 'Configure project' : 'Add a project';
  for (const name of ['name', 'rootPath', 'goal', 'executionModel', 'verificationModel']) $(name).value = project?.[name] || '';
  $('name').disabled = existing;
  $('rootPath').disabled = existing;
  $('checks').value = JSON.stringify(project?.checks || [], null, 2);
  $('taskLimit').value = String(project?.taskLimit || 3);
  $('form-error').textContent = '';
  $('project-dialog').showModal();
}
$('add-project').addEventListener('click', () => openForm());
$('welcome-add').addEventListener('click', () => openForm());
$('edit-project').addEventListener('click', () => openForm(current()));
for (const button of document.querySelectorAll('[data-close]')) button.addEventListener('click', () => $(button.dataset.close).close());
$('project-form').addEventListener('submit', async event => {
  event.preventDefault();
  $('save-project').disabled = true;
  $('form-error').textContent = '';
  try {
    let checks;
    try { checks = JSON.parse($('checks').value || '[]'); } catch { throw new Error('Checks must be valid JSON, for example [["npm", "test"]].'); }
    const body = Object.fromEntries(['name', 'rootPath', 'goal', 'runner', 'executionModel', 'verificationModel'].map(name => [name, $(name).value.trim()]));
    body.checks = checks;
    body.taskLimit = Number($('taskLimit').value);
    const result = await api(`/projects${editing ? `/${editing}` : ''}`, editing ? 'PATCH' : 'POST', body);
    selected = result.id;
    invalidateContext(selected);
    localStorage.setItem('nokta-workspace-project', selected);
    $('project-dialog').close();
    notice('');
    await refresh();
  } catch (error) { $('form-error').textContent = error.message; }
  finally { $('save-project').disabled = false; }
});
for (const action of ['analyze', 'start', 'pause']) $(action).addEventListener('click', async () => {
  if (!current()) return;
  $(action).disabled = true;
  try { await api(`/projects/${selected}/${action}`, 'POST'); notice(''); invalidateContext(selected); await refresh(); }
  catch (error) { notice(error.message); render(); }
});
function showTask(id) { selectedTask = id; renderTask(id); $('task-dialog').showModal(); }
function renderTask(id) {
  const project = current();
  const task = project?.tasks.find(candidate => candidate.id === id);
  if (!task) { $('task-dialog').close(); return; }
  $('task-title').textContent = task.title;
  const content = $('task-content');
  content.replaceChildren(element('p', task.description));
  content.append(element('h3', 'Acceptance criteria'));
  const criteria = element('ul');
  for (const criterion of task.acceptanceCriteria) criteria.append(element('li', criterion));
  content.append(criteria);
  if (task.error) content.append(element('pre', task.error));
  task.attempts.forEach((attempt, index) => {
    content.append(element('h3', `Attempt ${index + 1} · ${attempt.executor} → ${attempt.verifier}`));
    if (attempt.implementation) content.append(element('p', attempt.implementation.summary));
    for (const check of attempt.checks) {
      const details = element('details');
      details.append(element('summary', `${check.code === 0 && !check.error ? 'Passed' : 'Failed'}: ${check.command.join(' ')}`), element('pre', check.output || 'No output.'));
      content.append(details);
    }
    if (attempt.review) content.append(element('p', `Review: ${attempt.review.summary}`));
  });
  if (task.status === 'blocked') {
    const retry = element('button', 'Move back to ready', 'button secondary');
    retry.disabled = busy(project);
    retry.addEventListener('click', async () => {
      try { await api(`/projects/${project.id}/tasks/${id}/retry`, 'POST'); invalidateContext(project.id); $('task-dialog').close(); await refresh(); }
      catch (error) { notice(error.message); }
    });
    content.append(retry);
  }
}
async function loadTools() {
  try {
    const tools = await api('/tools');
    const runner = tools.runners[0];
    $('tools-status').textContent = `${runner.installed ? 'Codex CLI ready' : 'Codex CLI not found'} · ${tools.skillsCount} local skills`;
    $('tools-status').title = `${runner.version}\n${tools.skillsRoot}`;
    if (tools.skillsError) notice(`Local skills unavailable: ${tools.skillsError}`);
  } catch (error) { $('tools-status').textContent = error.message; }
}
await refresh();
await loadTools();
setInterval(() => { if (!document.hidden) refresh(); }, 3000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
