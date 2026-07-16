import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EXAMPLE_API_ORGANIZATION_DID,
  EXAMPLE_INDIVIDUAL_MULTIBASE_ID,
  EXAMPLE_INDIVIDUAL_ORGANIZATION_START_INPUT,
  EXAMPLE_INDIVIDUAL_ORGANIZATION_START_RESPONSE,
  EXAMPLE_TENANT_ROUTE_CONTEXT,
  cloneExample,
} from 'gdc-common-utils-ts/examples';

import {
  readIndividualOrganizationBootstrapIdentity,
  startIndividualOrganizationWithDeps,
} from '../dist/index.js';

test('startIndividualOrganizationWithDeps builds canonical registration payload and extracts offer', async () => {
  const calls = [];
  const result = await startIndividualOrganizationWithDeps({
    input: cloneExample(EXAMPLE_INDIVIDUAL_ORGANIZATION_START_INPUT),
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
  assert.equal(calls[0][2].body.data[0].resource.meta.claims['org.schema.Organization.address.addressCountry'], 'ES');
  assert.equal(calls[0][2].body.data[0].resource.meta.claims['org.schema.Organization.owner.email'], 'ana.parent@example.org');
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
    individualId: EXAMPLE_INDIVIDUAL_MULTIBASE_ID,
    providerDidWeb: EXAMPLE_API_ORGANIZATION_DID,
    subjectDid: `${EXAMPLE_API_ORGANIZATION_DID}:individual:multibase:${EXAMPLE_INDIVIDUAL_MULTIBASE_ID}`,
  });
});

test('startIndividualOrganizationWithDeps marks an already-active registration as not requiring Order confirmation', async () => {
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

  const result = await startIndividualOrganizationWithDeps({
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

test('startIndividualOrganizationWithDeps rejects missing offerId in registration response', async () => {
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

test('readIndividualOrganizationBootstrapIdentity preserves the exact hosted provider DID returned by GW', () => {
  const providerDidWeb = 'did:web:globaldatacare.es:health-care:organization:taxid:VATES-B42215152';
  const identity = readIndividualOrganizationBootstrapIdentity({
    data: [{
      meta: { claims: { 'org.schema.Offer.offeredBy': providerDidWeb } },
      resource: { id: '4cad9239-4aa1-4caf-8f22-620588ca147e' },
    }],
  });

  assert.equal(identity?.providerDidWeb, providerDidWeb);
  assert.equal(identity?.subjectDid, `${providerDidWeb}:individual:multibase:${identity?.individualId}`);
});
