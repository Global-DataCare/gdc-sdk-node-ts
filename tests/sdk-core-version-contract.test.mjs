// Flow contract: reuse shared test fixtures and canonical types; do not introduce duplicated literals.
// The Node runtime re-exports the SDK Core reader that understands real GW Order entry claims without portal-side envelope traversal.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('pins the SDK Core patch that reads activation licences from Order entry claims', () => {
  const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(packageJson.dependencies['gdc-sdk-core-ts'], '2.4.1');
  assert.equal(packageJson.dependencies['gdc-common-utils-ts'], '2.7.0');
});
