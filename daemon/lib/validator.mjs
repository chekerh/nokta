export function validate(schema, data) {
  const errors = [];
  for (const [field, rules] of Object.entries(schema)) {
    const value = data[field];
    if (rules.required && (value === undefined || value === null || value === '')) {
      errors.push(`${field} is required`);
      continue;
    }
    if (value === undefined || value === null) continue;
    if (rules.type && typeof value !== rules.type) {
      errors.push(`${field} must be of type ${rules.type}`);
    }
    if (rules.minLength && String(value).length < rules.minLength) {
      errors.push(`${field} must be at least ${rules.minLength} characters`);
    }
    if (rules.maxLength && String(value).length > rules.maxLength) {
      errors.push(`${field} must be at most ${rules.maxLength} characters`);
    }
    if (rules.pattern && !rules.pattern.test(String(value))) {
      errors.push(`${field} format is invalid`);
    }
    if (rules.enum && !rules.enum.includes(value)) {
      errors.push(`${field} must be one of: ${rules.enum.join(', ')}`);
    }
  }
  return { valid: errors.length === 0, errors };
}

export const schemas = {
  login: {
    email: { required: true, type: 'string', pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
    password: { required: true, type: 'string', minLength: 8 },
  },
  register: {
    email: { required: true, type: 'string', pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
    password: { required: true, type: 'string', minLength: 8 },
  },
  agentRun: {
    goal: { required: true, type: 'string', minLength: 1, maxLength: 10000 },
    trigger: { type: 'string', enum: ['manual', 'automatic', 'watcher', 'api'] },
  },
  sprintItem: {
    type: { required: true, type: 'string', enum: ['story', 'task', 'bug', 'subtask'] },
    title: { required: true, type: 'string', minLength: 1, maxLength: 500 },
    priority: { type: 'string', enum: ['P0', 'P1', 'P2', 'P3', 'P4'] },
    status: { type: 'string', enum: ['backlog', 'ready', 'in-progress', 'review', 'done', 'cancelled'] },
  },
  project: {
    name: { required: true, type: 'string', minLength: 1, maxLength: 200 },
    rootPath: { required: true, type: 'string', minLength: 1 },
  },
};
