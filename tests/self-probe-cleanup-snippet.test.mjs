// Flow contract: reuse shared test fixtures and canonical types; do not introduce duplicated literals.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('documents authenticated owner-directory cleanup without requiring resourceId', () => {
  const snippet = readFileSync('docs/snippets/owned-individual-cleanup.ts', 'utf8');

  assert.match(snippet, /listOwnedFamilyOrganizations/);
  assert.match(snippet, /subject\.alternateName\.startsWith\(input\.alternateNamePrefix\)/);
  assert.match(snippet, /disableIndividual\([\s\S]*organizationClaims: input\.subject\.claims/);
  assert.match(snippet, /purgeIndividual\([\s\S]*organizationClaims: input\.subject\.claims/);
  assert.ok(snippet.indexOf('disableIndividual(') < snippet.indexOf('purgeIndividual('));
  assert.doesNotMatch(snippet, /controller@example|self-probe-[A-Za-z0-9]/);
});
