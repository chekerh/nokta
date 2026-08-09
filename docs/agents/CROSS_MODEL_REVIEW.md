# Cross-Model Review

## Protocol

The executor and verifier MUST use different models. No model can author and independently certify the same change.

## Review Checklist

After each implementation task:

1. **Author** (deepseek-v4-flash-free): Implements the change
2. **Reviewer** (nemotron-3-ultra-free): Reviews for:
   - Security issues
   - Architecture soundness
   - Code quality
   - Test coverage
3. **QA** (deepseek-v4-flash-free): Runs tests, verifies pass

## Review Questions

- Does the implementation match the task specification?
- Are all edge cases handled?
- Is error handling robust?
- Are secrets properly managed?
- Is the code readable and maintainable?
- Does it follow existing patterns?
- Is test coverage ≥80%?
- Does lint pass?
- Does `npm run test:ci` pass?
- Does the daemon start cleanly?
- Does health check respond?
