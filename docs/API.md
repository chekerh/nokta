# Nokta API Reference

Base URL: `http://localhost:4217` (local) or your deployed instance.

All authenticated endpoints require `Authorization: Bearer <token>` header.

## Auth

| Method | Path                           | Description                                            |
| ------ | ------------------------------ | ------------------------------------------------------ |
| POST   | `/api/v1/auth/register`        | Register: `{email, password, name?}` → `{user, token}` |
| POST   | `/api/v1/auth/login`           | Login: `{email, password}` → `{user, token}`           |
| POST   | `/api/v1/auth/logout`          | Logout (client should delete token)                    |
| GET    | `/api/v1/auth/me`              | Current user: `{}` → `{user}`                          |
| POST   | `/api/v1/auth/change-password` | `{currentPassword, newPassword}` → `{success: true}`   |

## Agent Runs

| Method | Path                             | Description                                       |
| ------ | -------------------------------- | ------------------------------------------------- |
| GET    | `/api/v1/agent-runs`             | List runs (`?status=running&limit=20`)            |
| POST   | `/api/v1/agent-runs`             | Create run: `{goal, steps?, provider?, trigger?}` |
| GET    | `/api/v1/agent-runs/:id`         | Get run details                                   |
| POST   | `/api/v1/agent-runs/:id/execute` | Execute a run                                     |
| POST   | `/api/v1/agent-runs/:id/cancel`  | Cancel a running run                              |
| DELETE | `/api/v1/agent-runs/:id`         | Delete a run                                      |
| POST   | `/api/v1/agent-runs/generate`    | Generate steps for a goal (no execution)          |
| POST   | `/api/v1/agent-runs/auto`        | Create + execute in one call                      |
| GET    | `/api/v1/agent-runs/events`      | SSE stream of run events                          |

## Sprint Planning

| Method | Path                                | Description                                                    |
| ------ | ----------------------------------- | -------------------------------------------------------------- |
| GET    | `/api/v1/planner/items`             | List items (`?status=backlog&priority=P0`)                     |
| POST   | `/api/v1/planner/items`             | Create item: `{type, title, description?, priority?, status?}` |
| GET    | `/api/v1/planner/items/:id`         | Get item                                                       |
| PATCH  | `/api/v1/planner/items/:id`         | Update item fields                                             |
| DELETE | `/api/v1/planner/items/:id`         | Delete item                                                    |
| GET    | `/api/v1/planner/sprints`           | List sprints                                                   |
| POST   | `/api/v1/planner/sprints`           | Create sprint: `{goal, startDate?, endDate?}`                  |
| POST   | `/api/v1/planner/sprints/:id/items` | Add items to sprint                                            |
| POST   | `/api/v1/planner/brainstorm`        | AI generate tasks: `{goal, stacks?, files?}`                   |
| GET    | `/api/v1/planner/summary`           | Dashboard stats (counts by status/priority)                    |
| GET    | `/api/v1/planner/reports/:sprintId` | Sprint burndown report                                         |

## Decisions

| Method | Path                                   | Description                                              |
| ------ | -------------------------------------- | -------------------------------------------------------- |
| GET    | `/api/v1/decisions`                    | List decisions (`?type=architectural&status=accepted`)   |
| POST   | `/api/v1/decisions`                    | Create: `{type, title, description?, rationale?, tags?}` |
| GET    | `/api/v1/decisions/:id`                | Get decision                                             |
| PATCH  | `/api/v1/decisions/:id`                | Update fields                                            |
| DELETE | `/api/v1/decisions/:id`                | Delete decision                                          |
| GET    | `/api/v1/decisions/:id/impact`         | Impact analysis                                          |
| GET    | `/api/v1/decisions/:id/related`        | Related decisions                                        |
| GET    | `/api/v1/decisions/analytics/summary`  | Aggregate stats                                          |
| POST   | `/api/v1/decisions/bulk-update-status` | Bulk update: `{decisionIds, status}`                     |
| GET    | `/api/v1/decisions/templates/:type`    | Decision template by type                                |

## Providers

| Method | Path                              | Description                                |
| ------ | --------------------------------- | ------------------------------------------ |
| GET    | `/api/v1/providers`               | List configured providers                  |
| POST   | `/api/v1/providers/:id/configure` | Set API key: `{apiKey, baseUrl?, models?}` |
| POST   | `/api/v1/providers/:id/enable`    | Enable provider                            |
| POST   | `/api/v1/providers/:id/disable`   | Disable provider                           |
| POST   | `/api/v1/providers/:id/health`    | Check provider health                      |
| GET    | `/api/v1/rate-limits`             | Current rate-limit bucket stats            |

## Chat & Completions

| Method | Path               | Description                                           |
| ------ | ------------------ | ----------------------------------------------------- |
| POST   | `/api/v1/chat`     | Chat: `{messages, stream?, task?, provider?, model?}` |
| POST   | `/api/v1/complete` | Text completion: `{prompt, model?, maxTokens?}`       |

## Billing

| Method | Path                           | Description                     |
| ------ | ------------------------------ | ------------------------------- |
| GET    | `/api/v1/billing/config`       | Public tier config (no auth)    |
| GET    | `/api/v1/billing/subscription` | Current user subscription       |
| POST   | `/api/v1/billing/upgrade`      | Upgrade tier (Stripe or direct) |
| POST   | `/api/v1/billing/portal`       | Stripe customer portal          |
| POST   | `/api/v1/billing/webhook`      | Stripe webhook receiver         |

## Trails

| Method | Path                               | Description                               |
| ------ | ---------------------------------- | ----------------------------------------- |
| GET    | `/api/v1/trail`                    | Trail index and active session            |
| POST   | `/api/v1/trail/start`              | Start session: `{target?, task?, agent?}` |
| PUT    | `/api/v1/trail/update`             | Update session content                    |
| GET    | `/api/v1/trail/sessions`           | List past sessions                        |
| GET    | `/api/v1/trail/session/:sessionId` | Get session content                       |
| POST   | `/api/v1/trail/resume`             | Resume a session                          |

## Gates & Quality

| Method | Path                   | Description                |
| ------ | ---------------------- | -------------------------- |
| POST   | `/api/v1/gates`        | Run all gates: `{target?}` |
| GET    | `/api/v1/gates/status` | Last gate results          |

## UI/UX Pro Max

| Method | Path                         | Description                             |
| ------ | ---------------------------- | --------------------------------------- |
| GET    | `/api/v1/uiux/search`        | Search design patterns: `?q=&domain=`   |
| GET    | `/api/v1/uiux/design-system` | Generate design system: `?q=&style=...` |

## Search

| Method | Path             | Description                              |
| ------ | ---------------- | ---------------------------------------- |
| GET    | `/api/v1/search` | Full-text + symbol search: `?q=&target=` |

## Skills

| Method | Path                    | Description                |
| ------ | ----------------------- | -------------------------- |
| GET    | `/api/v1/skills`        | List available skill packs |
| POST   | `/api/v1/skills/scan`   | Scan a repo for skills     |
| POST   | `/api/v1/skills/import` | Import a skill pack        |

## OpenAPI

| Method | Path                   | Description      |
| ------ | ---------------------- | ---------------- |
| GET    | `/api/v1/openapi.json` | OpenAPI 3.0 spec |
| GET    | `/api/v1/docs`         | Swagger UI       |

## Health

| Method | Path             | Description                               |
| ------ | ---------------- | ----------------------------------------- |
| GET    | `/health`        | Daemon health + provider status (no auth) |
| GET    | `/api/v1/health` | Same as `/health`                         |

## Costs

| Method | Path                    | Description                     |
| ------ | ----------------------- | ------------------------------- |
| GET    | `/api/v1/costs/summary` | Token usage and cost summary    |
| GET    | `/api/v1/costs/monthly` | Current month spend by provider |
