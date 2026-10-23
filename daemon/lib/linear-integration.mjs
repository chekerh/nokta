/**
 * Nokta Linear Integration
 *
 * Syncs Linear issues with Nokta agent runs.
 * - Webhook handler for Linear events (issue status changes)
 * - Auto-launch agent when issue moves to "In Progress"
 * - Update Linear issue with agent progress/completion
 * - Link agent runs to Linear issues
 */

import { launchAgent } from './agent-launcher.mjs';

const LINEAR_API_URL = 'https://api.linear.app/graphql';
const LINEAR_WEBHOOK_SECRET = process.env.LINEAR_WEBHOOK_SECRET || '';

/**
 * Make a GraphQL request to Linear API
 *
 * @param {string} apiKey - Linear API key
 * @param {string} query - GraphQL query
 * @param {Object} variables - Query variables
 * @returns {Object} Response data
 */
async function linearRequest(apiKey, query, variables = {}) {
  const response = await fetch(LINEAR_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`Linear API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  if (data.errors) {
    throw new Error(`Linear API errors: ${data.errors.map(e => e.message).join(', ')}`);
  }

  return data.data;
}

/**
 * Get issue details from Linear
 *
 * @param {string} apiKey - Linear API key
 * @param {string} issueId - Linear issue ID
 * @returns {Object} Issue data
 */
export async function getLinearIssue(apiKey, issueId) {
  const query = `
    query GetIssue($id: String!) {
      issue(id: $id) {
        id
        identifier
        title
        description
        state {
          id
          name
          type
        }
        project {
          id
          name
        }
        team {
          id
          key
        }
        assignee {
          id
          name
        }
        labels {
          nodes {
            id
            name
          }
        }
        url
      }
    }
  `;

  return linearRequest(apiKey, query, { id: issueId });
}

/**
 * Update Linear issue with comment
 *
 * @param {string} apiKey - Linear API key
 * @param {string} issueId - Linear issue ID
 * @param {string} body - Comment body
 * @returns {Object} Comment data
 */
export async function commentOnLinearIssue(apiKey, issueId, body) {
  const mutation = `
    mutation CreateComment($issueId: String!, $body: String!) {
      commentCreate(input: { issueId: $issueId, body: $body }) {
        success
        comment {
          id
          body
          createdAt
        }
      }
    }
  `;

  return linearRequest(apiKey, mutation, { issueId, body });
}

/**
 * Update Linear issue state
 *
 * @param {string} apiKey - Linear API key
 * @param {string} issueId - Linear issue ID
 * @param {string} stateId - Target state ID
 * @returns {Object} Updated issue
 */
export async function updateLinearIssueState(apiKey, issueId, stateId) {
  const mutation = `
    mutation UpdateIssue($id: String!, $stateId: String!) {
      issueUpdate(id: $id, input: { stateId: $stateId }) {
        success
        issue {
          id
          identifier
          state {
            id
            name
            type
          }
        }
      }
    }
  `;

  return linearRequest(apiKey, mutation, { id: issueId, stateId });
}

/**
 * Get project states for a team
 *
 * @param {string} apiKey - Linear API key
 * @param {string} teamId - Team ID
 * @returns {Array} States
 */
export async function getLinearStates(apiKey, teamId) {
  const query = `
    query GetStates($teamId: String!) {
      team(id: $teamId) {
        states {
          nodes {
            id
            name
            type
          }
        }
      }
    }
  `;

  return linearRequest(apiKey, query, { teamId });
}

/**
 * Create a webhook handler for Linear events
 *
 * @param {Object} options - Handler options
 * @returns {Function} Express handler
 */
export function createLinearWebhookHandler({ projectManager, orchestrator, log }) {
  return async (req, res) => {
    // Verify webhook signature if secret is configured
    if (LINEAR_WEBHOOK_SECRET) {
      const signature = req.headers['linear-signature'];
      if (!signature || !verifySignature(req.body, signature)) {
        return res.status(401).json({ error: 'Invalid signature' });
      }
    }

    const { action, type, data } = req.body;

    log.info(`Linear webhook: ${action} ${type}`, { issueId: data?.id });

    if (type === 'Issue' && action === 'update') {
      await handleIssueUpdate(data, { projectManager, orchestrator, log });
    } else if (type === 'Issue' && action === 'create') {
      await handleIssueCreate(data, { projectManager, orchestrator, log });
    }

    res.json({ received: true });
  };
}

/**
 * Handle issue creation - auto-link to project if configured
 *
 * @param {Object} issue - Issue data from webhook
 * @param {Object} deps - Dependencies
 */
async function handleIssueCreate(issue, { _projectManager, _orchestrator, log }) {
  // Find project linked to this Linear team/project
  // This would require a mapping from Linear team/project to Nokta project
  // For now, we log and could auto-detect based on labels
  log.info(`Linear issue created: ${issue.identifier} - ${issue.title}`);
}

/**
 * Handle issue update - trigger agent on status change to "In Progress"
 *
 * @param {Object} issue - Issue data from webhook
 * @param {Object} deps - Dependencies
 */
async function handleIssueUpdate(issue, { projectManager, _orchestrator, log }) {
  const previousState = issue.previousState?.type;
  const currentState = issue.state?.type;

  log.info(`Issue ${issue.identifier} state: ${previousState} -> ${currentState}`);

  // Trigger agent when issue moves to "started" (In Progress)
  if (previousState !== 'started' && currentState === 'started') {
    log.info(`Issue ${issue.identifier} moved to In Progress, checking for linked project...`);

    // Find the project linked to this issue's team/project
    // For now, check if we have a project with matching linkedLinearId
    const projects = projectManager.getOrgChart();

    for (const proj of projects) {
      const registry = await projectManager.getProjectRegistry(proj.rootPath);
      if (registry.linkedLinearId &&
          (registry.linkedLinearId === issue.team?.id || registry.linkedLinearId === issue.project?.id)) {

        log.info(`Found linked project ${proj.name} for Linear issue ${issue.identifier}`);

        // Launch agent for this issue
        try {
          const runInfo = await launchAgent({
            projectRoot: proj.rootPath,
            goal: `Linear ${issue.identifier}: ${issue.title}\n\n${issue.description || ''}`,
            options: {
              linkedLinearId: issue.id,
              linearIssueId: issue.id,
              linearIdentifier: issue.identifier,
            },
          });

          // Comment on Linear issue with run link
          // This would need the Linear API key from the project config
          log.info(`Launched agent run ${runInfo.runId} for Linear issue ${issue.identifier}`);

          // TODO: Post comment to Linear with run link
          // await commentOnLinearIssue(apiKey, issue.id,
          //   `🤖 Agent started: Run ${runInfo.runId.slice(0, 12)}`);

        } catch (err) {
          log.error(`Failed to launch agent for Linear issue ${issue.identifier}: ${err.message}`);
        }

        break;
      }
    }
  }

  // Update Linear with completion when agent finishes
  // This would be handled by the orchestrator emitting events
}

/**
 * Verify Linear webhook signature
 *
 * @param {Object} payload - Request body
 * @param {string} signature - Signature header
 * @returns {boolean} Valid signature
 */
function verifySignature(_payload, _signature) {
  // Linear uses HMAC-SHA256 with the webhook secret
  // Implementation depends on Linear's exact signature format
  // For now, return true if no secret configured
  return !LINEAR_WEBHOOK_SECRET;
}

/**
 * Register Linear webhook with Linear
 *
 * @param {string} apiKey - Linear API key
 * @param {string} webhookUrl - Public webhook URL
 * @param {string} teamId - Team ID to register for
 * @returns {Object} Webhook data
 */
export async function registerLinearWebhook(apiKey, webhookUrl, teamId) {
  const mutation = `
    mutation CreateWebhook($url: String!, $teamId: String!) {
      webhookCreate(input: { url: $url, teamId: $teamId, resourceTypes: [Issue], actions: [create, update] }) {
        success
        webhook {
          id
          url
        }
      }
    }
  `;

  return linearRequest(apiKey, mutation, { url: webhookUrl, teamId });
}

/**
 * Sync agent run progress to Linear issue
 *
 * @param {string} apiKey - Linear API key
 * @param {string} issueId - Linear issue ID
 * @param {Object} runInfo - Agent run info
 * @param {string} status - Run status
 */
export async function syncRunToLinear(apiKey, issueId, runInfo, status) {
  const statusEmoji = {
    running: '🔄',
    completed: '✅',
    failed: '❌',
    cancelled: '⏹️',
  }[status] || '📝';

  const body = `${statusEmoji} **Agent Update**\n` +
    `Run: \`${runInfo.runId?.slice(0, 12) || 'unknown'}\`\n` +
    `Status: ${status}\n` +
    `Goal: ${runInfo.goal?.slice(0, 200) || 'N/A'}\n` +
    `Tokens: ${runInfo.tokensUsed || 0}\n` +
    `Cost: $${(runInfo.costUsd || 0).toFixed(4)}\n` +
    `View: ${process.env.NOKTA_PUBLIC_URL || ''}/workspace.html?run=${runInfo.runId}`;

  return commentOnLinearIssue(apiKey, issueId, body);
}

export { linearRequest };
