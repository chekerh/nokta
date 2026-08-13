import * as fsp from 'node:fs/promises';
import * as path from 'node:path';

function extractKeywords(text, max = 15) {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s\-_]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3 && w.length < 40);

  const freq = new Map();
  for (const w of words) {
    freq.set(w, (freq.get(w) || 0) + 1);
  }

  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([word]) => word);
}

function extractSkillsFromBrainstorm(suggestions) {
  const skills = new Map();

  if (!Array.isArray(suggestions)) return Array.from(skills.values());

  for (const s of suggestions) {
    if (!s || typeof s !== 'object') continue;
    const title = (s.title || s.task || s.description || '').toLowerCase();
    const keywords = extractKeywords(title);

    for (const kw of keywords) {
      if (skills.has(kw)) {
        const existing = skills.get(kw);
        existing.occurrences++;
        existing.confidence = Math.min(0.99, existing.confidence + 0.05);
      } else {
        skills.set(kw, {
          id: kw,
          name: kw.replace(/_/g, ' '),
          category: 'brainstorm',
          source: 'brainstorm',
          occurrences: 1,
          confidence: 0.5,
          createdAt: new Date().toISOString(),
        });
      }
    }
  }

  return Array.from(skills.values());
}

function extractSkillsFromSprintItems(items) {
  const skills = new Map();

  if (!items || !Array.isArray(items)) return Array.from(skills.values());

  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const title = item.title || '';
    const description = item.description || '';
    const type = item.type || 'task';
    const typeSkills = extractKeywords(`${type} ${title} ${description}`);

    for (const kw of typeSkills) {
      if (skills.has(kw)) {
        const existing = skills.get(kw);
        existing.occurrences++;
        existing.types.add(type);
      } else {
        skills.set(kw, {
          id: kw,
          name: kw.replace(/_/g, ' '),
          category: type,
          source: 'sprint-items',
          occurrences: 1,
          types: new Set([type]),
          confidence: 0.3,
          createdAt: new Date().toISOString(),
        });
      }
    }
  }

  return Array.from(skills.values()).map((s) => {
    if (s.types) {
      s.types = Array.from(s.types);
    }
    return s;
  });
}

function extractSkillsFromFeedback(feedbackEntries) {
  const skills = new Map();

  if (!feedbackEntries || !Array.isArray(feedbackEntries)) return Array.from(skills.values());

  for (const entry of feedbackEntries) {
    if (!entry || typeof entry !== 'object') continue;
    const text = `${entry.title || ''} ${entry.description || ''} ${entry.reasoning || ''}`;
    const keywords = extractKeywords(text);

    for (const kw of keywords) {
      if (skills.has(kw)) {
        skills.get(kw).occurrences++;
      } else {
        skills.set(kw, {
          id: kw,
          name: kw.replace(/_/g, ' '),
          category: entry.type || 'feedback',
          source: 'feedback',
          occurrences: 1,
          confidence: 0.7,
          createdAt: new Date().toISOString(),
        });
      }
    }
  }

  return Array.from(skills.values());
}

function mergeSkills(existing, extracted) {
  const merged = new Map();

  for (const s of existing) {
    merged.set(s.id, { ...s });
  }

  for (const s of extracted) {
    if (merged.has(s.id)) {
      const existingItem = merged.get(s.id);
      existingItem.occurrences = (existingItem.occurrences || 0) + s.occurrences;
      existingItem.confidence = Math.min(0.99, (existingItem.confidence || 0) + 0.02);
      existingItem.updatedAt = new Date().toISOString();
    } else {
      merged.set(s.id, { ...s });
    }
  }

  return Array.from(merged.values()).sort((a, b) => {
    const scoreA = a.occurrences * (a.confidence || 0.5);
    const scoreB = b.occurrences * (b.confidence || 0.5);
    return scoreB - scoreA;
  });
}

export async function synthesizeSkills(projectRoot, sources = {}) {
  const learnedPath = path.join(projectRoot, '.nokta', 'learned');
  await fsp.mkdir(learnedPath, { recursive: true });

  const skillsPath = path.join(learnedPath, 'skills.json');
  let existing = [];
  try {
    existing = JSON.parse(await fsp.readFile(skillsPath, 'utf8'));
  } catch {}

  const extracted = [];

  if (sources.brainstorm) {
    extracted.push(...extractSkillsFromBrainstorm(sources.brainstorm));
  }

  if (sources.sprintItems) {
    extracted.push(...extractSkillsFromSprintItems(sources.sprintItems));
  }

  if (sources.feedback) {
    extracted.push(...extractSkillsFromFeedback(sources.feedback));
  }

  const merged = mergeSkills(existing, extracted);

  await fsp.writeFile(skillsPath, JSON.stringify({ skills: merged, total: merged.length }, null, 2), 'utf8');

  return {
    skills: merged,
    total: merged.length,
    new: extracted.length,
  };
}

export async function getSkills(projectRoot) {
  const skillsPath = path.join(projectRoot, '.nokta', 'learned', 'skills.json');
  try {
    const data = JSON.parse(await fsp.readFile(skillsPath, 'utf8'));
    if (Array.isArray(data)) return { skills: data, total: data.length };
    return data;
  } catch {
    return { skills: [], total: 0 };
  }
}

export async function rankSkills(projectRoot, feedbackData = {}) {
  const { skills } = await getSkills(projectRoot);
  const patternsPath = path.join(projectRoot, '.nokta', 'learned', 'patterns.json');

  let patterns = {};
  try {
    patterns = JSON.parse(await fsp.readFile(patternsPath, 'utf8'));
  } catch {}

  return skills
    .map((skill) => {
      const feedbackBoost = feedbackData[skill.name] || feedbackData[skill.id] || 0;
      const acceptanceBonus =
        patterns.acceptedItems > 0
          ? (patterns.commonLabels || []).filter((l) => skill.name.includes(l)).length * 0.1
          : 0;

      return {
        ...skill,
        rankingScore: (skill.occurrences || 0) * (skill.confidence || 0.5) + feedbackBoost + acceptanceBonus,
      };
    })
    .sort((a, b) => b.rankingScore - a.rankingScore);
}
