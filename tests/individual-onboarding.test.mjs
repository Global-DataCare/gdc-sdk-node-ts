import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EXAMPLE_INDIVIDUAL_ORGANIZATION_ORDER_INPUT,
  EXAMPLE_INDIVIDUAL_ORGANIZATION_ORDER_RESPONSE,
  EXAMPLE_TENANT_ROUTE_CONTEXT,
  cloneExample,
} from 'gdc-common-utils-ts/examples';

import { confirmIndividualOrganizationOrderWithDeps } from '../dist/index.js';

test('confirmIndividualOrganizationOrderWithDeps builds canonical family order payload and routes', async () => {
  const calls = [];

  const result = await confirmIndividualOrganizationOrderWithDeps({
    input: cloneExample(EXAMPLE_INDIVIDUAL_ORGANIZATION_ORDER_INPUT),
    routeCtx: cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
    individualFamilyOrderBatchPath: (ctx) => `/${ctx.tenantId}/${ctx.jurisdiction}/${ctx.sector}/family/_batch`,
    individualFamilyOrderPollPath: (ctx) => `/${ctx.tenantId}/${ctx.jurisdiction}/${ctx.sector}/family/_batch-response`,
    submitAndPoll: async (...args) => {
      calls.push(args);
      return cloneExample(EXAMPLE_INDIVIDUAL_ORGANIZATION_ORDER_RESPONSE);
    },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], '/acme-id/ES/health-care/family/_batch');
  assert.equal(calls[0][1], '/acme-id/ES/health-care/family/_batch-response');
  assert.equal(calls[0][2].body.data[0].resource.meta.claims['Order.acceptedOffer.identifier'], 'offer-family-1');
  assert.deepEqual(calls[0][3], {
    timeoutMs: 9_000,
    intervalMs: 2_000,
  });
  assert.equal(result.poll.status, 200);
});

test('confirmIndividualOrganizationOrderWithDeps rejects missing offerId', async () => {
  await assert.rejects(
    confirmIndividualOrganizationOrderWithDeps({
      input: { offerId: '' },
      routeCtx: cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
      individualFamilyOrderBatchPath: () => '/submit',
      individualFamilyOrderPollPath: () => '/poll',
      submitAndPoll: async () => cloneExample(EXAMPLE_INDIVIDUAL_ORGANIZATION_ORDER_RESPONSE),
    }),
    /requires offerId/,
  );
});
