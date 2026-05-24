import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EXAMPLE_INDIVIDUAL_ORGANIZATION_START_INPUT,
  EXAMPLE_INDIVIDUAL_ORGANIZATION_START_RESPONSE,
  EXAMPLE_TENANT_ROUTE_CONTEXT,
  cloneExample,
} from 'gdc-common-utils-ts/examples';

import { startIndividualOrganizationWithDeps } from '../dist/index.js';

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
  assert.equal(calls[0][2].body.data[0].resource.meta.claims['org.schema.Organization.owner.email'], 'ana.parent@example.org');
  assert.equal(calls[0][2].body.data[0].resource.meta.claims['org.schema.Person.email'], 'ana.parent@example.org');
  assert.equal(calls[0][2].body.data[0].resource.meta.claims['org.schema.Person.hasOccupation.identifier.value'], 'RESPRSN');
  assert.deepEqual(calls[0][3], {
    timeoutMs: 7_000,
    intervalMs: 2_000,
  });
  assert.equal(result.offerId, 'urn:offer:family-003');
  assert.equal(result.offerPreview.amount, '0.00');
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
