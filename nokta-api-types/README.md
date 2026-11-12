# nokta-api-types

TypeScript types for the Nokta Daemon API, auto-generated from the OpenAPI 3.0 spec.

## Installation

```bash
npm install nokta-api-types
```

## Usage

```typescript
import type { paths, components, operations } from 'nokta-api-types';

// Type-safe API paths
type ChatRequest = components['schemas']['ChatRequest'];
type ChatResponse = paths['/api/v1/chat']['post']['responses'][200];

// Or use operation helpers
type ChatOperation = operations['post:/api/v1/chat'];
type ChatRequestBody = ChatOperation['requestBody']['content']['application/json'];
type ChatResponseBody = ChatOperation['responses'][200]['content']['application/json'];
```

## Available Types

- **paths** — All API endpoints with typed parameters, request bodies, and responses
- **components** — All schemas, parameters, headers, and response objects
- **operations** — Flattened operation types for each endpoint

## Regeneration

Types are generated from `daemon/lib/openapi.mjs`:

```bash
npm run generate
npm run build
```

The generation script:
1. Loads the OpenAPI spec from the daemon
2. Runs `openapi-typescript` to generate TypeScript definitions
3. Outputs to `src/api-types.ts`
4. Builds declaration files to `dist/`