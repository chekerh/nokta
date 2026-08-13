import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('semanticSearch finds relevant files', async () => {
  const { semanticSearch } = await import(path.join(DIR, 'daemon', 'lib', 'semantic.mjs'));
  const result = await semanticSearch('auth middleware', DIR, { maxResults: 5 });

  assert.ok(result.indexedFiles > 0);
  assert.ok(result.vocabSize > 0);
  assert.ok(Array.isArray(result.results));
  assert.ok(result.total > 0, 'should find some results for common terms');
});

test('semanticSearch returns zero results for very unique nonsense', async () => {
  const { semanticSearch } = await import(path.join(DIR, 'daemon', 'lib', 'semantic.mjs'));
  const result = await semanticSearch('a b c d e f g h i j k l m n o p q r s t u v w x y z', DIR, { maxResults: 5 });

  assert.equal(result.total, 0);
});

test('semanticSearch respects maxResults limit', async () => {
  const { semanticSearch } = await import(path.join(DIR, 'daemon', 'lib', 'semantic.mjs'));
  const result = await semanticSearch('auth', DIR, { maxResults: 2 });

  assert.ok(result.results.length <= 2);
});
