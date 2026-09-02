// Flow contract: reuse shared test fixtures and canonical types; do not introduce duplicated literals.
/**
 * Complete journey:
 * 1. receive one terminal asynchronous GW response;
 * 2. reject HTTP 200 when its Bundle contains an error OperationOutcome;
 * 3. accept only a Bundle whose internal operation succeeded;
 * 4. prove an expected negative result through its OperationOutcome diagnostics.
 * Authorization invariant: transport completion never changes business authorization.
 * Persistence invariant: tests declare success only from the terminal Bundle result.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  assertSuccessfulTerminalBundle,
  assertTerminalBundleFailure,
} from './helpers/terminal-bundle-assertions.mjs';

const success = {
  poll: {
    status: 200,
    body: {
      resourceType: 'Bundle',
      type: 'batch-response',
      data: [{ response: { status: '200' } }],
    },
  },
};

const failure = {
  poll: {
    status: 200,
    body: {
      resourceType: 'Bundle',
      type: 'batch-response',
      data: [{
        response: {
          status: '409',
          outcome: {
            resourceType: 'OperationOutcome',
            issue: [{ severity: 'error', code: 'conflict', diagnostics: 'Disable before purge.' }],
          },
        },
      }],
    },
  },
};

test('terminal Bundle helper rejects hidden OperationOutcome errors behind HTTP 200', () => {
  assert.throws(
    () => assertSuccessfulTerminalBundle(failure, 'purge'),
    /Disable before purge/,
  );
  assert.doesNotThrow(() => assertSuccessfulTerminalBundle(success, 'create'));
});

test('terminal Bundle helper proves an expected asynchronous failure', () => {
  assert.doesNotThrow(() => assertTerminalBundleFailure(failure, 'active purge', /disable before purge/i));
});

test('live E2E files cannot accept asynchronous success from HTTP status alone', () => {
  const liveFiles = [
    '101-live-full-cycle-bff-runtime.e2e.test.mjs',
    '101-organization-controller-lifecycle.live.test.mjs',
    'live-dialogue-consent-professional-access.e2e.test.mjs',
    'live-gw-node-runtime.e2e.test.mjs',
    'live-profile-runtime-individual.e2e.test.mjs',
    'live-profile-runtime-professional.e2e.test.mjs',
  ];
  for (const file of liveFiles) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.doesNotMatch(
      source,
      /assert\.equal\([^;]*?\.poll\.status\s*,\s*20[01]/s,
      `${file} must use the terminal Bundle assertion helper.`,
    );
  }
});
