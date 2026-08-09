const TOKEN_LIMIT_DEFAULT = 128000;
const MAX_PROMPT_LENGTH = 32000;

const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(prior|previous|above)\s+instructions/i,
  /forget\s+(all\s+)?(prior|previous|above)/i,
  /system\s+(prompt|message|instruction)/i,
  /you\s+are\s+(now|not\s+required\s+to)/i,
  /new\s+instructions?:\s*/i,
  /override\s+(mode|role|directive)/i,
];

const DESTRUCTIVE_FILE_OPS = [
  /rm\s+-rf/i,
  /rm\s+--recursive/i,
  /format\s+.*:\s*(drive|disk|volume)/i,
  /dd\s+if=/i,
  />\s*\/dev\/(sda|sdb|sdc|nvme)/i,
  /chmod\s+777/i,
  /chown\s+-R/i,
];

export class GateKeeper {
  constructor(options = {}) {
    this.tokenLimit = options.tokenLimit || TOKEN_LIMIT_DEFAULT;
    this.severity = options.severity || { token: 'warn', security: 'block', verification: 'block' };
  }

  async checkToken(messages, estimatedTokens) {
    const totalTokens = estimatedTokens || this._estimateTokens(messages);
    if (totalTokens > this.tokenLimit) {
      return {
        gate: 'token',
        status: 'fail',
        severity: this.severity.token,
        message: `Token estimate ${totalTokens} exceeds limit ${this.tokenLimit}`,
        details: { estimated: totalTokens, limit: this.tokenLimit, excess: totalTokens - this.tokenLimit },
      };
    }
    const promptLength = messages.reduce((s, m) => s + (m.content || '').length, 0);
    if (promptLength > MAX_PROMPT_LENGTH) {
      return {
        gate: 'token',
        status: 'warn',
        severity: 'warn',
        message: `Prompt length ${promptLength} exceeds recommended ${MAX_PROMPT_LENGTH}`,
        details: { length: promptLength, max: MAX_PROMPT_LENGTH },
      };
    }
    return { gate: 'token', status: 'pass', severity: 'info', message: 'Within token budget' };
  }

  async checkSecurity(messages) {
    const fullText = messages.map((m) => m.content || '').join('\n');
    for (const pattern of INJECTION_PATTERNS) {
      const match = fullText.match(pattern);
      if (match) {
        return {
          gate: 'security',
          status: 'fail',
          severity: this.severity.security,
          message: `Prompt injection pattern detected: "${match[0].trim()}"`,
          details: { pattern: match[0].trim() },
        };
      }
    }
    for (const pattern of DESTRUCTIVE_FILE_OPS) {
      const match = fullText.match(pattern);
      if (match) {
        return {
          gate: 'security',
          status: 'fail',
          severity: this.severity.security,
          message: `Destructive operation pattern detected: "${match[0].trim()}"`,
          details: { pattern: match[0].trim() },
        };
      }
    }
    return { gate: 'security', status: 'pass', severity: 'info', message: 'No security issues detected' };
  }

  async checkVerification(messages) {
    const lastMessage = messages[messages.length - 1];
    const requiresVerification = this._requiresVerification(lastMessage?.content || '');
    if (requiresVerification) {
      return {
        gate: 'verification',
        status: 'require_confirm',
        severity: 'warn',
        message: 'This action requires explicit confirmation',
        details: { reason: requiresVerification },
      };
    }
    return { gate: 'verification', status: 'pass', severity: 'info', message: 'No verification required' };
  }

  async evaluateAll(messages, estimatedTokens) {
    const results = await Promise.all([
      this.checkToken(messages, estimatedTokens),
      this.checkSecurity(messages),
      this.checkVerification(messages),
    ]);
    const failed = results.filter((r) => r.status === 'fail');
    return {
      passed: failed.length === 0,
      gates: results,
      requiresConfirm: results.some((r) => r.status === 'require_confirm'),
    };
  }

  _estimateTokens(messages) {
    let total = 0;
    for (const m of messages) {
      total += (m.content || '').length;
    }
    return Math.ceil(total * 1.3);
  }

  _requiresVerification(content) {
    const verificationTriggers = [
      /delete\s+(file|directory|folder|database|table|schema|branch|tag|release)/i,
      /drop\s+(table|database|schema|index|view)/i,
      /truncate\s+(table|database)/i,
      /delet.*account/i,
      /delet.*production/i,
      /deploy\s+(to\s+)?production/i,
    ];
    for (const trigger of verificationTriggers) {
      const match = content.match(trigger);
      if (match) return match[0].trim();
    }
    return null;
  }
}
