import { prepare } from '../db/connection.mjs';

export class UserBrain {
  constructor(options = {}) {
    this.log = options.log || { debug() {}, info() {}, warn() {}, error: console.error };
  }

  async getBrain(userId) {
    const brain = prepare(
      'SELECT operational_dna, design_preferences, learned_patterns FROM user_brain WHERE user_id = ?',
    ).get(userId);

    if (!brain) {
      // Initialize default brain if not exists
      const defaultDNA = JSON.stringify([
        'Prefer functional, modular code structures',
        'Use descriptive variable names over short ones',
        'Prioritize readability and maintainability over micro-optimizations',
        'Strict adherence to project-specific linting rules',
      ]);
      const defaultPrefs = JSON.stringify({
        theme: 'obsidian-dark',
        accent: '#8b5cf6',
        preferred_stack: 'react-nextjs',
      });

      prepare(
        'INSERT INTO user_brain (user_id, operational_dna, design_preferences, learned_patterns) VALUES (?, ?, ?, ?)',
      ).run(userId, defaultDNA, defaultPrefs, '[]');

      return {
        operational_dna: JSON.parse(defaultDNA),
        design_preferences: JSON.parse(defaultPrefs),
        learned_patterns: [],
      };
    }

    return {
      operational_dna: (() => {
        try {
          return JSON.parse(brain.operational_dna);
        } catch {
          return [];
        }
      })(),
      design_preferences: (() => {
        try {
          return JSON.parse(brain.design_preferences);
        } catch {
          return {};
        }
      })(),
      learned_patterns: (() => {
        try {
          return JSON.parse(brain.learned_patterns);
        } catch {
          return [];
        }
      })(),
    };
  }

  async updateDNA(userId, dnaArray) {
    prepare("UPDATE user_brain SET operational_dna = ?, updated_at = datetime('now') WHERE user_id = ?").run(
      JSON.stringify(dnaArray),
      userId,
    );
  }

  async addLearnedPattern(userId, pattern) {
    const brain = await this.getBrain(userId);
    const patterns = brain.learned_patterns;
    patterns.push({
      pattern: pattern.rule,
      example: pattern.example,
      timestamp: new Date().toISOString(),
    });
    prepare("UPDATE user_brain SET learned_patterns = ?, updated_at = datetime('now') WHERE user_id = ?").run(
      JSON.stringify(patterns),
      userId,
    );
  }

  async compileGlobalContext(userId) {
    const brain = await this.getBrain(userId);
    const dna = brain.operational_dna.map((rule) => `• ${rule}`).join('\n');
    const patterns = brain.learned_patterns.map((p) => `• ${p.pattern} (Example: ${p.example})`).join('\n');

    return `
## 🧠 User Operational DNA (Global Context)
The following rules define how this developer operates and the standards they expect:
${dna}

## 🎓 Learned Patterns & Experience
These are specific patterns learned from previous project corrections:
${patterns || 'No specific patterns learned yet.'}
    `.trim();
  }
}
