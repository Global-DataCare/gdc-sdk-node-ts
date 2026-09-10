// Flow contract: registration projects the SHA3-384 hosted individual DID and exposes the same member builder that GW validates during controller DCR.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EXAMPLE_API_ORGANIZATION_DID,
  EXAMPLE_INDIVIDUAL_ORGANIZATION_START_INPUT,
  EXAMPLE_INDIVIDUAL_ORGANIZATION_START_RESPONSE,
  EXAMPLE_DOCUMENT_REFERENCE_IDENTIFIER,
  EXAMPLE_KYC_CONTROLLER_UUID,
  EXAMPLE_KYC_CONTROLLER_IDENTIFIER,
  EXAMPLE_KYC_CONTROLLER_VERIFIED_AT,
  EXAMPLE_TENANT_ROUTE_CONTEXT,
  EXAMPLE_SUBJECT_DID,
  cloneExample,
} from 'gdc-common-utils-ts/examples';

import {
  buildIndividualMemberDidWebFromPrivateIdentifiers,
  createIndividualOnboardingEditor,
  readIndividualOrganizationBootstrapIdentity,
  registerIndividualOrganizationWithDeps,
  startIndividualOrganizationWithDeps,
} from '../dist/index.js';

test('registerIndividualOrganizationWithDeps accepts one high-level onboarding draft with KYC and signed PDF evidence', async () => {
  // Teaching goal: the application supplies one SDK-owned draft; it never
  // authors the GW Bundle, attachment, Organization.owner or RelatedPerson.
  const signedPdfBase64 = Buffer.from('certificate-signed-pdf', 'utf8').toString('base64');
  const onboardingDraft = createIndividualOnboardingEditor()
    .setKyc({
      profile: {
        id_number: EXAMPLE_KYC_CONTROLLER_IDENTIFIER,
        kyc_verified_at: EXAMPLE_KYC_CONTROLLER_VERIFIED_AT,
      },
      controllerEmail: 'controller@example.org',
      individualAlternateName: 'Charly',
    }, { self: false })
    .setControllerAlternateName('Controller example')
    .setSubjectAlternateName('Charly')
    .setPdf({
      subject: EXAMPLE_SUBJECT_DID,
      identifier: EXAMPLE_DOCUMENT_REFERENCE_IDENTIFIER,
      contentType: 'application/pdf',
      contentData: signedPdfBase64,
    })
    .buildDraft();
  const calls = [];

  await registerIndividualOrganizationWithDeps({
    input: {
      onboardingDraft,
      controllerIdentifier: EXAMPLE_KYC_CONTROLLER_UUID,
    },
    routeCtx: cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
    individualFamilyOrganizationBatchPath: () => '/submit',
    individualFamilyOrganizationPollPath: () => '/poll',
    submitAndPoll: async (...args) => {
      calls.push(args);
      return cloneExample(EXAMPLE_INDIVIDUAL_ORGANIZATION_START_RESPONSE);
    },
    getOfferIdFromResponse: () => 'urn:offer:evidence',
    getOfferPreviewFromResponse: () => ({ offerId: 'urn:offer:evidence' }),
  });

  const body = calls[0][2].body;
  assert.equal(body.resourceType, 'Bundle');
  assert.equal(body.attachments[0].media_type, 'application/pdf');
  assert.equal(body.attachments[0].data.base64, signedPdfBase64);
  assert.equal(body.data[0].resource.meta.kyc.profile.id_number, EXAMPLE_KYC_CONTROLLER_IDENTIFIER);
  assert.equal(
    body.data[0].resource.meta.claims['org.schema.Organization.owner.identifier.value'],
    EXAMPLE_KYC_CONTROLLER_UUID,
  );
  assert.equal(body.data[0].resource.meta.claims['org.schema.Service.category'], 'health-care');
  assert.equal(body.data[0].resource.meta.claims['org.schema.Person.identifier.value'], EXAMPLE_KYC_CONTROLLER_IDENTIFIER);
  assert.equal(body.data[0].resource.meta.claims.activationCode, undefined);
  assert.equal(body.data[0].resource.meta.claims.attester, undefined);
});

test('registerIndividualOrganizationWithDeps builds canonical registration payload and extracts offer', async () => {
  const calls = [];
  const result = await registerIndividualOrganizationWithDeps({
    input: {
      ...cloneExample(EXAMPLE_INDIVIDUAL_ORGANIZATION_START_INPUT),
      controllerIdentifier: EXAMPLE_KYC_CONTROLLER_UUID,
    },
    routeCtx: cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
    individualFamilyOrganizationBatchPath: (ctx) => `/${ctx.tenantId}/${ctx.jurisdiction}/${ctx.sector}/org/_batch`,
    individualFamilyOrganizationPollPath: (ctx) => `/${ctx.tenantId}/${ctx.jurisdiction}/${ctx.sector}/org/_batch-response`,
    submitAndPoll: async (...args) => {
      calls.push(args);
      const response = cloneExample(EXAMPLE_INDIVIDUAL_ORGANIZATION_START_RESPONSE);
      response.poll.body = {
        data: [{
          meta: { claims: {
            'org.schema.Offer.offeredBy': EXAMPLE_API_ORGANIZATION_DID,
            'org.schema.FamilyRegistration.status': 'new_created',
          } },
          resource: { resourceType: 'Organization', id: 'a87e5b15-aea4-4475-9c7c-40aa88354b6f' },
        }],
      };
      return { submit: response.submit, poll: response.poll };
    },
    assertFirstDidcommEntrySuccess: () => {},
    getOfferIdFromResponse: () => 'urn:offer:family-003',
    getOfferPreviewFromResponse: () => ({ offerId: 'urn:offer:family-003', amount: '0.00' }),
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], '/acme-id/ES/health-care/org/_batch');
  assert.equal(calls[0][1], '/acme-id/ES/health-care/org/_batch-response');
  assert.equal(calls[0][2].body.data[0].resource.meta.claims['org.schema.Organization.alternateName'], 'ana');
  assert.equal(calls[0][2].body.data[0].resource.meta.claims['org.schema.Organization.address.addressCountry'], undefined);
  assert.equal(calls[0][2].body.data[0].resource.meta.claims['org.schema.Organization.owner.email'], 'ana.parent@example.org');
  assert.equal(
    calls[0][2].body.data[0].resource.meta.claims['org.schema.Organization.owner.identifier.value'],
    EXAMPLE_KYC_CONTROLLER_UUID,
  );
  assert.equal(calls[0][2].body.data[0].resource.meta.claims['org.schema.Person.email'], 'ana.parent@example.org');
  assert.equal(calls[0][2].body.data[0].resource.meta.claims['org.schema.Person.hasOccupation.identifier.value'], 'RESPRSN');
  assert.deepEqual(calls[0][3], {
    timeoutMs: 7_000,
    intervalMs: 2_000,
  });
  assert.equal(result.offerId, 'urn:offer:family-003');
  assert.equal(result.offerPreview.amount, '0.00');
  assert.equal(result.registrationStatus, 'new_created');
  assert.equal(result.orderConfirmationRequired, true);
  assert.deepEqual(result.identity, {
    resourceId: 'a87e5b15-aea4-4475-9c7c-40aa88354b6f',
    secureIdTypeIndividual: 'UUID',
    secureIdValueIndividual: 'zG9H82pae9SCXvec3D4YKqhX8bj8F1mRgzxMEdwXXonT7BWsvsUiP2u52sWQTeESpoMee',
    providerDidWeb: EXAMPLE_API_ORGANIZATION_DID,
    subjectDid: `${EXAMPLE_API_ORGANIZATION_DID}:individual:UUID:zG9H82pae9SCXvec3D4YKqhX8bj8F1mRgzxMEdwXXonT7BWsvsUiP2u52sWQTeESpoMee`,
  });
});

test('registration requires subjectAlternateName only when no signed PDF can supply it', async () => {
  const onboardingDraft = createIndividualOnboardingEditor()
    .setControllerEmail('controller@example.org')
    .buildDraft();

  await assert.rejects(registerIndividualOrganizationWithDeps({
    input: { onboardingDraft },
    routeCtx: cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
    individualFamilyOrganizationBatchPath: () => '/submit',
    individualFamilyOrganizationPollPath: () => '/poll',
    submitAndPoll: async () => { throw new Error('must not submit'); },
    getOfferIdFromResponse: () => undefined,
    getOfferPreviewFromResponse: () => ({}),
  }), /subjectAlternateName.*required when signed PDF evidence is absent/);
});

test('registration accepts omitted subjectAlternateName when signed PDF evidence supplies it', async () => {
  const onboardingDraft = createIndividualOnboardingEditor()
    .setPdf({
      subject: EXAMPLE_SUBJECT_DID,
      identifier: EXAMPLE_DOCUMENT_REFERENCE_IDENTIFIER,
      contentType: 'application/pdf',
      contentData: Buffer.from('signed-pdf-with-subject-name').toString('base64'),
    })
    .buildDraft();

  const result = await registerIndividualOrganizationWithDeps({
    input: { onboardingDraft },
    routeCtx: cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
    individualFamilyOrganizationBatchPath: () => '/submit',
    individualFamilyOrganizationPollPath: () => '/poll',
    submitAndPoll: async () => cloneExample(EXAMPLE_INDIVIDUAL_ORGANIZATION_START_RESPONSE),
    getOfferIdFromResponse: () => 'urn:offer:signed-pdf',
    getOfferPreviewFromResponse: () => ({ offerId: 'urn:offer:signed-pdf' }),
  });

  assert.equal(result.offerId, 'urn:offer:signed-pdf');
});

test('registerIndividualOrganizationWithDeps marks an already-active registration as not requiring Order confirmation', async () => {
  const response = cloneExample(EXAMPLE_INDIVIDUAL_ORGANIZATION_START_RESPONSE);
  response.poll.body = {
    data: [{
      meta: { claims: {
        'org.schema.Offer.identifier': 'urn:offer:existing',
        'org.schema.FamilyRegistration.status': 'already_exists',
      } },
      resource: { id: 'a87e5b15-aea4-4475-9c7c-40aa88354b6f' },
    }],
  };

  const result = await registerIndividualOrganizationWithDeps({
    input: cloneExample(EXAMPLE_INDIVIDUAL_ORGANIZATION_START_INPUT),
    routeCtx: cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
    individualFamilyOrganizationBatchPath: () => '/submit',
    individualFamilyOrganizationPollPath: () => '/poll',
    submitAndPoll: async () => response,
    getOfferIdFromResponse: () => 'urn:offer:existing',
    getOfferPreviewFromResponse: () => ({ offerId: 'urn:offer:existing' }),
  });

  assert.equal(result.registrationStatus, 'already_exists');
  assert.equal(result.orderConfirmationRequired, false);
});

test('deprecated startIndividualOrganizationWithDeps delegates and rejects an incomplete registration', async () => {
  await assert.rejects(
    startIndividualOrganizationWithDeps({
      input: {
        alternateName: 'ana',
        controllerEmail: 'ana.parent@example.org',
      },
      routeCtx: cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
      individualFamilyOrganizationBatchPath: () => '/submit',
      individualFamilyOrganizationPollPath: () => '/poll',
      submitAndPoll: async () => {
        const response = cloneExample(EXAMPLE_INDIVIDUAL_ORGANIZATION_START_RESPONSE);
        return { submit: response.submit, poll: response.poll };
      },
      assertFirstDidcommEntrySuccess: () => {},
      getOfferIdFromResponse: () => undefined,
      getOfferPreviewFromResponse: () => ({}),
    }),
    /missing offerId/,
  );
});

test('registerIndividualOrganizationWithDeps rejects a non-UUID controller identity', async () => {
  await assert.rejects(registerIndividualOrganizationWithDeps({
    input: {
      ...cloneExample(EXAMPLE_INDIVIDUAL_ORGANIZATION_START_INPUT),
      controllerIdentifier: 'not-a-uuid',
    },
    routeCtx: cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
    individualFamilyOrganizationBatchPath: () => '/submit',
    individualFamilyOrganizationPollPath: () => '/poll',
    submitAndPoll: async () => { throw new Error('must not submit'); },
    getOfferIdFromResponse: () => undefined,
    getOfferPreviewFromResponse: () => ({}),
  }), /controllerIdentifier must be a UUID/);
});

test('readIndividualOrganizationBootstrapIdentity preserves the exact hosted provider DID returned by GW', () => {
  const providerDidWeb = 'did:web:globaldatacare.es:health-care:organization:taxid:VATES-B42215152';
  const identity = readIndividualOrganizationBootstrapIdentity({
    data: [{
      meta: { claims: { 'org.schema.Offer.offeredBy': providerDidWeb } },
      resource: { id: '4cad9239-4aa1-4caf-8f22-620588ca147e' },
    }],
  });

  assert.equal(identity?.providerDidWeb, providerDidWeb);
  assert.equal(identity?.secureIdTypeIndividual, 'UUID');
  assert.equal(
    identity?.subjectDid,
    `${providerDidWeb}:individual:UUID:${identity?.secureIdValueIndividual}`,
  );
});

test('buildIndividualMemberDidWebFromPrivateIdentifiers creates the exact DCR actor DID without a family path', () => {
  assert.equal(
    buildIndividualMemberDidWebFromPrivateIdentifiers({
      providerDidWeb: 'did:web:host.example.org:health-care:organization:taxid:VATES-B00112233',
      secureIdTypeIndividual: 'UUID',
      privateIdValueIndividual: 'a87e5b15-aea4-4475-9c7c-40aa88354b6f',
      secureIdTypeMember: 'EMAIL',
      privateIdValueMember: 'controller@example.org',
      roleType: 'http://terminology.hl7.org/CodeSystem/v3-RoleCode',
      roleValue: 'RESPRSN',
    }),
    'did:web:host.example.org:health-care:organization:taxid:VATES-B00112233:individual:UUID:zG9H82pae9SCXvec3D4YKqhX8bj8F1mRgzxMEdwXXonT7BWsvsUiP2u52sWQTeESpoMee:member:zG9DrMLpQW8eoCc9Ay9AFxuMGiswgJePpbUMz9svJCZ8tKjUd4xoExgCPA5jmHc6hPATJ:RESPRSN',
  );
});
