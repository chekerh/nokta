export function getOpenApiSpec(version = '0.2.0') {
  return {
    openapi: '3.0.3',
    info: {
      title: 'Nokta Daemon API',
      version,
      description:
        'REST API for Nokta AI Operating System — context compilation, provider routing, trail management, and code actions.',
    },
    servers: [{ url: 'http://localhost:4217', description: 'Local development' }],
    paths: {
      '/health': {
        get: {
          summary: 'Health check',
          responses: { 200: { description: 'Service health and provider status' } },
        },
      },
      '/api/v1/chat': {
        post: {
          summary: 'Chat completion with context injection',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ChatRequest' } } },
          },
          responses: { 200: { description: 'Chat response' } },
        },
      },
      '/api/v1/chat/complete': {
        post: {
          summary: 'Simple completion',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/CompletionRequest' } } },
          },
          responses: { 200: { description: 'Completion result' } },
        },
      },
      '/api/v1/models': {
        get: { summary: 'List available models per provider', responses: { 200: { description: 'Model list' } } },
      },
      '/api/v1/search': {
        post: {
          summary: 'Full-text code search',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/SearchRequest' } } },
          },
          responses: { 200: { description: 'Search results' } },
        },
      },
      '/api/v1/context': {
        post: {
          summary: 'Compile project context',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ContextRequest' } } },
          },
          responses: { 200: { description: 'Compiled context' } },
        },
      },
      '/api/v1/detect': {
        post: {
          summary: 'Detect project stacks',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/DetectRequest' } } },
          },
          responses: { 200: { description: 'Detected project info' } },
        },
      },
      '/api/v1/packs': {
        get: { summary: 'List available packs', responses: { 200: { description: 'Pack list' } } },
      },
      '/api/v1/gates': {
        post: {
          summary: 'Evaluate trail gates for a project',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/GateRequest' } } },
          },
          responses: { 200: { description: 'Gate evaluation results' } },
        },
      },
      '/api/v1/gates/status': {
        get: { summary: 'Current gate status for the project', responses: { 200: { description: 'Gate status' } } },
      },
      '/api/v1/trail': {
        get: { summary: 'Get trail state', responses: { 200: { description: 'Trail index and active session' } } },
      },
      '/api/v1/trail/start': {
        post: {
          summary: 'Start a new trail session',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/TrailStartRequest' } } },
          },
          responses: { 200: { description: 'New session created' } },
        },
      },
      '/api/v1/trail/update': {
        put: {
          summary: 'Update a trail session',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/TrailUpdateRequest' } } },
          },
          responses: { 200: { description: 'Session updated' } },
        },
      },
      '/api/v1/providers': {
        get: { summary: 'List configured providers', responses: { 200: { description: 'Provider list' } } },
      },
      '/api/v1/providers/health': {
        get: { summary: 'Provider health status', responses: { 200: { description: 'Health per provider' } } },
      },
      '/api/v1/providers/default': {
        post: {
          summary: 'Set default provider',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { type: 'object', properties: { id: { type: 'string' } } } } },
          },
          responses: { 200: { description: 'Default updated' } },
        },
      },
      '/api/v1/providers/configure': {
        post: {
          summary: 'Configure a provider',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ProviderConfig' } } },
          },
          responses: { 200: { description: 'Provider configured' } },
        },
      },
      '/api/v1/mcp/servers': {
        get: { summary: 'List MCP servers', responses: { 200: { description: 'MCP server list' } } },
        post: {
          summary: 'Save MCP server config',
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } },
          responses: { 200: { description: 'Config saved' } },
        },
      },
      '/api/v1/mcp/execute': {
        post: {
          summary: 'Execute an MCP tool',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/MCPExecuteRequest' } } },
          },
          responses: { 200: { description: 'Tool execution result' } },
        },
      },
      '/api/v1/code-actions/explain': {
        post: { summary: 'Explain code', ...ACTION_BODY, responses: { 200: { description: 'Explanation' } } },
      },
      '/api/v1/code-actions/refactor': {
        post: { summary: 'Refactor code', ...ACTION_BODY, responses: { 200: { description: 'Refactored code' } } },
      },
      '/api/v1/code-actions/generate-tests': {
        post: { summary: 'Generate tests', ...ACTION_BODY, responses: { 200: { description: 'Generated tests' } } },
      },
      '/api/v1/code-actions/fix-errors': {
        post: { summary: 'Fix code errors', ...ACTION_BODY, responses: { 200: { description: 'Fixed code' } } },
      },
      '/api/v1/agents': {
        get: { summary: 'List available agents', responses: { 200: { description: 'Agent list and metadata' } } },
      },
      '/api/v1/agents/recommend': {
        post: {
          summary: 'Recommend best agent for a task description',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { type: 'object', required: ['task'], properties: { task: { type: 'string' } } },
              },
            },
          },
          responses: { 200: { description: 'Recommended agent' } },
        },
      },
      '/api/v1/providers/auto-route': {
        post: {
          summary: 'Enable or disable automatic provider routing',
          requestBody: {
            required: true,
            content: {
              'application/json': { schema: { type: 'object', properties: { enabled: { type: 'boolean' } } } },
            },
          },
          responses: { 200: { description: 'Auto-route status updated' } },
        },
      },
      '/api/v1/discover': {
        get: {
          summary: 'Run or retrieve web discovery (GitHub trending, npm, source updates)',
          parameters: [
            {
              name: 'force',
              in: 'query',
              schema: { type: 'boolean' },
              description: 'Force fresh scan instead of cached',
            },
          ],
          responses: { 200: { description: 'Discovery report with trending repos, packages, and updates' } },
        },
      },
      '/api/v1/discover/cached': {
        get: {
          summary: 'Get cached discovery report without triggering a new scan',
          responses: { 200: { description: 'Cached discovery report or empty' } },
        },
      },
      '/api/v1/skills': {
        get: { summary: 'List cached skill sources', responses: { 200: { description: 'Cached sources' } } },
      },
      '/api/v1/skills/sources': {
        get: {
          summary: 'List cached skill sources (same as /skills)',
          responses: { 200: { description: 'Sources list' } },
        },
      },
      '/api/v1/skills/scan': {
        post: {
          summary: 'Scan a GitHub repo for skills, agents, packs',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { type: 'object', required: ['url'], properties: { url: { type: 'string' } } },
              },
            },
          },
          responses: { 200: { description: 'Scan results with skill/agent counts' } },
        },
      },
      '/api/v1/skills/import': {
        post: {
          summary: 'Import scanned skills into Nokta as packs',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { type: 'object', required: ['url'], properties: { url: { type: 'string' } } },
              },
            },
          },
          responses: { 200: { description: 'Import results' } },
        },
      },
    },
    components: {
      schemas: {
        ChatRequest: {
          type: 'object',
          required: ['messages'],
          properties: {
            messages: { type: 'array', items: { $ref: '#/components/schemas/Message' } },
            stream: { type: 'boolean', default: false },
            task: { type: 'string' },
          },
        },
        Message: {
          type: 'object',
          required: ['role', 'content'],
          properties: {
            role: { type: 'string', enum: ['system', 'user', 'assistant'] },
            content: { type: 'string' },
          },
        },
        CompletionRequest: {
          type: 'object',
          required: ['prompt'],
          properties: {
            prompt: { type: 'string' },
            context: { type: 'array', items: { type: 'string' } },
            model: { type: 'string' },
            maxTokens: { type: 'integer' },
            temperature: { type: 'number' },
          },
        },
        SearchRequest: {
          type: 'object',
          required: ['query'],
          properties: {
            query: { type: 'string' },
            target: { type: 'string' },
            maxResults: { type: 'integer', default: 20 },
          },
        },
        ContextRequest: {
          type: 'object',
          properties: {
            target: { type: 'string' },
            task: { type: 'string' },
            adapter: { type: 'string', default: 'codex' },
            budget: { type: 'integer', default: 6000 },
          },
        },
        DetectRequest: {
          type: 'object',
          properties: { target: { type: 'string' } },
        },
        GateRequest: {
          type: 'object',
          properties: { target: { type: 'string' } },
        },
        TrailStartRequest: {
          type: 'object',
          required: ['task'],
          properties: {
            target: { type: 'string' },
            task: { type: 'string' },
            agent: { type: 'string' },
          },
        },
        TrailUpdateRequest: {
          type: 'object',
          required: ['sessionFile', 'content'],
          properties: {
            target: { type: 'string' },
            sessionFile: { type: 'string' },
            content: { type: 'string' },
          },
        },
        ProviderConfig: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
            apiKey: { type: 'string' },
            baseUrl: { type: 'string' },
            models: { type: 'array', items: { type: 'string' } },
            enabled: { type: 'boolean' },
          },
        },
        MCPExecuteRequest: {
          type: 'object',
          required: ['serverId', 'toolName'],
          properties: {
            serverId: { type: 'string' },
            toolName: { type: 'string' },
            args: { type: 'object' },
            target: { type: 'string' },
          },
        },
      },
    },
  };
}

const ACTION_BODY = {
  requestBody: {
    required: true,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          required: ['code'],
          properties: { code: { type: 'string' }, language: { type: 'string' } },
        },
      },
    },
  },
};
