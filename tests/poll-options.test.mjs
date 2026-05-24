import test from 'node:test';
import assert from 'node:assert/strict';

import { resolvePollOptionsFromSeconds } from '../dist/index.js';

test('resolvePollOptionsFromSeconds maps seconds to milliseconds and falls back to defaults', () => {
  assert.deepEqual(resolvePollOptionsFromSeconds(30, 2), {
    timeoutMs: 30_000,
    intervalMs: 2_000,
  });

  assert.deepEqual(resolvePollOptionsFromSeconds(undefined, undefined, {
    timeoutMs: 10_000,
    intervalMs: 1_500,
  }), {
    timeoutMs: 10_000,
    intervalMs: 1_500,
  });

  assert.equal(resolvePollOptionsFromSeconds(undefined, undefined), undefined);
});
