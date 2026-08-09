import assert from 'node:assert/strict';
import test from 'node:test';
import { logger, setLogLevel } from '../daemon/lib/logger.mjs';

test('logger exports debug/info/warn/error', () => {
  assert.equal(typeof logger.debug, 'function');
  assert.equal(typeof logger.info, 'function');
  assert.equal(typeof logger.warn, 'function');
  assert.equal(typeof logger.error, 'function');
});

test('logger.child creates a child logger', () => {
  const child = logger.child({ service: 'test' });
  assert.equal(typeof child.info, 'function');
  assert.equal(typeof child.error, 'function');
});

test('setLogLevel accepts valid levels', () => {
  setLogLevel('debug');
  setLogLevel('info');
  setLogLevel('warn');
  setLogLevel('error');
  setLogLevel('invalid'); // should default to info
});

test('logger methods do not throw', () => {
  logger.debug('debug message');
  logger.info('info message');
  logger.warn('warn message');
  logger.error('error message');
  logger.info('with meta', { key: 'value' });
});
