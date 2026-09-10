// Flow contract: reuse shared test fixtures and canonical types; do not introduce duplicated literals.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const guideUrl = new URL('../docs/101-CLINICAL_AUTHOR_ATTESTER_BOUNDARIES.md', import.meta.url);

test('canonical guide exposes a copyable subject-section flow without invented identifiers', () => {
  const guide = fs.existsSync(guideUrl) ? fs.readFileSync(guideUrl, 'utf8') : '';

  assert.ok(guide, 'the author/attester boundary guide must exist');
  assert.match(guide, /snippets\/subject-section-writes\.ts/);
  assert.match(guide, /updateSubjectSection/);
  assert.match(guide, /dataAuthorReference/);
  assert.match(guide, /session\.attester/);
  assert.match(guide, /controllerRelatedPersonIdentifier/);
  assert.match(guide, /urn:uuid:00000000-0000-4000-8000-000000000001/);
  assert.match(guide, /portal neither ingests nor searches for this primary\s+assignment/i);
  assert.match(guide, /readEmployeeProfessionalAssignmentIdentifier/);
  assert.doesNotMatch(guide, /controllerRelationship\.id|practitionerRole\.id|unlockedProfileAttesterReference/);
  assert.match(guide, /Composition-compatible/);
  assert.match(guide, /Provenance\.agent/);
  assert.match(guide, /confirmIndividualOrganizationOrder\(\)/);
  assert.match(guide, /getLicense\(\)/);
});
