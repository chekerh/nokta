/**
 * @module Nokta Daemon Types
 * JSDoc type definitions for the entire daemon API contract.
 * Provides editor intellisense without a TypeScript build step.
 */

/**
 * ── Messages & Chat ──────────────────────────────────────────────
 */

/**
 * @typedef {Object} Message
 * @property {'system'|'user'|'assistant'} role
 * @property {string} content
 */

/**
 * @typedef {Object} ChatRequest
 * @property {Message[]} messages - Required, non-empty
 * @property {boolean} [stream=false] - Enable SSE streaming
 * @property {string} [task] - Task description for context compilation
 */

/**
 * @typedef {Object} ChatResponse
 * @property {string} content
 * @property {string} [finishReason]
 * @property {number} [tokensUsed]
 * @property {string} [model]
 * @property {string} [provider]
 */

/**
 * @typedef {Object} CompletionRequest
 * @property {string} prompt - Required
 * @property {string[]} [context]
 * @property {string} [model]
 * @property {number} [maxTokens=4096]
 * @property {number} [temperature=0.7]
 */

/**
 * @typedef {Object} CompletionResponse
 * @property {string} completion
 */

/**
 * ── Provider System ─────────────────────────────────────────────
 */

/**
 * @callback ChatMethod
 * @param {Message[]} messages
 * @param {Object} [opts]
 * @param {boolean} [opts.stream]
 * @param {string} [opts.model]
 * @param {number} [opts.maxTokens]
 * @param {number} [opts.temperature]
 * @param {AbortSignal} [opts.signal]
 * @returns {Promise<ChatResponse|Response>} ChatResponse for non-stream, raw Response for stream
 */

/**
 * @callback CompleteMethod
 * @param {string} prompt
 * @param {Object} [opts]
 * @param {string[]} [opts.context]
 * @param {string} [opts.model]
 * @param {number} [opts.maxTokens]
 * @param {number} [opts.temperature]
 * @param {AbortSignal} [opts.signal]
 * @returns {Promise<CompletionResponse>}
 */

/**
 * @callback ListModelsMethod
 * @returns {Promise<string[]>}
 */

/**
 * @callback HealthMethod
 * @returns {Promise<{status:'ok'|'error', provider:string, error?:string}>}
 */

/**
 * @typedef {Object} ProviderContract
 * Methods all providers must implement.
 * @property {ChatMethod} chat
 * @property {CompleteMethod} complete
 * @property {ListModelsMethod} listModels
 * @property {HealthMethod} health
 */

/**
 * @typedef {Object} ProviderConfig
 * @property {string} id
 * @property {string} name
 * @property {string} [apiKey]
 * @property {string} [baseUrl]
 * @property {string[]} [models]
 * @property {boolean} [enabled=true]
 * @property {number} [maxTokens=4096]
 * @property {number} [temperature=0.7]
 * @property {number} [timeout=60000]
 */

/**
 * @typedef {Object} ProviderSnapshot
 * @property {string} id
 * @property {string} name
 * @property {string[]} models
 * @property {boolean} enabled
 * @property {boolean} hasKey
 */

/**
 * @typedef {Object} ProviderHealthMap
 * @property {string} id
 * @property {'ok'|'error'} status
 * @property {string} provider
 * @property {string} [error]
 */

/**
 * @typedef {Object} AgentEntry
 * @property {string} id
 * @property {string} name
 * @property {string} type
 * @property {string[]} models
 * @property {boolean} enabled
 * @property {boolean} [running]
 */

/**
 * @typedef {Object} AgentListResponse
 * @property {AgentEntry[]} agents
 * @property {{running:boolean, error?:string, installedModels:string[]}} ollamaStatus
 */

/**
 * @typedef {Object} ComplexityResponse
 * @property {'low'|'medium'|'high'} complexity
 * @property {'quick'|'implementation'|'architecture'} taskType
 * @property {number} recommendedTier
 * @property {string} recommendedAgent
 * @property {string} reasoning
 */

/**
 * @typedef {Object} ProviderListResponse
 * @property {ProviderSnapshot[]} providers
 */

/**
 * ── Errors ──────────────────────────────────────────────────────
 */

/**
 * @typedef {Object} ErrorResponse
 * @property {string} error
 * @property {number} [status]
 */

/**
 * Custom error with HTTP status code for API responses.
 */
export class AppError extends Error {
  /**
   * @param {string} message
   * @param {number} [status=500]
   */
  constructor(message, status = 500) {
    super(message);
    this.name = 'AppError';
    /** @type {number} */
    this.status = status;
  }
}

/**
 * ── Gates ───────────────────────────────────────────────────────
 */

/**
 * @typedef {Object} GateResult
 * @property {string} gate
 * @property {'pass'|'fail'} status
 * @property {string} message
 * @property {string} [remediation]
 */

/**
 * @typedef {Object} GateEvalResponse
 * @property {boolean} passed
 * @property {GateResult[]} gates
 * @property {string} summary
 */

/**
 * @typedef {Object} GateStatusResponse
 * @property {number} total
 * @property {number} passed
 * @property {number} failed
 * @property {boolean} passing
 * @property {GateResult[]} results
 */

/**
 * ── Trails ──────────────────────────────────────────────────────
 */

/**
 * @typedef {Object} TrailResponse
 * @property {string} [index]
 * @property {string} [activeSession]
 * @property {string} [sessionContent]
 * @property {string[]} [recentSessions]
 */

/**
 * @typedef {Object} TrailStartRequest
 * @property {string} [target]
 * @property {string} [task]
 * @property {string} [agent]
 */

/**
 * @typedef {Object} TrailStartResponse
 * @property {boolean} success
 * @property {string} sessionFile
 * @property {string} path
 */

/**
 * @typedef {Object} TrailUpdateRequest
 * @property {string} [target]
 * @property {string} sessionFile
 * @property {string} content
 */

/**
 * ── Search ──────────────────────────────────────────────────────
 */

/**
 * @typedef {Object} SearchLine
 * @property {number} line
 * @property {string} text
 */

/**
 * @typedef {Object} SearchResult
 * @property {string} file
 * @property {number} score
 * @property {string[]} matches
 * @property {SearchLine[]} lines
 * @property {string} snippet
 */

/**
 * @typedef {Object} SearchRequest
 * @property {string} query
 * @property {string} [target]
 * @property {number} [maxResults=20]
 */

/**
 * @typedef {Object} SearchResponse
 * @property {SearchResult[]} results
 * @property {number} total
 */

/**
 * ── MCP ─────────────────────────────────────────────────────────
 */

/**
 * @typedef {Object} MCPExecuteRequest
 * @property {string} serverId
 * @property {string} toolName
 * @property {Object} [args]
 * @property {string} [target]
 */

/**
 * @typedef {Object} MCPExecuteResponse
 * @property {Object} result
 */

/**
 * @typedef {Object} MCPServerEntry
 * @property {string} name
 * @property {string} command
 * @property {string} type
 */

/**
 * @typedef {Object} MCPServerListResponse
 * @property {MCPServerEntry[]} servers
 */

/**
 * ── Code Actions ────────────────────────────────────────────────
 */

/**
 * @typedef {Object} CodeActionRequest
 * @property {string} code
 * @property {string} [language]
 */

/**
 * @typedef {Object} CodeActionResponse
 * @property {string} explanation|refactored|tests|fixed
 */

/**
 * @typedef {Object} RefactorRequest
 * @property {string} code
 * @property {string} [language]
 * @property {string} [suggestion]
 */

/**
 * @typedef {Object} TestGenRequest
 * @property {string} code
 * @property {string} [language]
 * @property {string} [testFramework]
 */

/**
 * @typedef {Object} FixErrorsRequest
 * @property {string} code
 * @property {string} [language]
 * @property {Object} [errors]
 */

/**
 * ── Context ─────────────────────────────────────────────────────
 */

/**
 * @typedef {Object} ContextRequest
 * @property {string} [target]
 * @property {string} [task]
 * @property {string} [adapter='codex']
 * @property {number} [budget=6000]
 */

/**
 * @typedef {Object} DetectedProject
 * @property {string} target
 * @property {string[]} files
 * @property {string[]} stacks
 * @property {string[]} packageManagers
 */

/**
 * @typedef {Object} PackEntry
 * @property {string} id
 * @property {string} title
 * @property {string} kind
 * @property {string} summary
 * @property {number} priority
 * @property {number} tokenCost
 * @property {boolean} [required]
 * @property {Object} triggers
 */

/**
 * @typedef {Object} PackListResponse
 * @property {PackEntry[]} packs
 */

/**
 * ── Health ──────────────────────────────────────────────────────
 */

/**
 * @typedef {Object} HealthResponse
 * @property {'ok'} status
 * @property {string} version
 * @property {Array<{id:string, name:string, enabled:boolean, healthy:boolean}>} providers
 * @property {string|null} defaultProvider
 * @property {boolean} autoRoute
 * @property {string[]} routes
 */

/**
 * ── Projects ─────────────────────────────────────────────────────
 */

/**
 * @typedef {Object} ProjectCreateRequest
 * @property {string} name
 * @property {string} rootPath
 * @property {string} [techStack='unknown']
 */

/**
 * @typedef {Object} ProjectResponse
 * @property {string} id
 * @property {string} name
 * @property {string} rootPath
 * @property {string} techStack
 */

/**
 * @typedef {Object} ProjectListResponse
 * @property {ProjectResponse[]} projects
 */

/**
 * ── Brain ────────────────────────────────────────────────────────
 */

/**
 * @typedef {Object} BrainResponse
 * @property {string[]} operational_dna
 * @property {object} design_preferences
 * @property {Array<{pattern:string, example:string, timestamp:string}>} learned_patterns
 */

/**
 * @typedef {Object} BrainContextResponse
 * @property {string} context
 */

/**
 * ── Search ───────────────────────────────────────────────────────
 */

/**
 * @typedef {Object} SemanticSearchRequest
 * @property {string} query
 * @property {string} [target]
 * @property {number} [maxResults=10]
 */

/**
 * @typedef {Object} SemanticSearchResult
 * @property {string} file
 * @property {string} ext
 * @property {number} score
 * @property {string} snippet
 * @property {number} tokenCount
 */

/**
 * @typedef {Object} SemanticSearchResponse
 * @property {SemanticSearchResult[]} results
 * @property {number} total
 * @property {number} vocabSize
 * @property {number} indexedFiles
 */

/**
 * ── Sandbox ──────────────────────────────────────────────────────
 */

/**
 * @typedef {Object} SandboxExecRequest
 * @property {string} code
 * @property {string} [fileName]
 * @property {number} [timeoutMs=30000]
 * @property {string} [memoryLimit]
 */

/**
 * @typedef {Object} SandboxResultResponse
 * @property {string} stdout
 * @property {string} stderr
 * @property {number} exitCode
 * @property {boolean} passed
 * @property {boolean} timedOut
 * @property {number} durationMs
 */

/**
 * ── Adversarial ──────────────────────────────────────────────────
 */

/**
 * @typedef {Object} AdversarialIssue
 * @property {'critical'|'high'|'medium'|'low'} severity
 * @property {string} category
 * @property {string} [file]
 * @property {number} [line]
 * @property {string} message
 * @property {string} [suggestion]
 */

/**
 * @typedef {Object} AdversarialCritiqueResponse
 * @property {AdversarialIssue[]} issues
 * @property {object} summary
 * @property {boolean} passed
 */
