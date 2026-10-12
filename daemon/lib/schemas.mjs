import { z } from 'zod';

// Request-body schemas for every POST/PUT/PATCH route that reads req.body.
//
// Design rules:
//   * `loose(shape)` keeps unknown keys. Routes such as planner and providers
//     forward extra fields straight to their engines, so stripping them would
//     be a silent regression.
//   * Optional fields use `.nullish()` where the route coalesces with `|| {}`
//     or `|| []` — a JSON `null` behaves like absent today and must keep doing
//     so.
//   * Presence checks the route already performs with a specific message are
//     left to the route (e.g. agent-runs' "goal or steps is required"); the
//     schema only constrains types/enums so wrong types become a 400 instead
//     of an unhandled 500.

const loose = (shape) => z.object(shape).catchall(z.unknown());

const ITEM_TYPES = ['story', 'task', 'bug', 'subtask', 'epic', 'initiative'];
const PRIORITIES = ['P0', 'P1', 'P2', 'P3', 'P4', 'P5'];
const ITEM_STATUSES = ['backlog', 'ready', 'in-progress', 'review', 'done', 'cancelled'];
const SPRINT_STATUSES = ['planning', 'active', 'review', 'closed'];
const PROVIDERS = ['opencode', 'freebuff'];
const TIERS = ['free', 'pro', 'enterprise'];

// ── Auth ─────────────────────────────────────────────────────────
export const RegisterSchema = loose({
  email: z.string().min(1),
  password: z.string().min(1),
  name: z.string().nullish(),
});
export const LoginSchema = loose({ email: z.string().min(1), password: z.string().min(1) });
export const ChangePasswordSchema = loose({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(1),
});
export const ForgotPasswordSchema = loose({ email: z.string().min(1) });
export const ResetPasswordSchema = loose({ token: z.string().min(1), password: z.string().min(1) });
export const RefreshTokenSchema = loose({ refreshToken: z.string().min(1) });

// ── Agents ───────────────────────────────────────────────────────
export const AgentRecommendSchema = loose({ prompt: z.string().min(1) });
export const AgentExecuteSchema = loose({ goal: z.string().min(1) });

// ── Providers ────────────────────────────────────────────────────
export const ProviderDefaultSchema = loose({ id: z.string().min(1) });
export const ProviderAutoRouteSchema = loose({ enabled: z.boolean().nullish() });
export const ProviderConfigureSchema = loose({
  id: z.string().min(1),
  apiKey: z.string().nullish(),
  baseUrl: z.string().nullish(),
  models: z.array(z.string()).nullish(),
  enabled: z.boolean().nullish(),
});
export const ProviderUpdateSchema = loose({
  apiKey: z.string().nullish(),
  baseUrl: z.string().nullish(),
  models: z.array(z.string()).nullish(),
  enabled: z.boolean().nullish(),
  maxTokens: z.number().nullish(),
  temperature: z.number().nullish(),
});

// ── MCP ──────────────────────────────────────────────────────────
export const McpExecuteSchema = loose({
  serverId: z.string().min(1),
  toolName: z.string().min(1),
  args: z.unknown().nullish(),
  target: z.string().nullish(),
});
export const McpServersSchema = loose({
  target: z.string().nullish(),
  servers: z.array(z.record(z.string(), z.unknown())),
});

// ── Brain ────────────────────────────────────────────────────────
export const BrainDnaSchema = loose({ dna: z.array(z.string()) });
export const BrainPatternSchema = loose({ rule: z.string().min(1), example: z.string().min(1) });

// ── Context / detect ─────────────────────────────────────────────
export const ContextSchema = loose({
  target: z.string().nullish(),
  task: z.string().nullish(),
  adapter: z.string().nullish(),
  budget: z.union([z.number(), z.string()]).nullish(),
});
export const DetectSchema = loose({ target: z.string().nullish() });

// ── Chat / completion ────────────────────────────────────────────
export const ChatSchema = loose({
  messages: z.array(loose({ role: z.string().min(1), content: z.string() })).min(1),
  stream: z.boolean().nullish(),
  task: z.string().nullish(),
  conciseness: z.string().nullish(),
  provider: z.string().nullish(),
  model: z.string().nullish(),
});
export const CompleteSchema = loose({
  prompt: z.string().min(1),
  context: z.array(z.string()).nullish(),
  model: z.string().nullish(),
  maxTokens: z.number().nullish(),
  temperature: z.number().nullish(),
});

// ── Search ───────────────────────────────────────────────────────
export const SearchSchema = loose({
  query: z.string().min(1),
  target: z.string().nullish(),
  maxResults: z.number().nullish(),
  dir: z.string().nullish(),
  ext: z.union([z.string(), z.array(z.string())]).nullish(),
  regex: z.string().nullish(),
});
export const SemanticSearchSchema = loose({
  query: z.string().min(1),
  target: z.string().nullish(),
  maxResults: z.number().nullish(),
});

// ── Sandbox ──────────────────────────────────────────────────────
export const SandboxExecSchema = loose({
  code: z.string().min(1),
  fileName: z.string().nullish(),
  timeoutMs: z.number().nullish(),
  memoryLimit: z.union([z.string(), z.number()]).nullish(),
});
export const SandboxExecFileSchema = loose({
  file: z.string().min(1),
  target: z.string().nullish(),
  timeoutMs: z.number().nullish(),
  memoryLimit: z.union([z.string(), z.number()]).nullish(),
});

// ── Code actions ─────────────────────────────────────────────────
export const CodeExplainSchema = loose({ code: z.string().min(1), language: z.string().nullish() });
export const CodeRefactorSchema = loose({
  code: z.string().min(1),
  language: z.string().nullish(),
  suggestion: z.string().nullish(),
});
export const CodeTestSchema = loose({
  code: z.string().min(1),
  language: z.string().nullish(),
  testFramework: z.string().nullish(),
});
export const CodeFixSchema = loose({
  code: z.string().min(1),
  language: z.string().nullish(),
  errors: z.unknown().nullish(),
});

// ── Projects ─────────────────────────────────────────────────────
export const ProjectCreateSchema = loose({
  name: z.string().min(1),
  rootPath: z.string().min(1),
  techStack: z.string().nullish(),
});

// ── Skill evolution ──────────────────────────────────────────────
export const SkillSynthesizeSchema = loose({ sources: z.record(z.string(), z.unknown()).nullish() });

// ── Skill sources ────────────────────────────────────────────────
export const SkillScanSchema = loose({ url: z.string().min(1) });
export const SkillImportSchema = loose({ url: z.string().min(1) });

// ── Adversarial review ───────────────────────────────────────────
// `code` and `file` are individually optional here; the route enforces that at
// least one is present so its own error message survives.
export const AdversarialReviewSchema = loose({
  code: z.string().nullish(),
  file: z.string().nullish(),
  target: z.string().nullish(),
  provider: z.string().nullish(),
  model: z.string().nullish(),
  maxRounds: z.number().nullish(),
});
export const AdversarialCritiqueSchema = loose({
  code: z.string().nullish(),
  file: z.string().nullish(),
  target: z.string().nullish(),
  provider: z.string().nullish(),
  model: z.string().nullish(),
});

// ── Fleet ────────────────────────────────────────────────────────
export const FleetRegisterSchema = loose({
  project: z.string().min(1),
  provider: z.enum(PROVIDERS).nullish(),
  pid: z.number().nullish(),
  port: z.number().nullish(),
  cwd: z.string().nullish(),
});
export const FleetRunSchema = loose({
  prompt: z.string().min(1),
  provider: z.enum(PROVIDERS).nullish(),
  timeoutMs: z.number().nullish(),
});
export const FleetPlanSchema = loose({ prompt: z.string().min(1), provider: z.enum(PROVIDERS).nullish() });

// ── Trail ────────────────────────────────────────────────────────
export const TrailStartSchema = loose({
  target: z.string().nullish(),
  task: z.string().nullish(),
  agent: z.string().nullish(),
});
export const TrailUpdateSchema = loose({
  target: z.string().nullish(),
  sessionFile: z.string().min(1),
  content: z.string().min(1),
});
export const TrailResumeSchema = loose({ target: z.string().nullish(), sessionId: z.string().min(1) });

// ── Costs ────────────────────────────────────────────────────────
export const CostEstimateSchema = loose({
  model: z.string().min(1),
  inputTokens: z.number().nullish(),
  outputTokens: z.number().nullish(),
});

// ── Gates ────────────────────────────────────────────────────────
export const GatesCheckSchema = loose({ target: z.string().nullish(), messages: z.array(z.unknown()).nullish() });
export const GatesEvaluateSchema = loose({ messages: z.array(z.unknown()), estimatedTokens: z.number().nullish() });
export const GatesCheckTokenSchema = loose({
  messages: z.array(z.unknown()).nullish(),
  estimatedTokens: z.number().nullish(),
});
export const GatesCheckSecuritySchema = loose({ messages: z.array(z.unknown()).nullish() });
export const GatesConfigSchema = loose({
  tokenLimit: z.number().nullish(),
  severity: z.record(z.string(), z.unknown()).nullish(),
});

// ── Billing ──────────────────────────────────────────────────────
export const BillingUpgradeSchema = loose({
  tier: z.enum(TIERS).nullish(),
  successUrl: z.string().nullish(),
  cancelUrl: z.string().nullish(),
});
export const BillingPortalSchema = loose({ returnUrl: z.string().nullish() });

// ── Admin ────────────────────────────────────────────────────────
export const AdminRoleSchema = loose({ role: z.enum(['admin', 'user']) });
export const AdminTierSchema = loose({ tier: z.enum(TIERS) });

// ── Agent runs ───────────────────────────────────────────────────
export const AgentRunCreateSchema = loose({
  goal: z.string().min(1).nullish(),
  steps: z.array(z.record(z.string(), z.unknown())).nullish(),
  provider: z.string().nullish(),
  model: z.string().nullish(),
  trigger: z.string().nullish(),
  metadata: z.record(z.string(), z.unknown()).nullish(),
  draft: z.boolean().nullish(),
});
export const AgentRunGenerateSchema = loose({
  goal: z.string().min(1).nullish(),
  metadata: z.record(z.string(), z.unknown()).nullish(),
});

// ── Planner ──────────────────────────────────────────────────────
export const PlannerItemCreateSchema = loose({
  type: z.enum(ITEM_TYPES).nullish(),
  title: z.string().nullish(),
  description: z.string().nullish(),
  priority: z.enum(PRIORITIES).nullish(),
  status: z.enum(ITEM_STATUSES).nullish(),
  epic: z.string().nullish(),
  sprint: z.string().nullish(),
  labels: z.array(z.string()).nullish(),
  acceptanceCriteria: z.array(z.string()).nullish(),
  autoGenerated: z.boolean().nullish(),
});
export const PlannerItemUpdateSchema = loose({
  type: z.enum(ITEM_TYPES).nullish(),
  title: z.string().nullish(),
  description: z.string().nullish(),
  priority: z.enum(PRIORITIES).nullish(),
  status: z.enum(ITEM_STATUSES).nullish(),
  epic: z.string().nullish(),
  sprint: z.string().nullish(),
  labels: z.array(z.string()).nullish(),
  acceptanceCriteria: z.array(z.string()).nullish(),
});
export const PlannerFeedbackSchema = loose({ action: z.enum(['accept', 'reject', 'edit']) });
export const PlannerSprintCreateSchema = loose({
  goal: z.string().nullish(),
  startDate: z.string().nullish(),
  endDate: z.string().nullish(),
  itemIds: z.array(z.string()).nullish(),
  status: z.enum(SPRINT_STATUSES).nullish(),
});
export const PlannerSprintUpdateSchema = PlannerSprintCreateSchema.extend({ velocity: z.number().nullish() });
export const PlannerSprintItemsSchema = loose({ itemIds: z.array(z.string()) });
export const PlannerEpicCreateSchema = loose({
  title: z.string().nullish(),
  description: z.string().nullish(),
  initiative: z.string().nullish(),
  status: z.string().nullish(),
});
export const PlannerEpicUpdateSchema = PlannerEpicCreateSchema;
export const PlannerInitiativeCreateSchema = loose({
  title: z.string().nullish(),
  description: z.string().nullish(),
  theme: z.string().nullish(),
  status: z.string().nullish(),
});
export const PlannerBrainstormSchema = loose({
  context: z.record(z.string(), z.unknown()).nullish(),
  prompts: loose({ features: z.string().min(1) }),
});
export const PlannerAutoPrioritizeSchema = loose({
  recentChanges: z.array(z.unknown()).nullish(),
  deadlines: z.unknown().nullish(),
});
export const PlannerLinkDecisionSchema = loose({ relationship: z.string().nullish() });

// ── UI/UX ────────────────────────────────────────────────────────
export const UiuxSearchSchema = loose({
  query: z.string().min(1),
  domain: z.string().nullish(),
  stack: z.string().nullish(),
  limit: z.number().nullish(),
  category: z.string().nullish(),
});
export const UiuxDesignSystemSchema = loose({
  query: z.string().min(1),
  projectName: z.string().nullish(),
  format: z.string().nullish(),
  persist: z.boolean().nullish(),
  includeExamples: z.boolean().nullish(),
});
export const UiuxRecommendationsSchema = loose({
  itemId: z.string().nullish(),
  featureDescription: z.string().nullish(),
  projectContext: z.record(z.string(), z.unknown()).nullish(),
});
export const UiuxComponentSuggestionsSchema = loose({
  functionality: z.string().min(1),
  platform: z.string().nullish(),
  preferences: z.record(z.string(), z.unknown()).nullish(),
  includeAccessibility: z.boolean().nullish(),
});
export const UiuxTemplatesSchema = loose({ templateType: z.string().min(1), platform: z.string().nullish() });
export const UiuxMetricsSchema = loose({ timeframe: z.string().nullish(), metricTypes: z.array(z.string()).nullish() });
