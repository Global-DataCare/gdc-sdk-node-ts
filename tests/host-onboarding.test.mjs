import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EXAMPLE_ACTIVATE_ORGANIZATION_FROM_ICA_PROOF_INPUT,
  EXAMPLE_HOST_ROUTE_CONTEXT,
  EXAMPLE_LEGAL_ORGANIZATION_ORDER_INPUT,
  EXAMPLE_LEGAL_ORGANIZATION_ORDER_RESPONSE,
  EXAMPLE_TENANT_IDENTIFIER,
  cloneExample,
} from 'gdc-common-utils-ts/examples';
import { ClaimsOrganizationSchemaorg } from 'gdc-common-utils-ts/constants/schemaorg';
import { OrganizationLifecycleEditor } from 'gdc-common-utils-ts';

import {
  confirmLegalOrganizationOrderWithDeps,
  HostLifecycleRequestType,
  NodeHttpClient,
  submitHostedTenantLifecycleWithDeps,
} from '../dist/index.js';

test('NodeHttpClient.activateOrganizationInGatewayFromIcaProof serializes vp_token and controller at body root', async () => {
  const client = new NodeHttpClient({
    baseUrl: 'http://localhost:3000',
  });

  const calls = [];
  client.submitAndPoll = async (...args) => {
    calls.push(args);
    return { submit: { status: 202, body: {} }, poll: { status: 200, body: {}, attempts: 1 } };
  };
  client.hostRegistryOrganizationActivatePath = () => '/host/activate';
  client.hostRegistryOrganizationActivatePollPath = () => '/host/activate-response';

  await client.activateOrganizationInGatewayFromIcaProof(
    cloneExample(EXAMPLE_HOST_ROUTE_CONTEXT),
    cloneExample(EXAMPLE_ACTIVATE_ORGANIZATION_FROM_ICA_PROOF_INPUT),
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], '/host/activate');
  assert.equal(calls[0][1], '/host/activate-response');
  assert.equal(calls[0][2].type, 'application/api+json');
  assert.equal(calls[0][2].meta.jws.protected.kid, EXAMPLE_ACTIVATE_ORGANIZATION_FROM_ICA_PROOF_INPUT.controller.publicKeyJwk.kid);
  assert.deepEqual(calls[0][2].meta.jws.protected.jwk, EXAMPLE_ACTIVATE_ORGANIZATION_FROM_ICA_PROOF_INPUT.controller.publicKeyJwk);
  assert.equal(calls[0][2].meta.jwe.header.skid, EXAMPLE_ACTIVATE_ORGANIZATION_FROM_ICA_PROOF_INPUT.controller.jwks.keys[0].kid);
  assert.equal(calls[0][2].body.vp_token, EXAMPLE_ACTIVATE_ORGANIZATION_FROM_ICA_PROOF_INPUT.vpToken);
  assert.deepEqual(calls[0][2].body.controller, EXAMPLE_ACTIVATE_ORGANIZATION_FROM_ICA_PROOF_INPUT.controller);
  assert.equal(calls[0][2].body.data[0].type, 'Organization-activation-request-v1.0');
});

test('confirmLegalOrganizationOrderWithDeps builds canonical order payload and routes', async () => {
  const calls = [];

  const result = await confirmLegalOrganizationOrderWithDeps({
    input: cloneExample(EXAMPLE_LEGAL_ORGANIZATION_ORDER_INPUT),
    hostCtx: cloneExample(EXAMPLE_HOST_ROUTE_CONTEXT),
    hostRegistryOrderBatchPath: (ctx) => `/host/${ctx.jurisdiction}/${ctx.sector}/order/_batch`,
    hostRegistryOrderPollPath: (ctx) => `/host/${ctx.jurisdiction}/${ctx.sector}/order/_batch-response`,
    submitAndPoll: async (...args) => {
      calls.push(args);
      return cloneExample(EXAMPLE_LEGAL_ORGANIZATION_ORDER_RESPONSE);
    },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], `/host/${EXAMPLE_HOST_ROUTE_CONTEXT.jurisdiction}/${EXAMPLE_HOST_ROUTE_CONTEXT.sector}/order/_batch`);
  assert.equal(calls[0][1], `/host/${EXAMPLE_HOST_ROUTE_CONTEXT.jurisdiction}/${EXAMPLE_HOST_ROUTE_CONTEXT.sector}/order/_batch-response`);
  assert.equal(calls[0][2].body.data[0].resource.meta.claims['Order.acceptedOffer.identifier'], 'offer-123');
  assert.deepEqual(calls[0][3], {
    timeoutMs: 12_000,
    intervalMs: 3_000,
  });
  assert.equal(result.poll.status, 200);
});

test('confirmLegalOrganizationOrderWithDeps rejects missing offerId', async () => {
  await assert.rejects(
    confirmLegalOrganizationOrderWithDeps({
      input: { offerId: '   ' },
      hostCtx: cloneExample(EXAMPLE_HOST_ROUTE_CONTEXT),
      hostRegistryOrderBatchPath: () => '/submit',
      hostRegistryOrderPollPath: () => '/poll',
      submitAndPoll: async () => cloneExample(EXAMPLE_LEGAL_ORGANIZATION_ORDER_RESPONSE),
    }),
    /requires offerId/,
  );
});

test('submitHostedTenantLifecycleWithDeps builds canonical host disable payload and routes', async () => {
  const calls = [];
  const organizationEditor = new OrganizationLifecycleEditor()
    .setIdentifierValue(EXAMPLE_TENANT_IDENTIFIER);

  const result = await submitHostedTenantLifecycleWithDeps({
    hostCtx: cloneExample(EXAMPLE_HOST_ROUTE_CONTEXT),
    input: {
      organizationEditor,
      timeoutSeconds: 12,
      intervalSeconds: 3,
    },
    requestType: HostLifecycleRequestType.Disable,
    submitPath: (ctx) => `/host/${ctx.jurisdiction}/${ctx.sector}/organization/_disable`,
    pollPath: (ctx) => `/host/${ctx.jurisdiction}/${ctx.sector}/organization/_disable-response`,
    thidPrefix: 'host-disable',
    submitAndPoll: async (...args) => {
      calls.push(args);
      return cloneExample(EXAMPLE_LEGAL_ORGANIZATION_ORDER_RESPONSE);
    },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], `/host/${EXAMPLE_HOST_ROUTE_CONTEXT.jurisdiction}/${EXAMPLE_HOST_ROUTE_CONTEXT.sector}/organization/_disable`);
  assert.equal(calls[0][1], `/host/${EXAMPLE_HOST_ROUTE_CONTEXT.jurisdiction}/${EXAMPLE_HOST_ROUTE_CONTEXT.sector}/organization/_disable-response`);
  assert.equal(calls[0][2].body.data[0].type, HostLifecycleRequestType.Disable);
  assert.equal(
    calls[0][2].body.data[0].resource.meta.claims[ClaimsOrganizationSchemaorg.identifierValue],
    EXAMPLE_TENANT_IDENTIFIER,
  );
  assert.deepEqual(calls[0][3], {
    timeoutMs: 12_000,
    intervalMs: 3_000,
  });
  assert.equal(result.poll.status, 200);
});

test('submitHostedTenantLifecycleWithDeps builds canonical host purge payload and routes', async () => {
  const calls = [];
  const organizationEditor = new OrganizationLifecycleEditor()
    .setIdentifierValue(EXAMPLE_TENANT_IDENTIFIER);

  await submitHostedTenantLifecycleWithDeps({
    hostCtx: cloneExample(EXAMPLE_HOST_ROUTE_CONTEXT),
    input: {
      organizationEditor,
    },
    requestType: HostLifecycleRequestType.Purge,
    submitPath: (ctx) => `/host/${ctx.jurisdiction}/${ctx.sector}/organization/_purge`,
    pollPath: (ctx) => `/host/${ctx.jurisdiction}/${ctx.sector}/organization/_purge-response`,
    thidPrefix: 'host-purge',
    submitAndPoll: async (...args) => {
      calls.push(args);
      return cloneExample(EXAMPLE_LEGAL_ORGANIZATION_ORDER_RESPONSE);
    },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0][2].body.data[0].type, HostLifecycleRequestType.Purge);
  assert.match(String(calls[0][2].thid || ''), /^host-purge-/);
});
