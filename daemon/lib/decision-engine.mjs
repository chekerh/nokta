import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { atomicWrite } from './atomic-write.mjs';

const DECISION_TYPES = ['architectural', 'ui-ux', 'technology', 'process', 'security'];

function makeTimestamp() {
  return new Date().toISOString();
}

function makeId(prefix = 'DEC-') {
  return prefix + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
}

function getStoragePath(projectRoot) {
  return path.join(projectRoot, '.nokta', 'decisions.json');
}

async function loadData(projectRoot) {
  const filePath = getStoragePath(projectRoot);
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return { decisions: {}, nextId: 1 };
  }
}

async function saveData(projectRoot, data) {
  const filePath = getStoragePath(projectRoot);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await atomicWrite(filePath, data);
}

export class DecisionEngine {
  constructor(projectRoot, options = {}) {
    this.projectRoot = projectRoot;
    this.log = options.log || { debug() {}, info() {}, warn() {}, error: console.error };
  }

  async _load() {
    if (!this._data) {
      this._data = await loadData(this.projectRoot);
    }
    return this._data;
  }

  async _save() {
    if (this._data) {
      await saveData(this.projectRoot, this._data);
    }
  }

  getDecisionTemplate(type) {
    const templates = {
      architectural: {
        title: '[Architectural Decision]',
        description: 'Describe the architectural decision being made.',
        rationale: 'Why is this decision necessary? What problem does it solve?',
        alternativesConsidered: ['Option A: Description', 'Option B: Description'],
        impactAssessment: 'What are the expected outcomes and trade-offs?',
      },
      'ui-ux': {
        title: '[UI/UX Decision]',
        description: 'Describe the user interface or experience decision.',
        rationale: 'Why this design choice? What user problem does it solve?',
        alternativesConsidered: ['Alternative A', 'Alternative B'],
        impactAssessment: 'Impact on user experience and development effort.',
      },
      technology: {
        title: '[Technology Decision]',
        description: 'Describe the technology choice.',
        rationale: 'Why this technology? What are the alternatives?',
        alternativesConsidered: ['Technology A', 'Technology B'],
        impactAssessment: 'Learning curve, community support, maintenance.',
      },
      process: {
        title: '[Process Decision]',
        description: 'Describe the development process change.',
        rationale: 'Why change the current process?',
        alternativesConsidered: ['Current process', 'Proposed alternatives'],
        impactAssessment: 'Team productivity and workflow impact.',
      },
      security: {
        title: '[Security Decision]',
        description: 'Describe the security control or approach.',
        rationale: 'What threat does this address?',
        alternativesConsidered: ['Alternative controls', 'Do nothing'],
        impactAssessment: 'Risk reduction vs implementation cost.',
      },
    };
    return templates[type] || templates.architectural;
  }

  async createDecision(attrs) {
    const data = await this._load();
    const id = makeId();
    const now = makeTimestamp();

    if (!attrs.type || !DECISION_TYPES.includes(attrs.type)) {
      throw new Error(`Invalid type: ${attrs.type}. Must be one of: ${DECISION_TYPES.join(', ')}`);
    }
    if (!attrs.title || !attrs.title.trim()) {
      throw new Error('Decision title is required');
    }

    const decision = {
      id,
      type: attrs.type,
      title: attrs.title.trim(),
      description: attrs.description || '',
      rationale: attrs.rationale || '',
      alternativesConsidered: Array.isArray(attrs.alternativesConsidered) ? attrs.alternativesConsidered : [],
      status: attrs.status || 'proposed',
      decisionDate: attrs.decisionDate || null,
      reviewedBy: attrs.reviewedBy || null,
      effectiveDate: attrs.effectiveDate || null,
      supersededBy: attrs.supersededBy || null,
      supersedes: attrs.supedes || null,
      tags: Array.isArray(attrs.tags) ? attrs.tags : [],
      relatedFiles: Array.isArray(attrs.relatedFiles) ? attrs.relatedFiles : [],
      relatedItems: Array.isArray(attrs.relatedItems) ? attrs.relatedItems : [],
      implementedIn: attrs.implementedIn || null,
      impactAssessment: attrs.impactAssessment || '',
      createdAt: now,
      updatedAt: now,
    };

    data.decisions[id] = decision;
    await this._save();
    return { ...decision };
  }

  async getDecision(id) {
    const data = await this._load();
    const decision = data.decisions[id];
    if (!decision) throw new Error(`Decision not found: ${id}`);
    return { ...decision };
  }

  async updateDecision(id, updates) {
    const data = await this._load();
    const decision = data.decisions[id];
    if (!decision) throw new Error(`Decision not found: ${id}`);

    const allowed = [
      'title',
      'description',
      'rationale',
      'alternativesConsidered',
      'status',
      'decisionDate',
      'reviewedBy',
      'effectiveDate',
      'supersededBy',
      'supersedes',
      'tags',
      'relatedFiles',
      'relatedItems',
      'implementedIn',
      'impactAssessment',
    ];
    for (const key of allowed) {
      if (updates[key] !== undefined) {
        decision[key] = updates[key];
      }
    }
    decision.updatedAt = makeTimestamp();
    await this._save();
    return { ...decision };
  }

  async deleteDecision(id) {
    const data = await this._load();
    if (!data.decisions[id]) throw new Error(`Decision not found: ${id}`);
    delete data.decisions[id];
    await this._save();
    return { success: true };
  }

  async listDecisions(opts = {}) {
    const data = await this._load();
    let decisions = Object.values(data.decisions);

    if (opts.type) decisions = decisions.filter((d) => d.type === opts.type);
    if (opts.status) decisions = decisions.filter((d) => d.status === opts.status);
    if (opts.tag) decisions = decisions.filter((d) => d.tags && d.tags.includes(opts.tag));
    if (opts.since) {
      const since = new Date(opts.since);
      decisions = decisions.filter((d) => new Date(d.createdAt) >= since);
    }

    const sortBy = opts.sortBy || 'createdAt';
    if (sortBy === 'updatedAt') {
      decisions.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    } else {
      decisions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    return decisions;
  }

  async getDecisionImpactAnalysis(id) {
    const decision = await this.getDecision(id);
    const data = await this._load();
    const allDecisions = Object.values(data.decisions);

    const related = allDecisions.filter(
      (d) =>
        d.id !== id &&
        ((d.relatedItems && d.relatedItems.includes(id)) || d.supersedes === id || d.supersededBy === id),
    );

    const linkedItems = decision.relatedItems || [];

    let impactLevel = 'low';
    if (decision.status === 'accepted' && linkedItems.length > 0) impactLevel = 'medium';
    if (decision.status === 'accepted' && (decision.impactAssessment || '').length > 100) impactLevel = 'high';

    return {
      decisionId: id,
      title: decision.title,
      status: decision.status,
      impactLevel,
      linkedItems: linkedItems.length,
      relatedDecisions: related.length,
      relatedDecisionIds: related.map((d) => d.id),
      implementationStatus: decision.implementedIn ? 'implemented' : 'pending',
      riskFactors:
        related.length === 0 && decision.status === 'accepted' ? ['No related decisions found', 'No items linked'] : [],
    };
  }

  async findRelatedDecisions(id, opts = {}) {
    const data = await this._load();
    const decision = data.decisions[id];
    if (!decision) throw new Error(`Decision not found: ${id}`);

    const all = Object.values(data.decisions).filter((d) => d.id !== id);

    if (opts.relationship === 'supersedes') {
      return all.filter((d) => d.supersedes === id);
    }
    if (opts.relationship === 'supersededBy') {
      return all.filter((d) => d.supersededBy === id);
    }
    if (opts.relationship === 'related-items') {
      return all.filter((d) => d.relatedItems && d.relatedItems.includes(id));
    }

    return all.filter((d) => {
      if (d.supersedes === id || d.supersededBy === id) return true;
      if (d.relatedItems && d.relatedItems.includes(id)) return true;
      if (d.type === decision.type) return true;
      const sharedTags = (d.tags || []).filter((t) => (decision.tags || []).includes(t));
      return sharedTags.length > 0;
    });
  }
}
