import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildProfessionalDidWeb,
  buildSmartCompositionReadScope,
  HealthcareActorRoles,
  HealthcareConsentActions,
  HealthcareConsentPurposes,
} from 'gdc-common-utils-ts';
import {
  EXAMPLE_API_ORGANIZATION_DID,
  EXAMPLE_DEVICE_CLIENT_ID,
  EXAMPLE_EMAIL_PROFESSIONAL,
  EXAMPLE_SUBJECT_DID,
  EXAMPLE_TENANT_ROUTE_CONTEXT,
} from 'gdc-common-utils-ts/examples';

import {
  IndividualControllerSdk,
  ProfessionalSdk,
} from '../dist/index.js';

/**
 * Flow contract:
 * show the complete professional consent identity boundary without requiring
 * the app developer to construct LOINC literals, an audience URL, or a second
 * actor identifier.
 */
test('101: one professional DID is reused by employee identity, consent, VP and SMART', async () => {
  const calls = [];
  const runtimeClient = {
    async grantProfessionalAccess(ctx, input) {
      calls.push({ operation: 'grant', ctx, input });
      return {
        thid: 'consent-001',
        consent: { submit: { status: 202, body: {} }, poll: { status: 200, body: {}, attempts: 1 } },
        subjectIdentifier: input.subjectDid,
        actorIdentifier: input.actorId,
        consentClaims: {},
      };
    },
    async requestSmartToken(input) {
      calls.push({ operation: 'smart', input });
      return { status: 'fetched', accessToken: 'smart-token-001', tokenType: 'Bearer', scopes: input.scopes };
    },
  };
  const individualSdk = new IndividualControllerSdk(runtimeClient);
  const professionalSdk = new ProfessionalSdk(runtimeClient);

  // Step 1. Derive one stable actor DID. The email is normalized and hashed;
  // it is not embedded as plaintext in the DID path.
  const role = HealthcareActorRoles.GeneralistMedicalPractitioner;
  const professionalActorDid = buildProfessionalDidWeb({
    organizationDidWeb: EXAMPLE_API_ORGANIZATION_DID,
    email: EXAMPLE_EMAIL_PROFESSIONAL,
    role,
  });
  assert.equal(professionalActorDid.includes(EXAMPLE_EMAIL_PROFESSIONAL), false);

  // Step 2. Select consent actions from the shared registry. Do not copy LOINC
  // strings or add Consent.cruds to a clinical read.
  const consentActions = [
    HealthcareConsentActions.PatientSummaryDocument,
    HealthcareConsentActions.AllergiesAndIntolerances,
  ];

  // Step 3. The individual grants access to that exact professional DID.
  await individualSdk.grantProfessionalAccess(EXAMPLE_TENANT_ROUTE_CONTEXT, {
    subjectDid: EXAMPLE_SUBJECT_DID,
    actorId: professionalActorDid,
    actorRole: role,
    purpose: HealthcareConsentPurposes.Treatment,
    actions: consentActions,
  });

  // Step 4. The professional VP carries the same actor DID. The unsigned helper
  // is a demo/test fixture; production uses a signed VP from the protected wallet.
  const vpToken = professionalSdk.buildUnsignedIdentityVpJwt({
    clientId: EXAMPLE_DEVICE_CLIENT_ID,
    actorDid: professionalActorDid,
    email: EXAMPLE_EMAIL_PROFESSIONAL,
    role,
  });

  // Step 5. Build only the clinical scope covered by the consent. The runtime
  // resolves the exact SMART endpoint/audience; app code does not pass it.
  const clinicalScope = buildSmartCompositionReadScope({
    subjectDid: EXAMPLE_SUBJECT_DID,
    sections: consentActions,
  });
  await professionalSdk.requestSmartToken({
    idToken: 'professional-id-token',
    vpToken,
    actorDid: professionalActorDid,
    subjectDid: EXAMPLE_SUBJECT_DID,
    clientId: EXAMPLE_DEVICE_CLIENT_ID,
    purpose: HealthcareConsentPurposes.Treatment,
    scopes: [clinicalScope],
    smartTokenKind: 'openid-smart',
  });

  assert.equal(calls[0].input.actorId, professionalActorDid);
  assert.equal(calls[1].input.actorDid, professionalActorDid);
  assert.equal('audience' in calls[1].input, false);
  assert.deepEqual(calls[1].input.scopes, [clinicalScope]);
  assert.equal(calls[1].input.scopes.some((scope) => scope.includes('Consent.cruds')), false);
});
