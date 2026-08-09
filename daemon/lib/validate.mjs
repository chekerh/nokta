import { AppError } from './route-utils.mjs';

const VALIDATORS = {};

VALIDATORS['/api/v1/chat'] = (body) => {
  if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
    throw new AppError('messages: non-empty array required', 400);
  }
  for (const msg of body.messages) {
    if (!msg.role || !msg.content) {
      throw new AppError('messages: each item must have role and content', 400);
    }
    if (!['system', 'user', 'assistant'].includes(msg.role)) {
      throw new AppError('messages: role must be system, user, or assistant', 400);
    }
  }
};

VALIDATORS['/api/v1/chat/complete'] = (body) => {
  if (!body.prompt) throw new AppError('prompt: required', 400);
};

VALIDATORS['/api/v1/search'] = (body) => {
  if (!body.query) throw new AppError('query: required', 400);
};

VALIDATORS['/api/v1/mcp/execute'] = (body) => {
  if (!body.serverId) throw new AppError('serverId: required', 400);
  if (!body.toolName) throw new AppError('toolName: required', 400);
};

VALIDATORS['/api/v1/code-actions/explain'] = (body) => {
  if (!body.code) throw new AppError('code: required', 400);
};
VALIDATORS['/api/v1/code-actions/refactor'] = (body) => {
  if (!body.code) throw new AppError('code: required', 400);
};
VALIDATORS['/api/v1/code-actions/generate-tests'] = (body) => {
  if (!body.code) throw new AppError('code: required', 400);
};
VALIDATORS['/api/v1/code-actions/fix-errors'] = (body) => {
  if (!body.code) throw new AppError('code: required', 400);
};

VALIDATORS['/api/v1/trail/start'] = (body) => {
  if (!body.task) throw new AppError('task: required', 400);
};

VALIDATORS['/api/v1/trail/update'] = (body) => {
  if (!body.sessionFile) throw new AppError('sessionFile: required', 400);
  if (!body.content) throw new AppError('content: required', 400);
};

VALIDATORS['/api/v1/providers/default'] = (body) => {
  if (!body.id) throw new AppError('id: required', 400);
};

VALIDATORS['/api/v1/providers/configure'] = (body) => {
  if (!body.id) throw new AppError('id: required', 400);
};

VALIDATORS['/api/v1/agents/recommend'] = (body) => {
  if (!body.prompt) throw new AppError('prompt: required', 400);
};

export function validateRequest(routePath) {
  const validator = VALIDATORS[routePath];
  if (!validator) return (req, res, next) => next();
  return (req, res, next) => {
    try {
      validator(req.body);
      next();
    } catch (err) {
      next(err);
    }
  };
}
