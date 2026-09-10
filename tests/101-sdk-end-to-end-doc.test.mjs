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
const highLevelClinicalProfileGuide = fs.readFileSync(
  new URL('../docs/101-HIGH_LEVEL_CLINICAL_PROFILE_WRITES.md', import.meta.url),
  'utf8',
);
const multiActorIpsGuide = fs.readFileSync(
  new URL('../docs/101-MULTI_ACTOR_IPS_EXPORT.md', import.meta.url),
  'utf8',
);
const readme = fs.readFileSync(new URL('../README.md', import.meta.url), 'utf8');

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

test('individual onboarding 101 separates registration, Order, enrollment, and profile opening', () => {
  assert.match(guide, /const\s+individualOrganizationRegistration\s*=\s*await\s+individualSdk\.registerIndividualOrganization/);
  assert.match(guide, /startIndividualOrganization\(\.\.\.\).*deprecated/is);
  assert.match(guide, /const\s+individualOrganizationOrder\s*=\s*await\s+individualSdk\.confirmIndividualOrganizationOrder/);
  assert.match(guide, /offerId:\s*individualOrganizationRegistration\.offerId/);
  assert.match(guide, /const\s+controllerActivationCode\s*=\s*individualOrganizationOrder\.activationCode/);
  assert.doesNotMatch(guide, /enrollAndOpenIndividualController/);
  assert.match(guide, /profileSessions\.enroll\(/);
  assert.match(guide, /profileSessions\.unlock\(/);
  assert.match(guide, /profileSessions\.openIndividualController\(/);
  assert.match(guide, /const\s+controllerRelatedPersonIdentifier\s*=\s*individualOrganizationOrder\.controllerRelatedPersonIdentifier/);
  assert.match(guide, /urn:uuid:00000000-0000-4000-8000-000000000001/);
  assert.match(guide, /RelatedPerson\.identifier/);
  assert.match(guide, /sessionId.*base64url/is);
  assert.match(guide, /controllerRelatedPersonIdentifier/);
  assert.doesNotMatch(guide, /relatedPersonSearchResponseBody|relatedPersonSelection/);
  assert.match(guide, /governed RelatedPerson identifier returned by the\s+Order result/i);
  assert.doesNotMatch(guide, /controllerRelationship\.id|clinicalCreatorBinding:\s*\{/);
  assert.match(guide, /does not create[\s\S]*wallet[\s\S]*does not register[\s\S]*DCR/is);
  assert.match(guide, /Token\/_exchange[\s\S]*Device\/_dcr/is);
  assert.match(guide, /does not need[\s\S]*getLicense\(\)/is);
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
  assert.match(clinicalWriteGuide, /clinicalCreator: exportedCreator/);
  assert.match(clinicalWriteGuide, /ClinicalSourceAuthorSelections\.Creator/);
  assert.match(clinicalWriteGuide, /RelatedPerson.*attester/is);
  assert.match(clinicalWriteGuide, /PractitionerRole.*attester/is);
  assert.match(clinicalWriteGuide, /individual.*author.*RelatedPerson.*attester/is);
  assert.match(clinicalWriteGuide, /RelatedPerson.*author.*attester/is);
  assert.match(clinicalWriteGuide, /browser.*must not.*author reference/is);
  assert.match(
    clinicalWriteGuide,
    /gwtemplate-node-ts\/blob\/main\/docs\/01-OVERVIEW-AND-GUIDES\/101-01\.N-AUTHENTICATED-CLINICAL-AUTHOR\.md/,
  );
  assert.match(readme, /Composition.*Bundle.*author.*attester/is);
  assert.match(readme, /101-BFF_CLINICAL_WRITES\.md/);
  assert.match(clinicalWriteGuide, /PractitionerRole.*Practitioner.*Organization/s);
  assert.match(clinicalWriteGuide, /Composition\.date[\s\S]{0,80}strictly later/i);
  assert.match(clinicalWriteGuide, /one transaction id.*per-resource.*CID.*version evidence/is);
  assert.match(clinicalWriteGuide, /BFF.*never.*ledger routing/is);
  assert.match(clinicalWriteGuide, /must not supply.*channel.*smart contract/is);
  assert.match(readme, /BFF.*never.*ledger routing/is);
  assert.match(clinicalWriteGuide, /Playwright/);
});

test('high-level clinical profile 101 is one sendable link that separates one-time enrollment from normal writes', () => {
  assert.match(highLevelClinicalProfileGuide, /superseded and intentionally removed/is);
  assert.match(highLevelClinicalProfileGuide, /subject-section-writes\.ts/);
  assert.match(highLevelClinicalProfileGuide, /RelatedPerson.*returned automatically by Order confirmation/is);
  assert.match(highLevelClinicalProfileGuide, /PractitionerRole.*Employee creation receipt/is);
  assert.match(highLevelClinicalProfileGuide, /dataAuthorReference/);
  assert.match(highLevelClinicalProfileGuide, /updateSubjectSection/);
});

test('multi-actor IPS export 101 numbers the source, attester and aggregate-read journeys', () => {
  assert.match(multiActorIpsGuide, /Journey 1.*external IPS import/is);
  assert.match(multiActorIpsGuide, /Journey 2.*individual controller/is);
  assert.match(multiActorIpsGuide, /Journey 3.*caregiver/is);
  assert.match(multiActorIpsGuide, /Journey 4.*aggregated IPS export/is);
  assert.match(multiActorIpsGuide, /LOINC.*29463-7/is);
  assert.match(multiActorIpsGuide, /UCUM.*kg/is);
  assert.match(multiActorIpsGuide, /Organization.*Practitioner.*PractitionerRole.*RelatedPerson/is);
  assert.match(multiActorIpsGuide, /Composition\.author.*stable FHIR provenance/is);
  assert.match(multiActorIpsGuide, /did:web:api\.acme\.org:employee:zW1pca8dQVVz2apBk8A1CWJ8VSHgheXpRZoZtqwhnkHjFkV:ISCO-08\|2211/);
  assert.match(multiActorIpsGuide, /did:web:host\.example\.com:health-care:organization:taxid:ES-B00112233:individual:UUID:zG9H82pae9SCXvec3D4YKqhX8bj8F1mRgzxMEdwXXonT7BWsvsUiP2u52sWQTeESpoMee:member:zG9FEVaXcQgzppJZUe7WwnqbM1mqTLbktoPSbPvMj2T6fj121vncQCbKyqh4BTYtSh2Tj:RESPRSN/);
  assert.match(multiActorIpsGuide, /urn:cds-es:v1:organization:tax:ES-B00112233/);
  assert.match(multiActorIpsGuide, /urn:cds-es:v1:organization:tax:ES-B00112233:member:zG9Gjhm4F9WwjUbk4D2sAL1wDj5MWuXsJooWPYDG5XYKURBQa4Q7wXttzusFntw6tXH3F:ISCO-08\|2211/);
  assert.match(multiActorIpsGuide, /urn:cds-<jurisdiction>.*role-license/is);
  assert.match(multiActorIpsGuide, /names\s+a licensed seat, not the author organization/i);
  assert.match(multiActorIpsGuide, /SHA3-384.*base58btc/is);
  assert.match(multiActorIpsGuide, /cloneImportedClinicalDocumentForDemo[\s\S]*clinicalCreator/);
  assert.match(multiActorIpsGuide, /Composition\.attester.*PractitionerRole.*RelatedPerson/is);
  assert.match(multiActorIpsGuide, /sender.*audit.*transport/is);
});
