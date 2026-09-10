// Flow contract: reuse shared test fixtures and canonical types; do not introduce duplicated literals.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const canonicalGuideUrl = new URL(
  '../docs/101-HIGH_LEVEL_CLINICAL_PROFILE_WRITES.md',
  import.meta.url,
);
const canonicalSnippetUrl = new URL(
  '../docs/snippets/subject-section-writes.ts',
  import.meta.url,
);

const readWhenPresent = (url) => (fs.existsSync(url) ? fs.readFileSync(url, 'utf8') : '');

test('canonical profile guide points to complete subject-section snippets', () => {
  const guide = readWhenPresent(canonicalGuideUrl);
  const snippet = readWhenPresent(canonicalSnippetUrl);

  assert.ok(guide, 'the canonical high-level clinical profile guide must exist');
  assert.ok(snippet, 'the copyable high-level clinical profile snippet must exist');

  assert.match(snippet, /registerIndividualOrganization/);
  assert.match(snippet, /confirmIndividualOrganizationOrder/);
  assert.match(snippet, /order\.controllerRelatedPersonIdentifier/);
  assert.match(snippet, /enrollIndividualControllerProfile/);
  assert.match(snippet, /openIndividualControllerProfile/);
  assert.doesNotMatch(snippet, /enrollAndOpenIndividualController/);
  assert.match(snippet, /urn:uuid:00000000-0000-4000-8000-000000000001/);
  assert.match(snippet, /RelatedPerson\.identifier/);
  assert.match(snippet, /Example shape:[\s\S]*did:web:/);
  assert.match(snippet, /Example shape: [A-Za-z0-9_-]{20,}/);
  assert.doesNotMatch(snippet, /RelatedPerson\/_search|relatedPersonSearchResponseBody/);
  assert.match(snippet, /readEmployeeProfessionalAssignmentIdentifier/);
  assert.match(snippet, /updateSubjectSection/);
  assert.match(snippet, /dataAuthorReference/);
  assert.match(snippet, /\.create\(\)/);
  assert.match(snippet, /\.update\(\)/);
  assert.match(snippet, /\.delete\(\)/);
  assert.doesNotMatch(snippet, /controllerRelationship\.id|practitionerRole\.id/);

  assert.match(guide, /superseded and intentionally removed/is);
  assert.match(guide, /Complete type-checked snippets/is);

  for (const document of [guide, snippet]) {
    assert.doesNotMatch(document, /new NodeHttpClient|NodeManagedWallet|packForRecipient|compact JWE|queue adapter/i);
    assert.doesNotMatch(document, /controllerRelationship\.id|practitionerRole\.id/);
  }
});

test('all broader clinical guides link to the canonical loaded-profile journey', () => {
  for (const relativePath of [
    '../README.md',
    '../docs/101-SDK_END_TO_END.md',
    '../docs/101-BFF_CLINICAL_WRITES.md',
    '../docs/101-MULTI_ACTOR_IPS_EXPORT.md',
  ]) {
    const document = fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8');
    assert.match(document, /101-HIGH_LEVEL_CLINICAL_PROFILE_WRITES\.md/);
    assert.doesNotMatch(document, /authenticatedAccountId|loadedActorProfile|recipient:\s*providerDid/);
  }
});
