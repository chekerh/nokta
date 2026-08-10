import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exec } from 'node:child_process';
import { acquireLock, releaseLock } from './lock.mjs';
import { atomicWrite } from './atomic-write.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  'upstream',
  'ui-ux-pro-max-skill',
  'src',
  'ui-ux-pro-max',
  'scripts',
  'search.py',
);

const STORAGE_FILE = 'items.json';
const ITEM_TYPES = ['story', 'task', 'bug', 'subtask'];
const PRIORITIES = ['P0', 'P1', 'P2', 'P3', 'P4'];
const ITEM_STATUSES = ['backlog', 'ready', 'in-progress', 'review', 'done', 'cancelled'];
const SPRINT_STATUSES = ['planning', 'active', 'review', 'closed'];

function makeTimestamp() {
  return new Date().toISOString();
}

function getStorageDir(projectRoot) {
  return path.join(projectRoot, '.nokta', 'sprints');
}

async function getStoragePath(projectRoot) {
  const dir = getStorageDir(projectRoot);
  await fs.mkdir(dir, { recursive: true });
  return path.join(dir, STORAGE_FILE);
}

function createDefaultData() {
  return {
    items: {},
    epics: {},
    initiatives: {},
    sprints: {},
    nextItemId: 1,
    nextEpicId: 1,
    nextInitiativeId: 1,
    nextSprintId: 1,
  };
}

async function loadData(projectRoot) {
  const filePath = await getStoragePath(projectRoot);
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return createDefaultData();
  }
}

async function saveData(projectRoot, data) {
  const filePath = await getStoragePath(projectRoot);
  await atomicWrite(filePath, data);
}

function padId(num, digits = 4) {
  return String(num).padStart(digits, '0');
}

export class SprintEngine {
  constructor(projectRoot, options = {}) {
    this.projectRoot = projectRoot;
    this.log = options.log || { debug() {}, info() {}, warn() {}, error: console.error };
    this.chatHandler = options.chatHandler || null;
    this.decisionEngine = options.decisionEngine || null;
  }

  async _load() {
    if (!this._data) {
      await acquireLock(`sprint:${this.projectRoot}`);
      try {
        this._data = await loadData(this.projectRoot);
      } finally {
        releaseLock(`sprint:${this.projectRoot}`);
      }
    }
    return this._data;
  }

  async _save() {
    if (this._data) {
      await acquireLock(`sprint:${this.projectRoot}`);
      try {
        await saveData(this.projectRoot, this._data);
      } finally {
        releaseLock(`sprint:${this.projectRoot}`);
      }
    }
  }

  async getSummary() {
    const data = await this._load();
    const items = Object.values(data.items);
    const sprints = Object.values(data.sprints);
    const activeSprint = sprints.find((s) => s.status === 'active');
    return {
      totalItems: items.length,
      byStatus: {
        backlog: items.filter((i) => i.status === 'backlog').length,
        ready: items.filter((i) => i.status === 'ready').length,
        inProgress: items.filter((i) => i.status === 'in-progress').length,
        review: items.filter((i) => i.status === 'review').length,
        done: items.filter((i) => i.status === 'done').length,
        cancelled: items.filter((i) => i.status === 'cancelled').length,
      },
      byPriority: {
        P0: items.filter((i) => i.priority === 'P0').length,
        P1: items.filter((i) => i.priority === 'P1').length,
        P2: items.filter((i) => i.priority === 'P2').length,
        P3: items.filter((i) => i.priority === 'P3').length,
        P4: items.filter((i) => i.priority === 'P4').length,
      },
      epics: Object.keys(data.epics).length,
      initiatives: Object.keys(data.initiatives).length,
      sprints: sprints.length,
      activeSprint: activeSprint || null,
    };
  }

  async getUiUxDesignSystem(query) {
    return new Promise((resolve) => {
      const cmdArgs = `"${query.replace(/"/g, '\\"')}" --design-system --format markdown`;
      const cmd = `python3 "${SCRIPT_PATH}" ${cmdArgs}`;

      exec(cmd, { cwd: path.dirname(SCRIPT_PATH), maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
        if (err) {
          resolve(''); // Gracefully fallback on error
        } else {
          resolve(stdout);
        }
      });
    });
  }

  // --- Item CRUD ---

  async createItem(attrs) {
    const data = await this._load();
    const id = `NOK-${padId(data.nextItemId)}`;
    data.nextItemId++;

    if (!ITEM_TYPES.includes(attrs.type)) {
      throw new Error(`Invalid type: ${attrs.type}. Must be one of: ${ITEM_TYPES.join(', ')}`);
    }
    if (attrs.priority && !PRIORITIES.includes(attrs.priority)) {
      throw new Error(`Invalid priority: ${attrs.priority}. Must be one of: ${PRIORITIES.join(', ')}`);
    }
    const status = attrs.status || 'backlog';
    if (!ITEM_STATUSES.includes(status)) {
      throw new Error(`Invalid status: ${status}. Must be one of: ${ITEM_STATUSES.join(', ')}`);
    }

    let description = attrs.description || '';
    const uiKeywords = [
      'ui',
      'ux',
      'design',
      'css',
      'frontend',
      'button',
      'landing',
      'dashboard',
      'page',
      'component',
      'style',
      'color',
      'theme',
      'animation',
      'contrast',
      'layout',
      'form',
      'view',
      'modal',
      'card',
      'nav',
      'header',
      'footer',
      'sidebar',
      'visual',
      'chart',
      'graph',
    ];
    const titleAndDesc = `${attrs.title || ''} ${description}`.toLowerCase();
    const isUiRelated = uiKeywords.some((kw) => titleAndDesc.includes(kw));

    if (isUiRelated) {
      const designSpecs = await this.getUiUxDesignSystem(attrs.title || 'App');
      if (designSpecs) {
        description += `\n\n---\n\n### 🎨 UI/UX Pro Max Design Specs\n\n${designSpecs}`;
      }
    }

    const item = {
      id,
      type: attrs.type,
      title: attrs.title || 'Untitled',
      description,
      acceptanceCriteria: attrs.acceptanceCriteria || [],
      priority: attrs.priority || 'P2',
      status,
      sprint: attrs.sprint || null,
      epic: attrs.epic || null,
      initiative: attrs.initiative || null,
      parent: attrs.parent || null,
      autoGenerated: attrs.autoGenerated || false,
      relatedFiles: attrs.relatedFiles || [],
      evidence: attrs.evidence || [],
      dependencies: attrs.dependencies || [],
      labels: attrs.labels || [],
      storyPoints: attrs.storyPoints || null,
      assignee: attrs.assignee || null,
      createdAt: makeTimestamp(),
      updatedAt: makeTimestamp(),
    };

    data.items[id] = item;
    await this._save();
    return item;
  }

  async getItem(id) {
    const data = await this._load();
    const item = data.items[id];
    if (!item) throw new Error(`Item not found: ${id}`);
    return { ...item };
  }

  async updateItem(id, updates) {
    const data = await this._load();
    const item = data.items[id];
    if (!item) throw new Error(`Item not found: ${id}`);

    const allowed = [
      'title',
      'description',
      'acceptanceCriteria',
      'priority',
      'status',
      'sprint',
      'epic',
      'initiative',
      'relatedFiles',
      'evidence',
      'dependencies',
      'labels',
      'storyPoints',
      'assignee',
      'autoGenerated',
    ];
    for (const key of allowed) {
      if (updates[key] !== undefined) {
        if (key === 'status' && !ITEM_STATUSES.includes(updates[key])) {
          throw new Error(`Invalid status: ${updates[key]}`);
        }
        if (key === 'priority' && !PRIORITIES.includes(updates[key])) {
          throw new Error(`Invalid priority: ${updates[key]}`);
        }
        item[key] = updates[key];
      }
    }
    item.updatedAt = makeTimestamp();
    data.items[id] = item;
    await this._save();
    return { ...item };
  }

  async deleteItem(id) {
    const data = await this._load();
    if (!data.items[id]) throw new Error(`Item not found: ${id}`);
    delete data.items[id];
    for (const s of Object.values(data.sprints)) {
      s.itemIds = s.itemIds.filter((iid) => iid !== id);
    }
    await this._save();
    return { success: true };
  }

  async listItems(opts = {}) {
    const data = await this._load();
    let items = Object.values(data.items);
    if (opts.type) items = items.filter((i) => i.type === opts.type);
    if (opts.status) items = items.filter((i) => i.status === opts.status);
    if (opts.sprint) items = items.filter((i) => i.sprint === opts.sprint);
    if (opts.epic) items = items.filter((i) => i.epic === opts.epic);
    if (opts.priority) items = items.filter((i) => i.priority === opts.priority);
    if (opts.autoGenerated !== undefined) items = items.filter((i) => i.autoGenerated === opts.autoGenerated);
    if (opts.label) items = items.filter((i) => i.labels.includes(opts.label));
    if (opts.search) {
      const q = opts.search.toLowerCase();
      items = items.filter((i) => i.title.toLowerCase().includes(q) || i.description.toLowerCase().includes(q));
    }
    const sortBy = opts.sortBy || 'createdAt';
    if (sortBy === 'priority')
      return items.sort((a, b) => PRIORITIES.indexOf(a.priority) - PRIORITIES.indexOf(b.priority));
    if (sortBy === 'updatedAt') return items.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    return items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  // --- Epic CRUD ---

  async createEpic(attrs) {
    const data = await this._load();
    const id = `EPIC-${padId(data.nextEpicId)}`;
    data.nextEpicId++;

    const epic = {
      id,
      title: attrs.title || 'Untitled Epic',
      description: attrs.description || '',
      initiative: attrs.initiative || null,
      status: attrs.status || 'active',
      createdAt: makeTimestamp(),
      updatedAt: makeTimestamp(),
    };
    data.epics[id] = epic;
    await this._save();
    return epic;
  }

  async getEpic(id) {
    const data = await this._load();
    const epic = data.epics[id];
    if (!epic) throw new Error(`Epic not found: ${id}`);
    return { ...epic };
  }

  async updateEpic(id, updates) {
    const data = await this._load();
    const epic = data.epics[id];
    if (!epic) throw new Error(`Epic not found: ${id}`);
    const allowed = ['title', 'description', 'status', 'initiative'];
    for (const key of allowed) {
      if (updates[key] !== undefined) epic[key] = updates[key];
    }
    epic.updatedAt = makeTimestamp();
    await this._save();
    return { ...epic };
  }

  async listEpics() {
    const data = await this._load();
    return Object.values(data.epics);
  }

  async deleteEpic(id) {
    const data = await this._load();
    if (!data.epics[id]) throw new Error(`Epic not found: ${id}`);
    delete data.epics[id];
    for (const item of Object.values(data.items)) {
      if (item.epic === id) item.epic = null;
    }
    await this._save();
    return { success: true };
  }

  // --- Initiative CRUD ---

  async createInitiative(attrs) {
    const data = await this._load();
    const id = `INI-${padId(data.nextInitiativeId)}`;
    data.nextInitiativeId++;
    const initiative = {
      id,
      title: attrs.title || 'Untitled Initiative',
      description: attrs.description || '',
      theme: attrs.theme || '',
      status: attrs.status || 'active',
      createdAt: makeTimestamp(),
      updatedAt: makeTimestamp(),
    };
    data.initiatives[id] = initiative;
    await this._save();
    return initiative;
  }

  async listInitiatives() {
    const data = await this._load();
    return Object.values(data.initiatives);
  }

  async deleteInitiative(id) {
    const data = await this._load();
    if (!data.initiatives[id]) throw new Error(`Initiative not found: ${id}`);
    delete data.initiatives[id];
    for (const epic of Object.values(data.epics)) {
      if (epic.initiative === id) epic.initiative = null;
    }
    await this._save();
    return { success: true };
  }

  // --- Sprint CRUD ---

  async createSprint(attrs) {
    const data = await this._load();
    const id = `S${padId(data.nextSprintId, 1)}`;
    data.nextSprintId++;

    const sprint = {
      id,
      goal: attrs.goal || '',
      startDate: attrs.startDate || null,
      endDate: attrs.endDate || null,
      itemIds: attrs.itemIds || [],
      status: attrs.status || 'planning',
      velocity: null,
      createdAt: makeTimestamp(),
      updatedAt: makeTimestamp(),
    };
    if (!SPRINT_STATUSES.includes(sprint.status)) {
      throw new Error(`Invalid sprint status: ${sprint.status}`);
    }
    data.sprints[id] = sprint;
    await this._save();
    return sprint;
  }

  async getSprint(id) {
    const data = await this._load();
    const sprint = data.sprints[id];
    if (!sprint) throw new Error(`Sprint not found: ${id}`);
    return { ...sprint };
  }

  async updateSprint(id, updates) {
    const data = await this._load();
    const sprint = data.sprints[id];
    if (!sprint) throw new Error(`Sprint not found: ${id}`);
    const allowed = ['goal', 'startDate', 'endDate', 'itemIds', 'status', 'velocity'];
    for (const key of allowed) {
      if (updates[key] !== undefined) sprint[key] = updates[key];
    }
    sprint.updatedAt = makeTimestamp();
    await this._save();
    return { ...sprint };
  }

  async listSprints() {
    const data = await this._load();
    return Object.values(data.sprints).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  async deleteSprint(id) {
    const data = await this._load();
    if (!data.sprints[id]) throw new Error(`Sprint not found: ${id}`);
    delete data.sprints[id];
    for (const item of Object.values(data.items)) {
      if (item.sprint === id) item.sprint = null;
    }
    await this._save();
    return { success: true };
  }

  async addItemsToSprint(sprintId, itemIds) {
    const data = await this._load();
    const sprint = data.sprints[sprintId];
    if (!sprint) throw new Error(`Sprint not found: ${sprintId}`);
    for (const itemId of itemIds) {
      if (!data.items[itemId]) throw new Error(`Item not found: ${itemId}`);
      if (!sprint.itemIds.includes(itemId)) {
        sprint.itemIds.push(itemId);
      }
      data.items[itemId].sprint = sprintId;
      if (data.items[itemId].status === 'backlog') {
        data.items[itemId].status = 'ready';
      }
    }
    sprint.updatedAt = makeTimestamp();
    await this._save();
    return { ...sprint, itemCount: sprint.itemIds.length };
  }

  async removeItemsFromSprint(sprintId, itemIds) {
    const data = await this._load();
    const sprint = data.sprints[sprintId];
    if (!sprint) throw new Error(`Sprint not found: ${sprintId}`);
    sprint.itemIds = sprint.itemIds.filter((id) => !itemIds.includes(id));
    for (const itemId of itemIds) {
      if (data.items[itemId]) {
        data.items[itemId].sprint = null;
      }
    }
    sprint.updatedAt = makeTimestamp();
    await this._save();
    return { ...sprint, itemCount: sprint.itemIds.length };
  }

  // --- Auto-update from file changes ---

  async autoUpdate(change) {
    const data = await this._load();
    const updates = [];
    const items = Object.values(data.items);
    const activeSprint = Object.values(data.sprints).find((s) => s.status === 'active');
    const relevantItems = items.filter(
      (i) =>
        i.status !== 'done' &&
        i.status !== 'cancelled' &&
        (activeSprint ? i.sprint === activeSprint.id : true) &&
        (i.relatedFiles || []).some((f) => change.file.includes(f) || f.includes(change.file)),
    );

    for (const item of relevantItems) {
      if (item.status === 'in-progress') {
        item.status = 'review';
        item.updatedAt = makeTimestamp();
        updates.push({
          id: item.id,
          title: item.title,
          oldStatus: 'in-progress',
          newStatus: 'review',
          reason: `Related file changed: ${change.file}`,
        });
      } else if (item.status === 'backlog' || item.status === 'ready') {
        item.status = 'in-progress';
        item.updatedAt = makeTimestamp();
        updates.push({
          id: item.id,
          title: item.title,
          oldStatus: item.status,
          newStatus: 'in-progress',
          reason: `Activity detected on related file: ${change.file}`,
        });
      }
    }

    if (updates.length > 0) {
      await this._save();
      this.log.info(`Auto-update: ${updates.length} items changed`, { updates });
    }

    return updates;
  }

  // --- PR Review ---

  async reviewPR(branch, diff, _opts = {}) {
    const data = await this._load();
    const comments = [];
    const conventions = {
      errorHandling: /console\.(log|error|warn)\s*\(/,
      debugLeftovers: /debugger\s*;?/,
      todoLeftovers: /TODO|FIXME|HACK|XXX/,
      largeFunctions: /\nfunction\s+\w+[\s\S]{0,500}\n\}/g,
      hardcodedSecrets: /(?:api[_-]?key|secret|password|token)[\w]*\s*[:=]\s*['"][^'"]+/i,
    };

    const lines = diff.split('\n');
    let currentFile = '';
    const additions = [];

    for (const line of lines) {
      if (line.startsWith('+++ b/')) {
        currentFile = line.slice(6);
        continue;
      }
      if (line.startsWith('+') && !line.startsWith('+++')) {
        additions.push({ line: line.slice(1), raw: line });
      }
    }

    for (const { line } of additions) {
      for (const [ruleName, pattern] of Object.entries(conventions)) {
        if (pattern.test(line)) {
          comments.push({
            file: currentFile || 'unknown',
            severity: ruleName === 'hardcotedSecrets' ? 'error' : 'warning',
            rule: ruleName,
            message: `${ruleName}: ${line.slice(0, 100)}`,
            suggestion:
              ruleName === 'errorHandling'
                ? 'Use structured error handling instead of console.xxx'
                : ruleName === 'debugLeftovers'
                  ? 'Remove debugger statement before commit'
                  : ruleName === 'todoLeftovers'
                    ? 'Resolve TODO/FIXME before merging'
                    : ruleName === 'largeFunctions'
                      ? 'Consider breaking this function into smaller ones'
                      : ruleName === 'hardcotedSecrets'
                        ? 'Use environment variables or a secrets manager'
                        : '',
          });
        }
      }
    }

    const linkedItems = Object.values(data.items).filter((item) =>
      item.relatedFiles.some((f) => comments.some((c) => c.file.includes(f))),
    );
    const autoCloseItems = linkedItems.filter((_item) => comments.filter((c) => c.severity === 'error').length === 0);

    const summary = {
      branch,
      totalAdditions: additions.length,
      issuesFound: comments.length,
      errors: comments.filter((c) => c.severity === 'error').length,
      warnings: comments.filter((c) => c.severity === 'warning').length,
      overall: comments.some((c) => c.severity === 'error')
        ? 'changes-requested'
        : comments.length > 0
          ? 'comment'
          : 'approved',
      linkedTasks: linkedItems.map((i) => i.id),
      autoCloseTasks: autoCloseItems.map((i) => i.id),
    };

    return { summary, comments };
  }

  // --- Reports ---

  async generateSprintReport(sprintId) {
    const data = await this._load();
    const sprint = data.sprints[sprintId];
    if (!sprint) throw new Error(`Sprint not found: ${sprintId}`);

    const items = Object.values(data.items).filter((i) => i.sprint === sprintId);
    const completed = items.filter((i) => i.status === 'done');
    const added = items.filter((i) => i.autoGenerated);
    const byDay = {};
    const dayLabels = [];

    if (sprint.startDate && sprint.endDate) {
      const start = new Date(sprint.startDate);
      const end = new Date(sprint.endDate);
      const now = new Date();
      for (let d = new Date(start); d <= end && d <= now; d.setDate(d.getDate() + 1)) {
        const label = d.toISOString().slice(0, 10);
        dayLabels.push(label);
        byDay[label] = {
          completed: items.filter(
            (i) => i.status === 'done' && new Date(i.updatedAt).toISOString().slice(0, 10) <= label,
          ).length,
          total:
            items.filter((i) => i.createdAt.slice(0, 10) <= label).length +
            added.filter((a) => a.createdAt.slice(0, 10) <= label).length,
        };
      }
    }

    const report = {
      sprint: {
        id: sprint.id,
        goal: sprint.goal,
        startDate: sprint.startDate,
        endDate: sprint.endDate,
        status: sprint.status,
      },
      totalItems: items.length,
      completedItems: completed.length,
      completionRate: items.length > 0 ? Math.round((completed.length / items.length) * 100) : 0,
      velocity: sprint.velocity || null,
      byType: {
        stories: items.filter((i) => i.type === 'story').length,
        tasks: items.filter((i) => i.type === 'task').length,
        bugs: items.filter((i) => i.type === 'bug').length,
      },
      autoGeneratedCount: added.filter((i) => i.type !== 'bug').length,
      bugsFound: items.filter((i) => i.type === 'bug').length,
      burndown: dayLabels.map((d) => ({ date: d, remaining: (byDay[d]?.total || 0) - (byDay[d]?.completed || 0) })),
      items,
    };

    return report;
  }

  // --- Estimation ---

  async estimateItem(itemId) {
    const data = await this._load();
    const item = data.items[itemId];
    if (!item) throw new Error(`Item not found: ${itemId}`);

    const learnedPatterns = await this.getLearnedPatterns();

    const completedItems = Object.values(data.items).filter((i) => i.status === 'done' && i.storyPoints);
    const avgVelocity =
      completedItems.length > 0 ? completedItems.reduce((sum, i) => sum + i.storyPoints, 0) / completedItems.length : 5;

    const complexityMap = {
      story: 8,
      task: 5,
      bug: 3,
      subtask: 2,
    };

    const basePoints = complexityMap[item.type] || 5;
    const labelCount = (item.labels || []).length;
    const fileCount = (item.relatedFiles || []).length;
    const hasAcceptance = (item.acceptanceCriteria || []).length > 0;

    let multiplier = 1.0;
    if (labelCount > 3) multiplier += 0.3;
    if (fileCount > 2) multiplier += 0.5;
    if (hasAcceptance) multiplier -= 0.2;
    if ((item.evidence || []).length > 2) multiplier -= 0.1;

    let storyPoints = Math.round(basePoints * multiplier);
    if (storyPoints < 1) storyPoints = 1;

    const confidence = Math.min(completedItems.length / 10, 1.0);

    const learnedPoints = learnedPatterns.commonStoryPoints?.[item.type];
    if (learnedPoints) {
      storyPoints = learnedPoints;
    }

    return {
      itemId,
      storyPoints,
      confidence,
      method: 'complexity-analysis',
      avgVelocity: Math.round(avgVelocity * 10) / 10,
      breakdown: {
        baseType: complexityMap[item.type] || 5,
        labelComplexity: labelCount > 3 ? 1.3 : 1.0,
        fileComplexity: fileCount > 2 ? 1.5 : 1.0,
        acceptanceClarity: hasAcceptance ? 0.8 : 1.0,
        evidenceQuality: (item.evidence || []).length > 2 ? 0.9 : 1.0,
        learnedOverride: learnedPoints ? learnedPoints : null,
      },
    };
  }

  async autoPrioritize(opts = {}) {
    const data = await this._load();
    const items = Object.values(data.items).filter((i) => i.status === 'backlog');

    const activeSprint = Object.values(data.sprints).find((s) => s.status === 'active');

    const prioritized = [];

    for (const item of items) {
      let score = 0;

      // Priority-based scoring (P0 = highest)
      const priorityScore = { P0: 100, P1: 60, P2: 30, P3: 10, P4: 0 };
      score += priorityScore[item.priority] || 0;

      // Dependency scoring — items with more dependents get higher priority
      const dependents = Object.values(data.items).filter((i) => i.dependencies && i.dependencies.includes(item.id));
      score += dependents.length * 5;
      if (dependents.length > 0) score += 20;

      // File churn heuristic — items touching frequently changed files
      const recentChanges = (opts.recentChanges || []).map((c) => c.file || c);
      const hasRecentChanges = item.relatedFiles.some((f) =>
        recentChanges.some((rc) => f.includes(rc) || rc.includes(f)),
      );
      if (hasRecentChanges) score += 15;

      // Deadline scoring
      if (opts.deadlines) {
        const deadline = opts.deadlines[item.id];
        if (deadline) {
          const daysUntil = Math.max(0, (new Date(deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
          score += Math.max(0, 30 - daysUntil * 2);
        }
      }

      // User history — items with labels matching commonly accepted items get bumps
      const learnedPatterns = await this.getLearnedPatterns();
      if (learnedPatterns.commonLabels && item.labels) {
        const overlap = item.labels.filter((l) => learnedPatterns.commonLabels.includes(l));
        score += overlap.length * 3;
      }

      // Active sprint bonus
      if (activeSprint && item.sprint === activeSprint.id) score += 10;

      // Type-based adjustments
      if (item.type === 'bug') score += 20;
      if (item.type === 'story' && !item.parent) score += 10;

      prioritized.push({ item, score });
    }

    prioritized.sort((a, b) => b.score - a.score);

    return prioritized.map((p, index) => ({
      ...p.item,
      priorityScore: p.score,
      rank: index + 1,
    }));
  }

  // --- Self-Learning ---

  async getLearnedPatterns() {
    const patternsPath = path.join(this.projectRoot, '.nokta', 'learned', 'patterns.json');
    try {
      return JSON.parse(await fs.readFile(patternsPath, 'utf8'));
    } catch {
      return {
        conventions: [],
        acceptedItems: 0,
        rejectedItems: 0,
        editedItems: 0,
        commonLabels: [],
        commonPriorities: {},
        commonStoryPoints: {},
      };
    }
  }

  async recordFeedback(itemId, action) {
    const data = await this._load();
    const item = data.items[itemId];
    if (!item) throw new Error(`Item not found: ${itemId}`);

    const patterns = await this.getLearnedPatterns();
    if (action === 'accept') {
      patterns.acceptedItems++;
      if (item.storyPoints) {
        patterns.commonStoryPoints = patterns.commonStoryPoints || {};
        patterns.commonStoryPoints[item.type] = item.storyPoints;
      }
    } else if (action === 'reject') {
      patterns.rejectedItems++;
    } else if (action === 'edit') {
      patterns.editedItems++;
    }

    if (item.labels) {
      patterns.commonLabels = [...new Set([...(patterns.commonLabels || []), ...item.labels])].slice(0, 20);
    }
    if (item.priority) {
      patterns.commonPriorities = patterns.commonPriorities || {};
      patterns.commonPriorities[item.priority] = (patterns.commonPriorities[item.priority] || 0) + 1;
    }

    const patternsPath = path.join(this.projectRoot, '.nokta', 'learned', 'patterns.json');
    await atomicWrite(patternsPath, patterns);
    return patterns;
  }

  async getAuditLog() {
    const logPath = path.join(this.projectRoot, '.nokta', 'learned', 'audit.json');
    try {
      return JSON.parse(await fs.readFile(logPath, 'utf8'));
    } catch {
      return { events: [] };
    }
  }

  async logAuditEvent(event) {
    const log = await this.getAuditLog();
    log.events.unshift({ ...event, timestamp: makeTimestamp() });
    if (log.events.length > 1000) log.events.length = 1000;
    const logPath = path.join(this.projectRoot, '.nokta', 'learned', 'audit.json');
    await atomicWrite(logPath, log);
    return log;
  }

  // --- AI Brainstorm ---

  async brainstorm(context = {}, prompts = {}) {
    const projectContext = context || { stacks: [], files: [], recentChanges: [] };
    const suggestions = [];
    const stackNames = (projectContext.stacks || []).join(', ') || 'unknown';

    const enhancedContext = await this._enhanceContextWithUiUxInsights(projectContext, prompts);

    if (this.chatHandler && prompts.features) {
      const systemPrompt = `You are a product manager, senior engineer, and UI/UX expert. Given a project and a feature request, generate 3-5 concrete, actionable sprint items (stories and tasks). Each item must include: type (story/task/bug), title, description, priority (P0-P4), labels, and optionally acceptanceCriteria.

      Project context: stacks=[${stackNames}], files=${(enhancedContext.files || []).slice(0, 10).join(', ')}, recentChanges=${(enhancedContext.recentChanges || []).length}
      UI/UX Considerations: ${enhancedContext.uiUxInsights || 'None specified'}
      Feature: ${prompts.features}

      Consider:
      1. User experience and interface design principles
      2. Technical feasibility and implementation complexity
      3. Edge cases and error handling
      4. Performance and accessibility considerations
      5. Integration with existing systems

      Respond with ONLY a JSON array of items. Each item: { type, title, description, priority, labels, acceptanceCriteria? }. Be specific, actionable, and include UI/UX considerations where relevant. No markdown.`;

      try {
        const result = await this.chatHandler.handleChat([{ role: 'user', content: systemPrompt }], {
          stream: false,
          temperature: 0.5,
        });
        const content = result.content.trim();
        const cleaned = content.replace(/```(?:json)?\n?/g, '').trim();
        const parsed = JSON.parse(cleaned);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            suggestions.push({
              type: item.type || 'task',
              title: item.title || `[Brainstorm] ${prompts.features}`,
              description: item.description || `Generated from brainstorm: ${prompts.features}`,
              priority: item.priority || 'P2',
              acceptanceCriteria: item.acceptanceCriteria || [],
              autoGenerated: true,
              relatedFiles: (enhancedContext.files || []).slice(0, 5),
              evidence: enhancedContext.uiUxEvidences || [],
              labels: ['brainstorm', ...(item.labels || [])],
            });
          }
          return { suggestions, context: enhancedContext };
        }
      } catch {
        // Fall through to enhanced default suggestions
      }
    }

    const uiUxSuggestions = await this._generateUiUxAwareSuggestions(enhancedContext, prompts, stackNames);
    suggestions.push(...uiUxSuggestions);

    return { suggestions, context: enhancedContext };
  }

  // Enhance context with UI/UX insights from our design system
  async _enhanceContextWithUiUxInsights(projectContext, prompts) {
    const enhancedContext = { ...projectContext };

    const uiKeywords = [
      'ui',
      'ux',
      'design',
      'css',
      'frontend',
      'button',
      'landing',
      'dashboard',
      'page',
      'component',
      'style',
      'color',
      'theme',
      'animation',
      'contrast',
      'layout',
      'form',
      'view',
      'modal',
      'card',
      'nav',
      'header',
      'footer',
      'sidebar',
      'visual',
      'chart',
      'graph',
      'experience',
      'interface',
      'usability',
    ];
    const isUiRelated = uiKeywords.some(
      (kw) =>
        (prompts.features && prompts.features.toLowerCase().includes(kw)) ||
        (projectContext.recentChanges &&
          projectContext.recentChanges.some((change) => change.toLowerCase().includes(kw))),
    );

    if (isUiRelated) {
      try {
        const query =
          prompts.features ||
          (projectContext.recentChanges && projectContext.recentChanges[0]) ||
          'application interface';
        const designSystem = await this.getUiUxDesignSystem(query);

        if (designSystem && designSystem.trim()) {
          enhancedContext.uiUxInsights =
            designSystem.substring(0, Math.min(300, designSystem.length)) + (designSystem.length > 300 ? '...' : '');
          enhancedContext.uiUxEvidences = this._extractUiUxEvidences(designSystem);
        }
      } catch (error) {
        this.log.debug('UI/UX enhancement failed', { error: error.message });
      }
    }

    return enhancedContext;
  }

  // Extract actionable UI/UX evidences from design system output
  _extractUiUxEvidences(designSystemText) {
    const evidences = [];
    const lines = designSystemText.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (
        trimmed.startsWith('- ') ||
        trimmed.startsWith('* ') ||
        trimmed.match(/^\d+\. /) ||
        (trimmed.includes('recommend') && trimmed.length > 20 && trimmed.length < 200)
      ) {
        evidences.push(trimmed.slice(0, 150));
      }
    }

    return evidences.slice(0, 5);
  }

  // Generate UI/UX aware suggestions based on context and prompts
  async _generateUiUxAwareSuggestions(context, prompts, stackNames) {
    const suggestions = [];

    if (context.uiUxInsights) {
      suggestions.push({
        type: 'task',
        title: 'Research and implement UI/UX design recommendations',
        description: `Based on UI/UX analysis: ${context.uiUxInsights}\n\nCreate implementation plan for recommended design patterns and improvements.`,
        priority: 'P2',
        autoGenerated: true,
        relatedFiles: context.files ? context.files.slice(0, 3) : [],
        evidence: context.uiUxEvidences || [],
        labels: ['brainstorm', 'ui-ux', 'design-spike'],
      });

      suggestions.push({
        type: 'task',
        title: 'Plan and conduct usability testing',
        description:
          'Define usability test scenarios based on the implemented features.\nCreate test scripts, recruit participants, and analyze results.',
        priority: 'P3',
        autoGenerated: true,
        relatedFiles: [],
        evidence: context.uiUxEvidences || [],
        labels: ['brainstorm', 'usability', 'testing'],
      });
    }

    if (prompts.features) {
      suggestions.push({
        type: 'story',
        title: `[Brainstorm] ${prompts.features}`,
        description: `Implement the ${prompts.features} feature with attention to:\n- User experience flow\n- Interface design consistency\n- Accessibility compliance (WCAG 2.1)\n- Responsive design principles\n\nBased on context: ${stackNames}${context.uiUxInsights ? `\n\nDesign considerations: ${context.uiUxInsights.substring(0, 100)}...` : ''}`,
        priority: 'P1',
        autoGenerated: true,
        relatedFiles: context.files ? context.files.slice(0, 5) : [],
        evidence: context.uiUxEvidences || [],
        acceptanceCriteria: [
          `Feature implements ${prompts.features} as specified`,
          'UI follows established design patterns',
          'Accessibility guidelines are met (WCAG 2.1 AA)',
          'Responsive breakpoints work correctly',
          'User flow is intuitive and documented',
        ],
        labels: ['brainstorm', 'feature', 'ui-ux-enhanced'],
      });

      suggestions.push({
        type: 'task',
        title: 'Review security and error handling for new feature',
        description: `Review the ${prompts.features} feature for security concerns including input validation, authentication, authorization, and safe error messages.`,
        priority: 'P2',
        autoGenerated: true,
        relatedFiles: [],
        evidence: [],
        labels: ['brainstorm', 'security', 'review'],
      });
    }

    if (prompts.techDebt !== false) {
      suggestions.push({
        type: 'task',
        title: 'Refactor UI components for consistency and performance',
        description: `Identify and refactor UI components that:\n- Have inconsistent styling or behavior\n- Cause performance issues\n- Lack proper accessibility attributes\n- Duplicate functionality\n\nStacks: ${stackNames}`,
        priority: 'P3',
        autoGenerated: true,
        relatedFiles: [],
        evidence: [],
        labels: ['brainstorm', 'ui-refactor', 'tech-debt'],
      });
    }

    return suggestions;
  }

  // Decision Engine Integration Methods
  async linkDecisionToItem(itemId, decisionId, relationship = 'related') {
    // Validate inputs
    if (!itemId) throw new Error('Item ID is required');
    if (!decisionId) throw new Error('Decision ID is required');

    // Check if decision engine is available
    if (!this.decisionEngine) {
      throw new Error('Decision engine not configured for this SprintEngine instance');
    }

    // Verify item exists
    const item = await this.getItem(itemId);
    if (!item) throw new Error(`Item not found: ${itemId}`);

    // Verify decision exists
    const decision = await this.decisionEngine.getDecision(decisionId);
    if (!decision) throw new Error(`Decision not found: ${decisionId}`);

    // Update decision to include this item
    const currentRelatedItems = decision.relatedItems || [];
    const updatedRelatedItems = [...new Set([...currentRelatedItems, itemId])]; // Deduplicate

    await this.decisionEngine.updateDecision(decisionId, {
      relatedItems: updatedRelatedItems,
    });

    return {
      itemId,
      decisionId,
      relationship,
      timestamp: new Date().toISOString(),
      success: true,
    };
  }

  async getDecisionsForItem(itemId) {
    if (!this.decisionEngine) {
      throw new Error('Decision engine not configured for this SprintEngine instance');
    }

    const item = await this.getItem(itemId);
    if (!item) throw new Error(`Item not found: ${itemId}`);

    // Find all decisions that reference this item
    const allDecisions = await this.decisionEngine.listDecisions();
    const relatedDecisions = allDecisions.filter(
      (decision) => decision.relatedItems && decision.relatedItems.includes(itemId),
    );

    return relatedDecisions;
  }

  async getItemsForDecision(decisionId) {
    if (!this.decisionEngine) {
      throw new Error('Decision engine not configured for this SprintEngine instance');
    }

    const decision = await this.decisionEngine.getDecision(decisionId);
    if (!decision) throw new Error(`Decision not found: ${decisionId}`);

    // Get all items that are referenced in this decision's relatedItems
    if (!decision.relatedItems || decision.relatedItems.length === 0) {
      return [];
    }

    const items = [];
    for (const itemId of decision.relatedItems) {
      try {
        const item = await this.getItem(itemId);
        if (item) items.push(item);
      } catch (error) {
        // Item might have been deleted, skip it
        this.log.warn(`Could not find item ${itemId} referenced in decision ${decisionId}`, { error: error.message });
      }
    }

    return items;
  }
}
