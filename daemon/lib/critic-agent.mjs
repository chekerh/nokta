import fs from 'node:fs';
import path from 'node:path';
import { AppError } from '../types.mjs';

const CRITIC_PROMPT = `You are a senior code reviewer and architect. Your role is to critically evaluate code changes and provide structured feedback.

Analyze the provided code against these criteria:
1. **Correctness** — Does the code work as intended? Are there bugs or edge cases missed?
2. **Security** — Are there vulnerabilities? Secrets in code? Unsafe input handling?
3. **Performance** — Are there unnecessary inefficiencies, blocking calls, or bottlenecks?
4. **Maintainability** — Is the code readable, well-structured, follows existing patterns?
5. **Architecture** — Does the code fit the project's architectural patterns? Any violations?
6. **Best Practices** — Linting, error handling, resource management, testing considerations?

Output format:
{
  "issues": [
    {
      "severity": "critical|high|medium|low",
      "category": "correctness|security|performance|maintainability|architecture|best-practices",
      "file": "path/to/file",
      "line": 42,
      "message": "Description of the issue",
      "suggestion": "How to fix it"
    }
  ],
  "summary": {
    "totalIssues": 5,
    "critical": 1,
    "high": 2,
    "medium": 1,
    "low": 1
  },
  "passed": false
}

Only output valid JSON. No markdown.`;

const IMPLEMENTER_PROMPT = `You are an expert software engineer. You receive code and reviewer feedback. Your task is to generate a fix for the critical and high severity issues only.

For each issue:
1. Describe the fix
2. Show the corrected code snippet
3. Explain why it works

If the implementation is correct and passes review, output a brief confirmation.

Be concise. Code-first output.`;

export class CriticAgent {
  constructor(options = {}) {
    this.log = options.log || { debug() {}, info() {}, warn() {}, error: console.error };
    this.chatHandler = options.chatHandler || null;
    this.maxFileSize = options.maxFileSize || 100000;
  }

  async critique(code, { file = 'unknown', provider, model } = {}) {
    if (!this.chatHandler) {
      throw new AppError('ChatHandler not configured for critic agent', 500);
    }

    const messages = [
      { role: 'system', content: CRITIC_PROMPT },
      {
        role: 'user',
        content: `File: ${file}\n\nCode:\n\`\`\`\n${code.slice(0, 50000)}\n\`\`\`\n\nCritique this code.`,
      },
    ];

    const result = await this.chatHandler.handleChat(messages, {
      stream: false,
      provider,
      model,
    });

    let critique;
    try {
      critique = JSON.parse(result.content);
    } catch {
      critique = {
        issues: [],
        summary: { totalIssues: 0, critical: 0, high: 0, medium: 0, low: 0 },
        passed: true,
        raw: result.content,
      };
    }

    return critique;
  }

  async critiqueFile(filePath, { projectRoot: _projectRoot, provider, model } = {}) {
    const fullPath = _projectRoot ? path.resolve(_projectRoot, filePath) : path.resolve(filePath);
    let code;
    try {
      code = fs.readFileSync(fullPath, 'utf8');
    } catch {
      throw new AppError(`Cannot read file: ${fullPath}`, 404);
    }

    return this.critique(code, { file: filePath, provider, model });
  }

  async iterate(implementation, feedback, { provider, model } = {}) {
    if (!this.chatHandler) {
      throw new AppError('ChatHandler not configured for critic agent', 500);
    }

    const messages = [
      { role: 'system', content: IMPLEMENTER_PROMPT },
      {
        role: 'user',
        content: `## Original Implementation

${implementation}

## Reviewer Feedback

${JSON.stringify(feedback, null, 2)}

## Fix the critical and high severity issues.`,
      },
    ];

    const result = await this.chatHandler.handleChat(messages, {
      stream: false,
      provider,
      model,
    });

    return result.content;
  }

  async adversarialReview(code, options = {}) {
    const { file = 'unknown', projectRoot: _projectRoot, provider, model, maxRounds = 2 } = options;

    const rounds = [];
    let currentCode = code;
    let feedback = null;

    for (let i = 0; i < maxRounds; i++) {
      const critique = await this.critique(currentCode, { file, provider, model });
      rounds.push({ round: i + 1, type: 'critique', result: critique });

      const criticalOrHigh = critique.issues.filter((issue) => ['critical', 'high'].includes(issue.severity));

      if (criticalOrHigh.length === 0) {
        this.log.info(`Adversarial review passed on round ${i + 1}`);
        feedback = { ...critique, rounds };
        break;
      }

      this.log.info(`Round ${i + 1}: ${criticalOrHigh.length} critical/high issues found`);

      const fix = await this.iterate(currentCode, critique, { provider, model });
      rounds.push({ round: i + 1, type: 'fix', result: fix });

      currentCode = fix;
      feedback = { ...critique, rounds, finalCode: currentCode };
    }

    return {
      passed: feedback?.summary?.critical === 0 && feedback?.summary?.high === 0,
      finalCode: currentCode,
      feedback,
    };
  }
}
