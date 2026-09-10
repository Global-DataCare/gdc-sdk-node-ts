/**
 * Flow contract:
 * 1. The caller confirms the Offer returned by individual bootstrap.
 * 2. The SDK authors the canonical Order payload and polls GW.
 * 3. The SDK exposes the one-time controller activation code without making a
 *    portal traverse Bundle internals or know schema.org claim paths.
 */
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
      const response = cloneExample(EXAMPLE_INDIVIDUAL_ORGANIZATION_ORDER_RESPONSE);
      response.poll.body = {
        body: {
          data: [{
            type: 'Family-order-response-v1.0',
            resource: { meta: { claims: {
              'org.schema.IndividualProduct.serialNumber': 'individual-controller-activation-1',
            } } },
          }, {
            type: 'RelatedPerson',
            resource: {
              resourceType: 'RelatedPerson',
              id: 'urn:uuid:00000000-0000-4000-8000-000000000001',
              meta: { claims: {
                '@context': 'org.hl7.fhir.api',
                'org.hl7.fhir.api.RelatedPerson.identifier': 'urn:uuid:00000000-0000-4000-8000-000000000001',
                'org.hl7.fhir.api.RelatedPerson.patient': 'did:web:provider.example:individual:UUID:zSubject',
                'org.hl7.fhir.api.RelatedPerson.relationship': 'http://terminology.hl7.org/CodeSystem/v3-RoleCode|RESPRSN',
                'org.hl7.fhir.api.RelatedPerson.active': 'true',
              } },
            },
          }],
        },
      };
      return response;
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
  assert.equal(result.activationCode, 'individual-controller-activation-1');
  assert.equal(result.controllerAssignmentIdentifier, 'urn:uuid:00000000-0000-4000-8000-000000000001');
});

test('confirmIndividualOrganizationOrderWithDeps fails closed when GW omits the controller activation code', async () => {
  await assert.rejects(
    confirmIndividualOrganizationOrderWithDeps({
      input: cloneExample(EXAMPLE_INDIVIDUAL_ORGANIZATION_ORDER_INPUT),
      routeCtx: cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
      individualFamilyOrderBatchPath: () => '/submit',
      individualFamilyOrderPollPath: () => '/poll',
      submitAndPoll: async () => cloneExample(EXAMPLE_INDIVIDUAL_ORGANIZATION_ORDER_RESPONSE),
    }),
    /missing controller activation code/,
  );
});

test('confirmIndividualOrganizationOrderWithDeps fails closed when GW omits its automatic RESPRSN assignment', async () => {
  const response = cloneExample(EXAMPLE_INDIVIDUAL_ORGANIZATION_ORDER_RESPONSE);
  response.poll.body = {
    body: {
      data: [{
        type: 'Family-order-response-v1.0',
        resource: { meta: { claims: {
          'org.schema.IndividualProduct.serialNumber': 'individual-controller-activation-1',
        } } },
      }],
    },
  };
  await assert.rejects(
    confirmIndividualOrganizationOrderWithDeps({
      input: cloneExample(EXAMPLE_INDIVIDUAL_ORGANIZATION_ORDER_INPUT),
      routeCtx: cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
      individualFamilyOrderBatchPath: () => '/submit',
      individualFamilyOrderPollPath: () => '/poll',
      submitAndPoll: async () => response,
    }),
    /missing automatic controller RESPRSN assignment/,
  );
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
