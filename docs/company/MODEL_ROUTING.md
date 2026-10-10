# Model Routing

Routing reflects what is actually installed. The previous four-tier table
listed free OpenRouter model IDs that are not configured on this machine, so
it routed to nothing.

## Providers

Source of truth: `~/.nokta/providers.json` (backed up alongside itself on edit).

| Provider   | Status  | Models                                                    |
| ---------- | ------- | --------------------------------------------------------- |
| Ollama     | enabled | `qwen2.5:7b`, `phi3:latest`, `qwen2.5:0.5b`               |
| OpenAI     | no key  | `gpt-4o`, `gpt-4o-mini`                                    |
| Anthropic  | no key  | `claude-sonnet-4-20250514`, `claude-haiku-3-20250313`      |
| OpenRouter | no key  | `anthropic/claude-sonnet`, `openai/gpt-4o`, ...            |

Local is the default. Cloud providers stay disabled until a key is present in
`.env`; an enabled provider with no key is a misconfiguration, not a fallback.

## Local tier selection

| Tier            | Model            | Use For                                            |
| --------------- | ---------------- | -------------------------------------------------- |
| Orchestrator    | `qwen2.5:7b`    | CEO, Chief of Staff, planning, multi-step work     |
| Implementation  | `qwen2.5:7b`    | Frontend, Backend, QA, DevOps, Database, Security  |
| Fast Worker     | `qwen2.5:0.5b`  | Repo archaeology, Tech Writer, mechanical edits     |
| Fallback        | `phi3:latest`   | Used only when the model above is unavailable      |

`qwen2.5:7b` is the only local model strong enough to hold the separation of
duties below, so it covers both authoring and implementation. `phi3` and the
0.5b model are not eligible to author work that a verifier must certify.

## Separation of Duties

- Executor and verifier MUST use different models.
- No model can author and independently certify the same change.
- With a single capable local model this is only satisfiable by *role
  separation plus independent verification against source* — a second model
  pass is not available locally. Verification must therefore re-derive claims
  from files and test output rather than re-reading the author's reasoning.
- If a second capable provider is added, routing should assign it to the
  verifier role automatically so this rule becomes structural instead of
  procedural.

## Updating

Change the model list in `~/.nokta/providers.json`, not here. Then confirm
what the daemon actually loaded:

```bash
curl -s http://127.0.0.1:4217/api/v1/agents -H "Authorization: Bearer $NOKTA_TOKEN" \
  | python3 -m json.tool | grep -A6 ollamaStatus
```

If `installedModels` does not match the file, the daemon is running a stale
config and must be restarted.
