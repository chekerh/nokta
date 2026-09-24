const $ = id => document.getElementById(id);
let projects = [];
let selected = localStorage.getItem('nokta-workspace-project');
let editing = null;
let loading = false;
let selectedTask = null;
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
}
function openForm(project = null) {
  editing = project?.id || null;
  $('project-form').reset();
  $('form-title').textContent = project ? 'Configure project' : 'Add a project';
  for (const name of ['name', 'rootPath', 'goal', 'executionModel', 'verificationModel']) $(name).value = project?.[name] || '';
  $('name').disabled = Boolean(project);
  $('rootPath').disabled = Boolean(project);
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
  try { await api(`/projects/${selected}/${action}`, 'POST'); notice(''); await refresh(); }
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
      try { await api(`/projects/${project.id}/tasks/${id}/retry`, 'POST'); $('task-dialog').close(); await refresh(); }
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
