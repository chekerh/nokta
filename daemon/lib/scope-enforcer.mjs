// These stay blocked no matter what a scope asks for, so a broad scope cannot
// reach version-control internals, dependencies, or secrets.
const CRITICAL_BLOCKED_DIRS = ['.git', 'node_modules', '.env'];

// A declared directory is written by humans and models, so 'daemon/', 'daemon'
// and '.' all have to behave. The comparison used to build `dir + '/'`
// unconditionally, which turned 'daemon/' into 'daemon//' and silently matched
// nothing — a scope that looked correct and denied every edit under it.
function inDir(file, dir) {
  const base = String(dir).replace(/\/+$/, '');
  if (base === '' || base === '.') return true; // the repository root
  return file === base || file.startsWith(base + '/');
}

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
      // Additive rather than defaulting: `blockedDirs: []` previously replaced
      // the defaults outright, which unlocked .git and .env.
      blockedDirs: [...new Set([...CRITICAL_BLOCKED_DIRS, ...(scope.blockedDirs || [])])],
      maxFilesChanged: scope.maxFilesChanged || 10,
      maxLinesChanged: scope.maxLinesChanged || 500,
      allowedOperations: scope.allowedOperations || ['read', 'write', 'create'],
      declaredAt: Date.now(),
    });
  }

  validateMutation(runId, mutation) {
    const scope = this.activeScopes.get(runId);
    // Failing open here is what let a run rewrite daemon/server.mjs from 256
    // lines to 7. A run that can edit must declare what it may touch.
    if (!scope) return { allowed: false, reason: 'no scope declared for this run' };

    const { file, operation: _operation } = mutation;

    for (const pattern of scope.blockedFiles) {
      if (this.matchesPattern(file, pattern)) {
        return { allowed: false, reason: `blocked file: ${pattern}` };
      }
    }

    for (const dir of scope.blockedDirs) {
      if (inDir(file, dir)) {
        return { allowed: false, reason: `blocked directory: ${dir}` };
      }
    }

    // An allow-list that lists nothing allows nothing. The planner used to
    // document `scope` as needing no fields, so a model emitting one produced
    // empty lists that were then read as "unrestricted".
    if (scope.allowedDirs.length === 0 && scope.allowedFiles.length === 0) {
      return { allowed: false, reason: 'no allowed files or directories in the declared scope' };
    }

    if (scope.allowedDirs.length > 0) {
      const inAllowedDir = scope.allowedDirs.some((dir) => inDir(file, dir));
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
    // Escape first, then re-open only the two wildcards. The pattern used to be
    // interpolated into a RegExp raw, so a dot matched any character and a
    // pattern containing "(" or "[" threw a SyntaxError.
    const escaped = String(pattern).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const source = escaped.replace(/\\\*/g, '.*').replace(/\\\?/g, '.');
    return new RegExp('^' + source + '$').test(file);
  }
}
