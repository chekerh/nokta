import fs from 'node:fs';
import path from 'node:path';
import { IGNORE_DIRS } from './search-ignore.mjs';
import { TEXT_EXTENSIONS, IGNORE_EXTENSIONS } from './file-extensions.mjs';

const MAX_FILE_SIZE = 100000;
const MAX_FILES = 500;

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[._\-\s]+/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && t.length < 50);
}

function buildTfVector(tokens, vocabArray) {
  const vec = new Float64Array(vocabArray.length);
  const termFreq = new Map();
  for (const t of tokens) {
    termFreq.set(t, (termFreq.get(t) || 0) + 1);
  }
  const total = tokens.length || 1;
  for (let i = 0; i < vocabArray.length; i++) {
    vec[i] = (termFreq.get(vocabArray[i]) || 0) / total;
  }
  return vec;
}

function cosineSim(a, b) {
  let dot = 0;
  let magA = 0;
  let magB = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

async function buildCorpus(rootDir, maxFiles = MAX_FILES) {
  const docTokens = [];
  const docMeta = [];
  const vocab = new Set();

  const walk = async (dir) => {
    if (docMeta.length >= maxFiles) return;
    let entries;
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (docMeta.length >= maxFiles) return;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORE_DIRS.has(entry.name)) await walk(fullPath);
        continue;
      }
      const ext = path.extname(entry.name).toLowerCase();
      if (!TEXT_EXTENSIONS.has(ext) || IGNORE_EXTENSIONS.has(ext)) continue;
      try {
        const stat = await fs.promises.stat(fullPath);
        if (stat.size > MAX_FILE_SIZE) continue;
        const content = await fs.promises.readFile(fullPath, 'utf8');
        const tokens = tokenize(content);
        for (const t of tokens) vocab.add(t);
        docTokens.push(tokens);
        docMeta.push({
          file: path.relative(rootDir, fullPath),
          ext,
          tokenCount: tokens.length,
          snippet: content.split('\n').slice(0, 5).join('\n').slice(0, 500),
        });
      } catch {}
    }
  };

  await walk(rootDir);
  return { docTokens, docMeta, vocab };
}

export async function semanticSearch(query, rootDir, { maxResults = 10 } = {}) {
  const queryTokens = tokenize(query);
  const corpus = await buildCorpus(rootDir);
  const { docTokens, docMeta, vocab } = corpus;
  const vocabArray = Array.from(vocab);

  const queryVec = buildTfVector(queryTokens, vocabArray);
  const scores = docTokens.map((tokens, i) => {
    const docVec = buildTfVector(tokens, vocabArray);
    return { score: cosineSim(queryVec, docVec), index: i };
  });

  scores.sort((a, b) => b.score - a.score);
  const top = scores.slice(0, maxResults).filter((s) => s.score > 0);

  return {
    results: top.map((s) => ({
      file: docMeta[s.index].file,
      ext: docMeta[s.index].ext,
      score: Math.round(s.score * 10000) / 10000,
      snippet: docMeta[s.index].snippet,
      tokenCount: docMeta[s.index].tokenCount,
    })),
    total: top.length,
    vocabSize: vocab.size,
    indexedFiles: docMeta.length,
  };
}
