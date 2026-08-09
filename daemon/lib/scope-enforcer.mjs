export class ScopeEnforcer {
  constructor({ log } = {}) {
    this.log = log || { debug() {}, info() {}, warn() {}, error: console.error };
    this.activeScopes = new Map();
    this._mutations = new Map();
  }

  declareScope(runId, scope) {
    this.activeScopes.set(runId, {
      allowedFiles: scope.allowedFiles || [],
      blockedFiles: scope.blockedFiles || [],
      allowedDirs: scope.allowedDirs || [],
      blockedDirs: scope.blockedDirs || ['.git', 'node_modules', '.env'],
      maxFilesChanged: scope.maxFilesChanged || 10,
      maxLinesChanged: scope.maxLinesChanged || 500,
      allowedOperations: scope.allowedOperations || ['read', 'write', 'create'],
      declaredAt: Date.now(),
    });
  }

  validateMutation(runId, mutation) {
    const scope = this.activeScopes.get(runId);
    if (!scope) return { allowed: true, reason: 'no scope declared' };

    const { file, operation: _operation } = mutation;

    for (const pattern of scope.blockedFiles) {
      if (this.matchesPattern(file, pattern)) {
        return { allowed: false, reason: `blocked file: ${pattern}` };
      }
    }

    for (const dir of scope.blockedDirs) {
      if (file.startsWith(dir + '/') || file === dir) {
        return { allowed: false, reason: `blocked directory: ${dir}` };
      }
    }

    if (scope.allowedDirs.length > 0) {
      const inAllowedDir = scope.allowedDirs.some((dir) => file.startsWith(dir + '/'));
      if (!inAllowedDir) return { allowed: false, reason: 'not in allowed directory' };
    }

    if (scope.allowedFiles.length > 0) {
      const isAllowed = scope.allowedFiles.some((p) => this.matchesPattern(file, p));
      if (!isAllowed) return { allowed: false, reason: 'file not in allowed list' };
    }

    const currentMutations = this.getMutations(runId);
    if (currentMutations.length >= scope.maxFilesChanged) {
      return { allowed: false, reason: `max files changed: ${scope.maxFilesChanged}` };
    }

    if (mutation.linesChanged) {
      const totalLines = currentMutations.reduce((sum, m) => sum + (m.linesChanged || 0), 0);
      if (totalLines + mutation.linesChanged > scope.maxLinesChanged) {
        return { allowed: false, reason: `max lines changed: ${scope.maxLinesChanged}` };
      }
    }

    return { allowed: true };
  }

  recordMutation(runId, mutation) {
    const mutations = this.getMutations(runId);
    mutations.push({ ...mutation, timestamp: Date.now() });
  }

  getMutations(runId) {
    if (!this._mutations.has(runId)) this._mutations.set(runId, []);
    return this._mutations.get(runId);
  }

  getScopeReport(runId) {
    const scope = this.activeScopes.get(runId);
    const mutations = this.getMutations(runId);
    return {
      scope,
      mutations: mutations.length,
      filesChanged: [...new Set(mutations.map((m) => m.file))],
      withinLimits: mutations.length <= (scope?.maxFilesChanged || Infinity),
      violations: mutations.filter((m) => !m.withinScope),
    };
  }

  cleanup(runId) {
    this.activeScopes.delete(runId);
    this._mutations.delete(runId);
  }

  matchesPattern(file, pattern) {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
    return regex.test(file);
  }
}
