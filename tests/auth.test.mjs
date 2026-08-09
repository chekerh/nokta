import assert from 'node:assert/strict';
import test from 'node:test';
import { validatePassword } from '../daemon/lib/auth.mjs';

test('validatePassword rejects passwords shorter than 8 characters', () => {
  const result = validatePassword('Ab1!');
  assert.equal(result.valid, false);
  assert.match(result.reason, /8 characters/);
});

test('validatePassword rejects passwords without uppercase', () => {
  const result = validatePassword('abcdefg1!');
  assert.equal(result.valid, false);
  assert.match(result.reason, /uppercase/);
});

test('validatePassword rejects passwords without lowercase', () => {
  const result = validatePassword('ABCDEFG1!');
  assert.equal(result.valid, false);
  assert.match(result.reason, /lowercase/);
});

test('validatePassword rejects passwords without digits', () => {
  const result = validatePassword('Abcdefgh!');
  assert.equal(result.valid, false);
  assert.match(result.reason, /number/);
});

test('validatePassword rejects passwords without special characters', () => {
  const result = validatePassword('Abcdefg1');
  assert.equal(result.valid, false);
  assert.match(result.reason, /special character/);
});

test('validatePassword accepts valid passwords', () => {
  const valid = ['MyP@ssw0rd', 'Str0ng!Pass', 'Nokt@2024!', 'Pr0ductiv#ty'];
  for (const pw of valid) {
    const result = validatePassword(pw);
    assert.equal(result.valid, true, `Expected "${pw}" to be valid but got: ${JSON.stringify(result)}`);
  }
});

test('validatePassword rejects empty/null/undefined', () => {
  assert.equal(validatePassword('').valid, false);
  assert.equal(validatePassword(null).valid, false);
  assert.equal(validatePassword(undefined).valid, false);
});
