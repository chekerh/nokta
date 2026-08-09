const PRODUCTION_CHECKS = [
  {
    id: 'error-handling',
    name: 'Error Handling',
    patterns: [
      { check: /catch\s*\(/, pass: true, message: 'Has try-catch' },
      { check: /\.catch\(/, pass: true, message: 'Has .catch()' },
      { check: /throw\s+new\s+Error/, pass: true, message: 'Throws errors' },
    ],
    antiPatterns: [
      { check: /catch\s*\(\s*\)\s*\{?\s*\}/, message: 'Empty catch block' },
      { check: /catch\s*\([^)]*\)\s*\{\s*\/\/.*ignore/i, message: 'Swallowed error' },
    ],
    severity: 'HIGH',
  },
  {
    id: 'input-validation',
    name: 'Input Validation',
    patterns: [
      { check: /if\s*\(!.*\)\s*throw/, pass: true, message: 'Validates input' },
      { check: /validate|sanitize|escape/, pass: true, message: 'Has validation' },
    ],
    severity: 'HIGH',
  },
  {
    id: 'timeout',
    name: 'Timeout Handling',
    patterns: [
      { check: /timeout|AbortController|signal/, pass: true, message: 'Has timeout' },
      { check: /Promise\.race/, pass: true, message: 'Uses Promise.race for timeout' },
    ],
    severity: 'MEDIUM',
  },
  {
    id: 'retry-logic',
    name: 'Retry Logic',
    patterns: [{ check: /retry|retries|backoff|exponential/, pass: true, message: 'Has retry logic' }],
    severity: 'MEDIUM',
  },
  {
    id: 'resource-cleanup',
    name: 'Resource Cleanup',
    patterns: [
      { check: /\.finally\(/, pass: true, message: 'Has finally block' },
      { check: /destroy|close|cleanup|dispose/, pass: true, message: 'Has cleanup' },
    ],
    severity: 'HIGH',
  },
  {
    id: 'concurrency',
    name: 'Concurrency Safety',
    patterns: [
      { check: /mutex|lock|semaphore|atomic/, pass: true, message: 'Has concurrency control' },
      { check: /queue|batch/, pass: true, message: 'Uses queue/batch pattern' },
    ],
    severity: 'MEDIUM',
  },
  {
    id: 'logging',
    name: 'Observability',
    patterns: [
      { check: /log\.(info|warn|error|debug)/, pass: true, message: 'Has logging' },
      { check: /console\.(log|error|warn)/, pass: true, message: 'Has console output' },
    ],
    severity: 'LOW',
  },
  {
    id: 'graceful-degradation',
    name: 'Graceful Degradation',
    patterns: [
      { check: /fallback|default|alternative/, pass: true, message: 'Has fallback' },
      { check: /circuit.?breaker|bulkhead/, pass: true, message: 'Has circuit breaker' },
    ],
    severity: 'MEDIUM',
  },
];

export class ProductionGate {
  constructor({ log } = {}) {
    this.log = log || { debug() {}, info() {}, warn() {}, error: console.error };
  }

  analyze(diff) {
    const results = [];
    const files = this.parseDiff(diff);

    for (const file of files) {
      for (const check of PRODUCTION_CHECKS) {
        const result = this.runCheck(check, file);
        if (result) {
          results.push({
            file: file.path,
            check: check.id,
            checkName: check.name,
            severity: check.severity,
            ...result,
          });
        }
      }
    }

    return {
      passed: results.filter((r) => r.status === 'fail' && r.severity === 'HIGH').length === 0,
      results,
      summary: this.generateSummary(results),
      score: this.calculateScore(results),
    };
  }

  runCheck(check, file) {
    const content = file.content;
    let hasPositive = false;

    for (const pattern of check.patterns) {
      if (pattern.check.test(content)) {
        hasPositive = true;
        break;
      }
    }

    for (const anti of check.antiPatterns || []) {
      if (anti.check.test(content)) {
        return { status: 'warn', message: anti.message };
      }
    }

    if (!hasPositive) {
      return {
        status: check.severity === 'HIGH' ? 'fail' : 'warn',
        message: `No ${check.name.toLowerCase()} detected`,
      };
    }

    return null;
  }

  parseDiff(diff) {
    const files = [];
    const lines = diff.split('\n');
    let currentFile = null;
    let currentContent = [];

    for (const line of lines) {
      if (line.startsWith('+++ b/')) {
        if (currentFile) files.push({ path: currentFile, content: currentContent.join('\n') });
        currentFile = line.slice(6);
        currentContent = [];
      } else if (currentFile && line.startsWith('+') && !line.startsWith('+++')) {
        currentContent.push(line.slice(1));
      }
    }
    if (currentFile) files.push({ path: currentFile, content: currentContent.join('\n') });
    return files;
  }

  calculateScore(results) {
    const weights = { HIGH: 10, MEDIUM: 5, LOW: 1 };
    let score = 100;
    for (const r of results) {
      if (r.status === 'fail') score -= weights[r.severity] || 1;
      if (r.status === 'warn') score -= (weights[r.severity] || 1) / 2;
    }
    return Math.max(0, Math.min(100, score));
  }

  generateSummary(results) {
    const fails = results.filter((r) => r.status === 'fail');
    const warns = results.filter((r) => r.status === 'warn');
    if (fails.length === 0 && warns.length === 0) return 'All production readiness checks passed';
    const parts = [];
    if (fails.length > 0) parts.push(`${fails.length} critical issues`);
    if (warns.length > 0) parts.push(`${warns.length} warnings`);
    return parts.join(', ');
  }
}
