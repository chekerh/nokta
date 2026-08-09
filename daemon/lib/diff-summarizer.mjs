export class DiffSummarizer {
  constructor({ chatHandler, log } = {}) {
    this.chatHandler = chatHandler;
    this.log = log || { debug() {}, info() {}, warn() {}, error: console.error };
  }

  async summarize(diff, context = {}) {
    if (!this.chatHandler) return this.generateFallbackSummary(diff);

    const prompt = `You are a senior code reviewer. Analyze this diff and provide a concise summary.

DIFF:
${diff.slice(0, 8000)}

${context.sprintItem ? `SPRINT ITEM: ${context.sprintItem.title}` : ''}

Respond in this EXACT format:
## Summary
[1-2 sentences]
## Changes by File
- **file**: [what changed]
## Risk Assessment
- **Risk Level**: [LOW/MEDIUM/HIGH]
- **Reason**: [why]
## Testing Recommendations
- [tests to run]
## Review Checklist
- [ ] [thing to verify]`;

    try {
      const result = await this.chatHandler.handleChat([{ role: 'user', content: prompt }], {
        stream: false,
        temperature: 0.3,
      });
      return this.parseSummary(result.content);
    } catch (err) {
      this.log.error('Failed to generate diff summary', { error: err.message });
      return this.generateFallbackSummary(diff);
    }
  }

  parseSummary(content) {
    const sections = {
      summary: '',
      changesByFile: [],
      riskLevel: 'UNKNOWN',
      riskReason: '',
      testingRecommendations: [],
      reviewChecklist: [],
    };
    let currentSection = '';

    for (const line of content.split('\n')) {
      if (line.startsWith('## Summary')) currentSection = 'summary';
      else if (line.startsWith('## Changes by File')) currentSection = 'changes';
      else if (line.startsWith('## Risk Assessment')) currentSection = 'risk';
      else if (line.startsWith('## Testing Recommendations')) currentSection = 'testing';
      else if (line.startsWith('## Review Checklist')) currentSection = 'checklist';
      else if (line.startsWith('## ')) currentSection = '';

      if (currentSection === 'summary' && line.trim() && !line.startsWith('#')) sections.summary += line + ' ';
      if (currentSection === 'changes' && line.startsWith('- **')) {
        const match = line.match(/- \*\*(.+?)\*\*:?\s*(.*)/);
        if (match) sections.changesByFile.push({ file: match[1], change: match[2] });
      }
      if (currentSection === 'risk' && line.includes('Risk Level')) {
        const match = line.match(/Risk Level[:\s]*\*?\*?(LOW|MEDIUM|HIGH)/i);
        if (match) sections.riskLevel = match[1].toUpperCase();
      }
      if (currentSection === 'testing' && line.startsWith('- ')) sections.testingRecommendations.push(line.slice(2));
      if (currentSection === 'checklist' && line.startsWith('- [ ]')) sections.reviewChecklist.push(line.slice(6));
    }
    return sections;
  }

  generateFallbackSummary(diff) {
    const files = [];
    let additions = 0;
    let deletions = 0;
    for (const line of diff.split('\n')) {
      if (line.startsWith('+++ b/')) files.push(line.slice(6));
      if (line.startsWith('+') && !line.startsWith('+++')) additions++;
      if (line.startsWith('-') && !line.startsWith('---')) deletions++;
    }
    return {
      summary: `Changes to ${files.length} file(s): ${additions} additions, ${deletions} deletions`,
      changesByFile: files.map((f) => ({ file: f, change: 'modified' })),
      riskLevel: additions + deletions > 100 ? 'HIGH' : additions + deletions > 20 ? 'MEDIUM' : 'LOW',
      riskReason: `${additions + deletions} lines changed`,
      testingRecommendations: ['Run full test suite'],
      reviewChecklist: ['Check for unintended changes'],
    };
  }

  formatForPR(summary) {
    let body = `## Summary\n${summary.summary}\n\n## Changes\n`;
    for (const change of summary.changesByFile) body += `- **${change.file}**: ${change.change}\n`;
    body += `\n## Risk: ${summary.riskLevel}\n${summary.riskReason}\n\n## Testing\n`;
    for (const rec of summary.testingRecommendations) body += `- ${rec}\n`;
    body += '\n## Review Checklist\n';
    for (const item of summary.reviewChecklist) body += `- [ ] ${item}\n`;
    return body;
  }
}
