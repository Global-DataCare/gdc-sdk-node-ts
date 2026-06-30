import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EXAMPLE_OPENID_SMART_TOKEN_INPUT,
  EXAMPLE_SMART_PRESENTATION_SUBMISSION,
  EXAMPLE_SMART_TOKEN_RESPONSE,
  EXAMPLE_TENANT_ROUTE_CONTEXT,
  EXAMPLE_TOKEN_EXCHANGE_RESPONSE,
  EXAMPLE_TOKEN_EXCHANGE_SMART_INPUT,
  cloneExample,
} from 'gdc-common-utils-ts/examples';

import { requestSmartTokenWithDeps } from '../dist/index.js';

test('requestSmartTokenWithDeps uses token-exchange flow and updates cache', async () => {
  const cacheWrites = [];
  const calls = [];
  const result = await requestSmartTokenWithDeps({
    input: cloneExample(EXAMPLE_TOKEN_EXCHANGE_SMART_INPUT),
    routeCtx: cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
    baseUrl: 'http://localhost:3000',
    identityTokenExchangePath: (ctx) => `/host/cds-${ctx.jurisdiction}/v1/${ctx.sector}/${ctx.tenantId}/identity/auth/_exchange`,
    identityTokenExchangePollPath: (ctx) => `/host/cds-${ctx.jurisdiction}/v1/${ctx.sector}/${ctx.tenantId}/identity/auth/_exchange-response`,
    identityOpenIdSmartTokenPath: () => '/unused',
    identityOpenIdSmartTokenPollPath: () => '/unused',
    submitAndPoll: async (...args) => {
      calls.push(args);
      return cloneExample(EXAMPLE_TOKEN_EXCHANGE_RESPONSE);
    },
    setTokenCache: (key, token) => cacheWrites.push([key, token]),
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], '/host/cds-ES/v1/health-care/acme-id/identity/auth/_exchange');
  assert.equal(calls[0][1], '/host/cds-ES/v1/health-care/acme-id/identity/auth/_exchange-response');
  assert.equal(calls[0][2].grant_type, 'urn:ietf:params:oauth:grant-type:token-exchange');
  assert.equal(result.status, 'fetched');
  assert.equal(result.accessToken, 'smart-token-ctx-001');
  assert.equal(cacheWrites.length, 1);
});

test('requestSmartTokenWithDeps uses openid-smart flow when requested', async () => {
  const calls = [];
  const result = await requestSmartTokenWithDeps({
    input: {
      ...cloneExample(EXAMPLE_OPENID_SMART_TOKEN_INPUT),
      presentationSubmission: cloneExample(EXAMPLE_SMART_PRESENTATION_SUBMISSION),
    },
    routeCtx: cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
    baseUrl: 'http://localhost:3000',
    identityTokenExchangePath: () => '/unused',
    identityTokenExchangePollPath: () => '/unused',
    identityOpenIdSmartTokenPath: (ctx) => `/${ctx.tenantId}/cds-${ctx.jurisdiction}/v1/${ctx.sector}/identity/openid/smart/token`,
    identityOpenIdSmartTokenPollPath: (ctx) => `/${ctx.tenantId}/cds-${ctx.jurisdiction}/v1/${ctx.sector}/identity/openid/smart/_batch-response`,
    submitAndPoll: async (...args) => {
      calls.push(args);
      return cloneExample(EXAMPLE_SMART_TOKEN_RESPONSE);
    },
    setTokenCache: () => {},
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], '/acme-id/cds-ES/v1/health-care/identity/openid/smart/token');
  assert.equal(calls[0][2].body.client_id, 'device-1');
  assert.equal(calls[0][2].body.vp_token, EXAMPLE_OPENID_SMART_TOKEN_INPUT.vpToken);
  assert.equal(result.accessToken, 'smart-token-openid-001');
});

test('requestSmartTokenWithDeps can auto-build client_assertion for openid-smart flow', async () => {
  const calls = [];
  await requestSmartTokenWithDeps({
    input: {
      ...cloneExample(EXAMPLE_OPENID_SMART_TOKEN_INPUT),
      clientAssertionBuilder: {
        algorithm: 'ES256',
      },
    },
    routeCtx: cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
    baseUrl: 'http://localhost:3000',
    identityTokenExchangePath: () => '/unused',
    identityTokenExchangePollPath: () => '/unused',
    identityOpenIdSmartTokenPath: (ctx) => `/${ctx.tenantId}/cds-${ctx.jurisdiction}/v1/${ctx.sector}/identity/openid/smart/token`,
    identityOpenIdSmartTokenPollPath: (ctx) => `/${ctx.tenantId}/cds-${ctx.jurisdiction}/v1/${ctx.sector}/identity/openid/smart/_batch-response`,
    submitAndPoll: async (...args) => {
      calls.push(args);
      return cloneExample(EXAMPLE_SMART_TOKEN_RESPONSE);
    },
    setTokenCache: () => {},
  });

  assert.equal(calls.length, 1);
  assert.equal(typeof calls[0][2].body.client_assertion, 'string');
  assert.equal(calls[0][2].body.client_assertion_type, 'private_key_jwt');
  assert.match(calls[0][2].body.client_assertion, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
});

test('requestSmartTokenWithDeps returns failed for error status responses', async () => {
  const cacheWrites = [];
  const result = await requestSmartTokenWithDeps({
    input: {
      ...cloneExample(EXAMPLE_TOKEN_EXCHANGE_SMART_INPUT),
      smartTokenKind: 'token-exchange',
    },
    routeCtx: cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
    baseUrl: 'http://localhost:3000',
    identityTokenExchangePath: () => '/exchange',
    identityTokenExchangePollPath: () => '/exchange-response',
    identityOpenIdSmartTokenPath: () => '/unused',
    identityOpenIdSmartTokenPollPath: () => '/unused',
    submitAndPoll: async () => {
      const response = cloneExample(EXAMPLE_TOKEN_EXCHANGE_RESPONSE);
      response.poll.status = 500;
      response.poll.body = {
        error: 'server_error',
        access_token: 'unexpected-token',
      };
      return response;
    },
    setTokenCache: (key, token) => cacheWrites.push([key, token]),
  });

  assert.equal(result.status, 'failed');
  assert.equal(result.statusCode, 500);
  assert.equal(result.response.error, 'server_error');
  assert.equal(cacheWrites.length, 0);
});

test('requestSmartTokenWithDeps returns failed when access token is missing from a successful poll', async () => {
  const cacheWrites = [];
  const result = await requestSmartTokenWithDeps({
    input: {
      ...cloneExample(EXAMPLE_TOKEN_EXCHANGE_SMART_INPUT),
      smartTokenKind: 'token-exchange',
    },
    routeCtx: cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
    baseUrl: 'http://localhost:3000',
    identityTokenExchangePath: () => '/exchange',
    identityTokenExchangePollPath: () => '/exchange-response',
    identityOpenIdSmartTokenPath: () => '/unused',
    identityOpenIdSmartTokenPollPath: () => '/unused',
    submitAndPoll: async () => {
      const response = cloneExample(EXAMPLE_TOKEN_EXCHANGE_RESPONSE);
      response.poll.body = {
        token_type: 'Bearer',
        scope: EXAMPLE_TOKEN_EXCHANGE_RESPONSE.poll.body.scope,
      };
      return response;
    },
    setTokenCache: (key, token) => cacheWrites.push([key, token]),
  });

  assert.equal(result.status, 'failed');
  assert.equal(result.statusCode, 200);
  assert.equal(cacheWrites.length, 0);
});
