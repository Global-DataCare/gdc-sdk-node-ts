// Flow contract: reuse shared test fixtures and canonical types; do not introduce duplicated literals.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const guide = fs.readFileSync(
  new URL('../docs/101-SDK_END_TO_END.md', import.meta.url),
  'utf8',
);
const walletGuide = fs.readFileSync(
  new URL('../docs/101-WALLET_CONTEXT_AND_KEY_CUSTODY.md', import.meta.url),
  'utf8',
);

const authorizedSubjectGuide = fs.readFileSync(
  new URL('../docs/101-AUTHORIZED_SUBJECT_DIRECTORY.md', import.meta.url),
  'utf8',
);
const clinicalWriteGuide = fs.readFileSync(
  new URL('../docs/101-BFF_CLINICAL_WRITES.md', import.meta.url),
  'utf8',
);

test('101 runtime bootstrap keeps participant identity and wallet custody out of deployment env', () => {
  // A participant DID belongs to one onboarded organization profile. A global
  // process variable would collapse every tenant onto one participant.
  assert.doesNotMatch(
    guide,
    /const\s+participantDid\s*=\s*process\.env\.PARTICIPANT_DID/,
  );

  // SoftwareApplicationCredential issuance is not implemented by ICA yet, so
  // the executable 101 must not fabricate a mock credential or imply it is
  // part of today's bootstrap.
  assert.doesNotMatch(guide, /const\s+softwareApplicationCredentialMock\s*=/);
  assert.match(guide, /TODO: ICA-authorized software application identity/);

  // A random seed generated at startup changes the runtime keys and kid values
  // after every restart. The 101 must load the KMS-protected stable seed.
  assert.doesNotMatch(guide, /seedMaterial:\s*crypto\.randomBytes\(/);
  assert.match(guide, /portalKms\.decrypt/);
});

test('wallet custody 101 uses role-neutral user wallet names', () => {
  // Wallet custody is shared by controller, employee/professional and
  // individual-controller profiles. A controller-prefixed context would make
  // the generic key-derivation contract look specific to one actor kind.
  assert.doesNotMatch(walletGuide, /const\s+controllerWalletContext\s*=/);
  assert.match(walletGuide, /const\s+userWalletContext\s*=/);
  assert.match(walletGuide, /const\s+userPublicCommunicationJwks\s*=/);

  // The example must explain that communication keys are not the actor's
  // professional-role/person signing keys.
  assert.match(
    walletGuide,
    /not the actor's professional-role\/person signing key/,
  );
});

test('authorized-subject 101 separates signed OpenID discovery from VP and SMART authority', () => {
  assert.match(authorizedSubjectGuide, /listAuthorizedIndividualSubjects/);
  assert.match(authorizedSubjectGuide, /signed `id_token`/);
  assert.match(authorizedSubjectGuide, /does not prove a professional role/i);
  assert.match(authorizedSubjectGuide, /ServerProfileSessionManager/);
  assert.doesNotMatch(authorizedSubjectGuide, /License\/_search/);
  assert.doesNotMatch(authorizedSubjectGuide, /Organization\/_search/);
});

test('BFF clinical-write 101 separates section CRUD from document import', () => {
  assert.match(guide, /101-BFF_CLINICAL_WRITES\.md/);
  assert.match(clinicalWriteGuide, /IndividualControllerBackendRuntime/);
  assert.match(clinicalWriteGuide, /await individualControllerRuntime\.updateClinicalSection\(/);
  assert.match(clinicalWriteGuide, /\.create\(\)/);
  assert.match(clinicalWriteGuide, /\.update\(\)/);
  assert.match(clinicalWriteGuide, /\.delete\(\)/);
  assert.match(clinicalWriteGuide, /Communication\.topic/);
  assert.match(clinicalWriteGuide, /await individualControllerRuntime\.importIpsOrFhirAndUpdateIndex\(/);
  assert.match(clinicalWriteGuide, /Bundle\.type=document/);
  assert.match(clinicalWriteGuide, /Composition.*entry\[0\]/);
  assert.match(clinicalWriteGuide, /must not traverse|does not construct/i);
  assert.match(clinicalWriteGuide, /IndividualMemberSdk/);
  assert.match(clinicalWriteGuide, /ProfessionalSdk/);
  assert.match(clinicalWriteGuide, /submitter, not as\s+an additional author/i);
  assert.match(clinicalWriteGuide, /PractitionerRole -> organization/);
  assert.match(clinicalWriteGuide, /CompositionClaim\.Custodian/);
  assert.match(clinicalWriteGuide, /CompositionClaim\.Attester/);
  assert.match(clinicalWriteGuide, /CompositionClaim\.AttesterMode/);
  assert.match(clinicalWriteGuide, /CompositionClaim\.AttesterTime/);
  assert.match(clinicalWriteGuide, /profileManager\.exportClinicalCreatorIps\(/);
  assert.match(clinicalWriteGuide, /provenance\.authorReference/);
  assert.match(clinicalWriteGuide, /provenance\.attesters/);
  assert.match(clinicalWriteGuide, /PractitionerRole.*Practitioner.*Organization/s);
  assert.match(clinicalWriteGuide, /Composition\.date[\s\S]{0,80}strictly later/i);
  assert.match(clinicalWriteGuide, /does not implement the CID-mapping/i);
  assert.match(clinicalWriteGuide, /Playwright/);
});
