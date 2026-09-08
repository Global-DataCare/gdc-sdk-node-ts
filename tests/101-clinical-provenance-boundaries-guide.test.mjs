// Flow contract: enrollment is technical; each document owns its author; the unlocked profile supplies only its attester; subject remains independent.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const guideUrl = new URL('../docs/101-CLINICAL_AUTHOR_ATTESTER_BOUNDARIES.md', import.meta.url);

test('canonical guide separates enrollment, document author, profile attester and subject', () => {
  const guide = fs.existsSync(guideUrl) ? fs.readFileSync(guideUrl, 'utf8') : '';

  assert.ok(guide, 'the author/attester boundary guide must exist');
  assert.match(guide, /enroll\(\{[\s\S]*activationCode:[\s\S]*idToken[\s\S]*\}\)/);
  assert.doesNotMatch(guide.match(/enroll\(\{[\s\S]*?\}\);/)?.[0] || '', /clinicalCreatorBinding/);
  assert.match(guide, /documentAuthorReference/);
  assert.match(guide, /const controllerRelatedPersonId = controllerRelationship\.id/);
  assert.match(guide, /reference: controllerRelatedPersonId/);
  assert.match(guide, /const professionalPractitionerRoleId = practitionerRole\.id/);
  assert.match(guide, /reference: professionalPractitionerRoleId/);
  assert.doesNotMatch(guide, /unlockedProfileAttesterReference/);
  assert.match(guide, /RelatedPerson/);
  assert.match(guide, /PractitionerRole/);
  assert.match(guide, /human|humano/i);
  assert.match(guide, /animal/i);
  assert.match(guide, /confirmIndividualOrganizationOrder\(\)/);
  assert.match(guide, /getLicense\(\)/);
});
