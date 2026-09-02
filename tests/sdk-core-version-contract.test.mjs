// Flow contract: reuse shared test fixtures and canonical types; do not introduce duplicated literals.
// The Node runtime reuses the shared draft-Consent permission request and real GW Order readers without portal-side envelope traversal.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('pins the shared identity, activation-licence and draft-Consent contracts', () => {
  const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(packageJson.dependencies['gdc-sdk-core-ts'], '2.4.3');
  assert.equal(packageJson.dependencies['gdc-common-utils-ts'], '2.7.2');
});
