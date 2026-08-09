import * as fs from 'node:fs/promises';
import { accessSync } from 'node:fs';
import * as path from 'node:path';

export class TestImpactAnalyzer {
  constructor({ projectRoot, log } = {}) {
    this.projectRoot = projectRoot;
    this.log = log || { debug() {}, info() {}, warn() {}, error: console.error };
    this.dependencyMap = null;
  }

  async buildDependencyMap() {
    this.dependencyMap = new Map();
    await this.scanDir(this.projectRoot);
    return this.dependencyMap;
  }

  async scanDir(dir) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await this.scanDir(fullPath);
      } else if (/\.(js|ts|jsx|tsx|mjs)$/.test(entry.name)) {
        await this.scanFile(fullPath);
      }
    }
  }

  async scanFile(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const imports = this.extractImports(content);
      for (const imp of imports) {
        const resolved = this.resolveImport(imp, filePath);
        if (resolved) {
          if (!this.dependencyMap.has(resolved)) this.dependencyMap.set(resolved, []);
          this.dependencyMap.get(resolved).push(filePath);
        }
      }
    } catch {}
  }

  extractImports(content) {
    const imports = [];
    const patterns = [
      /import\s+.*?\s+from\s+['"]([^'"]+)['"]/g,
      /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
      /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    ];
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(content))) {
        if (match[1].startsWith('.')) imports.push(match[1]);
      }
    }
    return imports;
  }

  resolveImport(importPath, fromFile) {
    const resolved = path.resolve(path.dirname(fromFile), importPath);
    const extensions = ['', '.js', '.ts', '.jsx', '.tsx', '.mjs'];
    for (const ext of extensions) {
      try {
        accessSync(resolved + ext);
        return resolved + ext;
      } catch {}
    }
    for (const ext of extensions) {
      const indexPath = path.join(resolved, `index${ext}`);
      try {
        accessSync(indexPath);
        return indexPath;
      } catch {}
    }
    return null;
  }

  async analyzeImpact(changedFiles) {
    if (!this.dependencyMap) await this.buildDependencyMap();

    const affectedFiles = new Set();
    for (const changedFile of changedFiles) {
      const dependents = this.dependencyMap.get(changedFile) || [];
      for (const dep of dependents) affectedFiles.add(dep);
    }

    const testFiles = [];
    const findTests = async (dir) => {
      let entries;
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) await findTests(fullPath);
        else if (/\.(test|spec)\.(js|ts|jsx|tsx)$/.test(entry.name)) testFiles.push(fullPath);
      }
    };
    await findTests(this.projectRoot);

    const affectedTests = [];
    for (const testFile of testFiles) {
      try {
        const content = await fs.readFile(testFile, 'utf8');
        const imports = this.extractImports(content);
        for (const imp of imports) {
          const resolved = this.resolveImport(imp, testFile);
          if (resolved && (affectedFiles.has(resolved) || changedFiles.includes(resolved))) {
            affectedTests.push({ file: testFile, reason: `imports ${resolved}` });
            break;
          }
        }
      } catch {}
    }

    return {
      changedFiles,
      affectedFiles: [...affectedFiles],
      affectedTests,
      totalTests: testFiles.length,
      coveragePercent: testFiles.length > 0 ? Math.round((affectedTests.length / testFiles.length) * 100) : 0,
    };
  }

  generateTestCommand(impact) {
    if (impact.affectedTests.length === 0)
      return { command: 'echo "No affected tests found"', reason: 'no tests affected' };
    return {
      command: `npm test -- ${impact.affectedTests.map((t) => t.file).join(' ')}`,
      files: impact.affectedTests.map((t) => t.file),
      reason: `${impact.affectedTests.length} tests affected`,
    };
  }
}
