import test from 'node:test';
import assert from 'node:assert/strict';

import { pollUntilCompleteWithMethod } from '../dist/index.js';

test('pollUntilCompleteWithMethod retries accepted responses until completion', async () => {
  const calls = [];
  const responses = [
    { status: 202, body: { accepted: true }, retryAfterMs: 0 },
    { status: 200, body: { done: true } },
  ];

  const result = await pollUntilCompleteWithMethod(async (...args) => {
    calls.push(args);
    return responses.shift();
  }, '/poll', { thid: 'job-1' }, { timeoutMs: 1000, intervalMs: 0 });

  assert.deepEqual(result, {
    status: 200,
    body: { done: true },
    attempts: 2,
  });
  assert.equal(calls.length, 2);
});

test('pollUntilCompleteWithMethod returns terminal not-found statuses without retrying', async () => {
  const calls = [];

  const result = await pollUntilCompleteWithMethod(async (...args) => {
    calls.push(args);
    return { status: 404, body: { message: 'not found' } };
  }, '/poll', { thid: 'job-404' }, { timeoutMs: 1000, intervalMs: 0 });

  assert.deepEqual(result, {
    status: 404,
    body: { message: 'not found' },
    attempts: 1,
  });
  assert.equal(calls.length, 1);
});

test('pollUntilCompleteWithMethod throws when accepted polling exceeds timeout', async () => {
  const originalDateNow = Date.now;
  let nowCalls = 0;
  Date.now = () => {
    nowCalls += 1;
    return nowCalls < 3 ? 0 : 1_001;
  };

  try {
    await assert.rejects(
      pollUntilCompleteWithMethod(async () => ({ status: 202, body: { accepted: true } }), '/poll', { thid: 'job-timeout' }, {
        timeoutMs: 500,
        intervalMs: 0,
      }),
      /Polling timeout after 2 attempts \(500ms\)\./,
    );
  } finally {
    Date.now = originalDateNow;
  }
});
