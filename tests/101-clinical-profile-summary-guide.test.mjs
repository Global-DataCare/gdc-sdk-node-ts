// Flow contract: reuse shared test fixtures and canonical types; do not introduce duplicated literals.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const canonicalGuideUrl = new URL(
  '../docs/101-HIGH_LEVEL_CLINICAL_PROFILE_WRITES.md',
  import.meta.url,
);
const canonicalSnippetUrl = new URL(
  '../docs/snippets/high-level-clinical-profile-writes.ts',
  import.meta.url,
);

const readWhenPresent = (url) => (fs.existsSync(url) ? fs.readFileSync(url, 'utf8') : '');

test('canonical clinical profile guide covers both loaded-profile journeys through public facades', () => {
  const guide = readWhenPresent(canonicalGuideUrl);
  const snippet = readWhenPresent(canonicalSnippetUrl);

  assert.ok(guide, 'the canonical high-level clinical profile guide must exist');
  assert.ok(snippet, 'the copyable high-level clinical profile snippet must exist');

  assert.match(snippet, /loadBackendProfessionalProfile\(/);
  assert.match(snippet, /loadBackendIndividualControllerProfile\(/);
  assert.match(snippet, /loadBackendIndividualMemberProfile\(/);
  assert.match(snippet, /exportClinicalCreatorIps\(/);
  assert.match(snippet, /professionalProfile\.sdk\.updateClinicalSummary\(/);
  assert.match(snippet, /individualControllerProfile\.sdk\.importIpsOrFhirAndUpdateIndex\(/);
  assert.match(snippet, /individualControllerProfile\.sdk\.updateClinicalSummary\(/);
  assert.match(snippet, /individualMemberProfile\.sdk\.updateClinicalSummary\(/);
  assert.match(snippet, /providerDid:\s*indexProviderDid/);

  assert.match(guide, /individual.*owner.*subject/is);
  assert.match(guide, /index provider.*recipient/is);
  assert.match(guide, /professional organization.*author/is);
  assert.match(guide, /RelatedPerson.*author.*attester/is);
  assert.match(guide, /external IPS.*preserv/is);
  assert.match(guide, /(?:subset|subconjunto).*101-SDK_END_TO_END/is);

  for (const document of [guide, snippet]) {
    assert.doesNotMatch(document, /new NodeHttpClient|NodeManagedWallet|packForRecipient|compact JWE|queue adapter/i);
    assert.doesNotMatch(document, /authenticatedAccountId|loadedActorProfile|const\s+providerDid|recipient:\s*providerDid/);
    assert.doesNotMatch(document, /openProfessional\(|\btarget:\s*\{/);
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
