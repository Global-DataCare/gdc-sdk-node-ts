import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EXAMPLE_EMPLOYEE_DEVICE_ACTIVATION_INPUT,
  EXAMPLE_EMPLOYEE_DEVICE_DCR_RESPONSE,
  EXAMPLE_EMPLOYEE_DEVICE_EXCHANGE_RESPONSE,
  EXAMPLE_TENANT_ROUTE_CONTEXT,
  cloneExample,
} from 'gdc-common-utils-ts/examples';

import {
  activateEmployeeDeviceWithActivationRequestWithDeps,
  activateEmployeeDeviceWithActivationCodeWithDeps,
} from '../dist/index.js';

test('activateEmployeeDeviceWithActivationCodeWithDeps performs exchange then dcr', async () => {
  const calls = [];
  const result = await activateEmployeeDeviceWithActivationCodeWithDeps({
    routeCtx: cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
    input: {
      ...cloneExample(EXAMPLE_EMPLOYEE_DEVICE_ACTIVATION_INPUT),
      pollOptions: { timeoutMs: 1000, intervalMs: 1 },
    },
    identityTokenExchangePath: () => '/exchange',
    identityTokenExchangePollPath: () => '/exchange-response',
    identityDeviceDcrPath: () => '/dcr',
    identityDeviceDcrPollPath: () => '/dcr-response',
    submitAndPollWithBearerToken: async (bearerToken, submitPath, pollPath, payload) => {
      calls.push({ bearerToken, submitPath, pollPath, payload });
      if (submitPath === '/exchange') {
        return cloneExample(EXAMPLE_EMPLOYEE_DEVICE_EXCHANGE_RESPONSE);
      }
      return cloneExample(EXAMPLE_EMPLOYEE_DEVICE_DCR_RESPONSE);
    },
  });

  assert.equal(calls.length, 2);
  assert.equal(calls[0].bearerToken, 'employee-id-token-001');
  assert.equal(calls[1].bearerToken, 'initial-access-001');
  assert.equal(result.initialAccessToken, 'initial-access-001');
});

test('activateEmployeeDeviceWithActivationRequestWithDeps maps seconds-based poll options', async () => {
  const calls = [];
  const result = await activateEmployeeDeviceWithActivationRequestWithDeps({
    routeCtx: cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
    input: {
      ...cloneExample(EXAMPLE_EMPLOYEE_DEVICE_ACTIVATION_INPUT),
      timeoutSeconds: 5,
      intervalSeconds: 2,
    },
    activateEmployeeDeviceWithActivationCode: async (...args) => {
      calls.push(args);
      return {
        initialAccessToken: 'initial-access-001',
        exchange: cloneExample(EXAMPLE_EMPLOYEE_DEVICE_EXCHANGE_RESPONSE),
        dcr: cloneExample(EXAMPLE_EMPLOYEE_DEVICE_DCR_RESPONSE),
      };
    },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0][0].tenantId, 'acme-id');
  assert.deepEqual(calls[0][1].pollOptions, {
    timeoutMs: 5_000,
    intervalMs: 2_000,
  });
  assert.equal(result.initialAccessToken, 'initial-access-001');
});

test('activateEmployeeDeviceWithActivationCodeWithDeps rejects exchange responses without an initial access token', async () => {
  const calls = [];

  await assert.rejects(
    activateEmployeeDeviceWithActivationCodeWithDeps({
      routeCtx: cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
      input: cloneExample(EXAMPLE_EMPLOYEE_DEVICE_ACTIVATION_INPUT),
      identityTokenExchangePath: () => '/exchange',
      identityTokenExchangePollPath: () => '/exchange-response',
      identityDeviceDcrPath: () => '/dcr',
      identityDeviceDcrPollPath: () => '/dcr-response',
      submitAndPollWithBearerToken: async (bearerToken, submitPath, pollPath, payload) => {
        calls.push({ bearerToken, submitPath, pollPath, payload });
        const response = cloneExample(EXAMPLE_EMPLOYEE_DEVICE_EXCHANGE_RESPONSE);
        response.poll.body = { body: {} };
        return response;
      },
    }),
    /missing initial_access_token/,
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].bearerToken, 'employee-id-token-001');
});
