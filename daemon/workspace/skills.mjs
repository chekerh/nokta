import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const excluded = new Set(['node_modules', '.git', 'dist', 'build', 'assets', 'tests', 'docs', '.venv']);
export class LocalSkills {
  constructor(root = process.env.NOKTA_SKILLS_DIR || path.join(os.homedir(), 'skills')) {
    this.root = root;
    this.items = [];
    this.scannedAt = 0;
  }
  async inventory() {
    if (Date.now() - this.scannedAt < 300000) return this.items;
    let root;
    try {
      root = await fs.realpath(this.root);
    } catch (error) {
      if (error.code === 'ENOENT' || error.code === 'ENOTDIR') {
        this.items = [];
        this.scannedAt = Date.now();
        return this.items;
      }
      throw error;
    }
    const items = [];
    let visited = 0;
    const walk = async (dir, depth) => {
      if (depth > 10 || ++visited > 12000) return;
      const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
      for (const entry of entries) {
        if (entry.isSymbolicLink()) continue;
        const file = path.join(dir, entry.name);
        if (entry.isDirectory() && !excluded.has(entry.name)) await walk(file, depth + 1);
        if (entry.isFile() && entry.name === 'SKILL.md') {
          const stat = await fs.stat(file);
          if (stat.size > 150000) continue;
          const content = await fs.readFile(file, 'utf8');
          items.push({ name: path.basename(dir), path: file, description: (content.match(/^description:\s*(.+)$/m)?.[1] || '').slice(0, 300) });
        }
      }
    };
    await walk(root, 0);
    this.items = items;
    this.scannedAt = Date.now();
    return items;
  }
  async select(query) {
    const terms = [...new Set(query.toLowerCase().match(/[a-z]{3,}/g) || [])];
    const seen = new Set();
    const ranked = (await this.inventory()).map(item => ({ ...item, score: terms.reduce((sum, term) => sum + (item.name.includes(term) ? 4 : item.description.toLowerCase().includes(term) ? 1 : 0), 0) })).sort((a, b) => b.score - a.score);
    const selected = [];
    for (const item of ranked) {
      if (item.score === 0 || seen.has(item.name)) continue;
      seen.add(item.name);
      const content = await fs.readFile(item.path, 'utf8');
      selected.push({ ...item, content: content.slice(0, 6000) });
      if (selected.length === 4) break;
    }
    return selected;
  }
}
