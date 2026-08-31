// TDD: device activation keeps business fields inside the DIDComm body consumed by GW managers.
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
  NodeHttpClient,
  activateEmployeeDeviceWithActivationRequestWithDeps,
  activateEmployeeDeviceWithActivationCodeWithDeps,
  createProfileDeviceActivationRequest,
} from '../dist/index.js';

test('NodeHttpClient exposes the activation method required by actor facades', () => {
  assert.equal(typeof NodeHttpClient.prototype.activateEmployeeDeviceWithActivationRequest, 'function');
  assert.equal(typeof NodeHttpClient.prototype.activateProfileDeviceWithActivationRequest, 'function');
});

/**
 * Advanced runtime contract: build a typed activation request after a runtime
 * already owns the profile public keys.
 */
test('profile-device draft builds the DCR metadata behind typed application concepts', async () => {
  // Step 1. Start from continuation material returned by either organization onboarding flow.
  const draft = createProfileDeviceActivationRequest({
    activationCode: 'activation-code',
    idToken: 'signed-id-token',
  });

  // Step 2. Describe the portal installation and its public proof key.
  const request = draft
    .setClientInstanceId('portal-installation-1')
    .setClientName('Example Organization Portal')
    .setApplicationType('web')
    .setRedirectUris(['https://portal.example.org/auth/callback'])
    .setPublicJwks([{ kty: 'EC', crv: 'P-384', x: 'x', y: 'y', kid: 'portal-key-1' }])
    .build();

  // Step 3. The high-level request contains application concepts, not a hand-authored dcrPayload.
  assert.equal(request.deviceRegistration.clientInstanceId, 'portal-installation-1');
  assert.equal(request.deviceRegistration.applicationType, 'web');
  assert.equal('dcrPayload' in request, false);

  const calls = [];
  await activateEmployeeDeviceWithActivationRequestWithDeps({
    routeCtx: cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
    input: request,
    activateEmployeeDeviceWithActivationCode: async (_ctx, input) => {
      calls.push(input);
      return {
        initialAccessToken: 'initial-access-001',
        exchange: cloneExample(EXAMPLE_EMPLOYEE_DEVICE_EXCHANGE_RESPONSE),
        dcr: cloneExample(EXAMPLE_EMPLOYEE_DEVICE_DCR_RESPONSE),
      };
    },
  });

  assert.deepEqual(calls[0].dcrPayload, {
    application_type: 'web',
    client_name: 'Example Organization Portal',
    redirect_uris: ['https://portal.example.org/auth/callback'],
    jwks: { keys: [{ kty: 'EC', crv: 'P-384', x: 'x', y: 'y', kid: 'portal-key-1' }] },
    ext_device_info: {
      device_id: 'portal-installation-1',
      device_name: 'Example Organization Portal',
    },
  });
});

test('profile-device draft rejects incomplete registration instead of emitting partial OpenID metadata', () => {
  assert.throws(
    () => createProfileDeviceActivationRequest({
      activationCode: 'activation-code',
      idToken: 'signed-id-token',
    }).build(),
    /client instance id/i,
  );
});

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
  assert.equal(calls[0].payload.body.subject_token, 'ACT-001');
  assert.equal(calls[0].payload.body.client_instance_id, 'device-controller-001');
  assert.equal(calls[1].bearerToken, 'initial-access-001');
  assert.equal(calls[1].payload.body.code, 'ACT-001');
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

/**
 * Async GW failures are returned inside the poll envelope. The high-level
 * activation helper must preserve that diagnostic instead of misreporting the
 * secondary absence of an initial_access_token.
 */
test('activateEmployeeDeviceWithActivationCodeWithDeps surfaces the exchange OperationOutcome', async () => {
  const exchangeFailure = cloneExample(EXAMPLE_EMPLOYEE_DEVICE_EXCHANGE_RESPONSE);
  exchangeFailure.poll.body = {
    data: [{
      resourceType: 'OperationOutcome',
      issue: [{
        severity: 'error',
        code: 'business-rule',
        diagnostics: 'Verified identity does not authorize the requested tenant.',
      }],
    }],
  };

  await assert.rejects(
    activateEmployeeDeviceWithActivationCodeWithDeps({
      routeCtx: cloneExample(EXAMPLE_TENANT_ROUTE_CONTEXT),
      input: cloneExample(EXAMPLE_EMPLOYEE_DEVICE_ACTIVATION_INPUT),
      identityTokenExchangePath: () => '/exchange',
      identityTokenExchangePollPath: () => '/exchange-response',
      identityDeviceDcrPath: () => '/dcr',
      identityDeviceDcrPollPath: () => '/dcr-response',
      submitAndPollWithBearerToken: async () => exchangeFailure,
    }),
    /Verified identity does not authorize the requested tenant/,
  );
});
